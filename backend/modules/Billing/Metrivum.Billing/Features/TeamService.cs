using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Notifications.Contracts;
namespace Metrivum.Billing.Features;

public sealed record TeamDto(Guid Id, string Name, bool IsOwner, bool IsMember, int Members,
    string Role, string Status, string Description, long Version, int PurchasedSeats, int OccupiedSeats,
    DateTimeOffset? PeriodEnd, DateTimeOffset? DissolutionAt, string[] AllowedActions, Guid? PendingOwnerId);
public sealed record TeamInviteRequest(string Username, string Role = "Member");
public sealed record TeamDecisionRequest(bool Accept);
public sealed record TeamRequestDto(Guid Id, Guid TeamId, string TeamName, string DisplayName, string Kind, string Status, bool CanDecide, string Role, DateTimeOffset? ExpiresAt);
public sealed record TeamRequestResultDto(Guid Id, Guid TeamId, Guid UserId, string Kind, string Status,
    DateTimeOffset CreatedAt, Guid InviterId, string Role, DateTimeOffset? ExpiresAt, DateTimeOffset? DecidedAt);
public sealed record TeamHomeDto(IReadOnlyList<TeamDto> Teams, IReadOnlyList<TeamRequestDto> Requests);
public sealed record TeamMemberDto(Guid UserId, string DisplayName, string? Username, string Role, DateTimeOffset JoinedAt);
public sealed record TeamUpdateRequest(string Name, string Description, long Version);
public sealed record TeamRoleRequest(string Role, long Version);
public sealed record TeamVersionRequest(long Version);
public sealed record TeamDissolutionRequest(long Version, bool Confirmed);
public sealed record TeamCancelDissolutionRequest(long Version, bool ResumeRenewal = false);
public sealed record TeamOwnershipRequest(Guid RecipientUserId, long Version);

/// <summary>Manages team membership, invitations and organization state in the Billing database.</summary>
public sealed class TeamService(BillingDbContext db, IAccountContext accounts, IAccountDirectory directory,
    ModuleTransaction transaction, TimeProvider clock, INotificationPublisher? notifications = null, ITeamLifecycle? lifecycle = null, ILogger<TeamService>? logger = null)
{
    // Organization discovery and unsolicited join requests are superseded by recipient invitations.
    public async Task<TeamDto[]> SearchAsync(string? search, CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        return [];
    }
    public async Task<TeamHomeDto> HomeAsync(CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        var teams = await db.Teams.AsNoTracking().Where(x => x.Status != "Dissolved" && db.TeamMemberships.Any(m => m.TeamId == x.Id && m.UserId == accounts.UserId && m.Status == "Active")).ToArrayAsync(ct);
        var result = new List<TeamDto>();
        foreach (var team in teams)
            result.Add(await Dto(team, ct));
        var managed = result.Where(x => x.Role is "Owner" or "Admin").Select(x => x.Id).ToArray();
        var requests = await db.TeamRequests.AsNoTracking().Where(x => x.Kind == "Invite" && (x.UserId == accounts.UserId || managed.Contains(x.TeamId))).OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync(ct);
        var names = await directory.GetAccountsAsync(requests.Select(x => x.UserId).Distinct().ToArray(), ct);
        var ids = requests.Select(x => x.TeamId).Distinct().ToArray();
        var teamNames = await db.Teams.Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        return new(result, requests.Select(x => new TeamRequestDto(x.Id, x.TeamId, teamNames[x.TeamId], names.GetValueOrDefault(x.UserId)?.DisplayName ?? "Member", x.Kind,
            x.Status == "Pending" && x.ExpiresAt <= clock.GetUtcNow() ? "Expired" : x.Status,
            x.Status == "Pending" && x.ExpiresAt > clock.GetUtcNow() && x.UserId == accounts.UserId, x.Role, x.ExpiresAt)).ToArray());
    }
    public async Task<TeamMemberDto[]> MembersAsync(Guid id, CancellationToken ct, int? page = null, int? pageSize = null)
    {
        await Visible(id, ct);
        var query = db.TeamMemberships.AsNoTracking().Where(x => x.TeamId == id && x.Status == "Active")
            .OrderBy(x => x.JoinedAt).ThenBy(x => x.UserId).AsQueryable();
        // Existing assignment selectors still consume the complete authorized roster.
        if (page.HasValue || pageSize.HasValue)
        {
            var number = page ?? 1;
            var size = pageSize ?? 25;
            if (number is < 1 or > 1000000 || size is < 1 or > 100)
                throw ApiException.Invalid("Page must be 1 to 1000000 and pageSize 1 to 100.");
            query = query.Skip((number - 1) * size).Take(size);
        }
        var members = await query.ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(members.Select(x => x.UserId).ToArray(), ct);
        return members.Select(x => new TeamMemberDto(x.UserId, people.GetValueOrDefault(x.UserId)?.DisplayName ?? "Member", people.GetValueOrDefault(x.UserId)?.Username, x.Role, x.JoinedAt)).ToArray();
    }
    public Task<TeamRequestResultDto> RequestAsync(Guid id, TeamInviteRequest? invite, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        if (invite is null)
            throw ApiException.Conflict("Ask a Team administrator for an invitation.");
        var team = await Locked(id, token);
        var actor = await Admin(team, token);
        var subscription = await Active(team, token);
        if (await db.TeamMemberships.CountAsync(x => x.TeamId == team.Id && x.Status == "Active", token) >= subscription.PurchasedSeats)
            throw new ApiException(409, "TEAM_SEATS_FULL", "The workspace coach seat limit is reached.");
        Role(invite.Role);
        if (invite.Role == "Admin" && actor.Role != "Owner")
            throw ApiException.NotFound();
        if (string.IsNullOrWhiteSpace(invite.Username) || invite.Username.Trim().Length > 80)
            throw ApiException.Invalid("A valid username is required.");
        var target = await directory.ResolveExactUsernameAsync(invite.Username.Trim(), token) ?? throw ApiException.NotFound();
        if (!target.Roles.Contains(AccountRole.Coach) || target.UserId == accounts.UserId)
            throw ApiException.Invalid("Invite another coach account.");
        if (await db.TeamMemberships.AnyAsync(x => x.UserId == target.UserId && x.Status == "Active", token))
            throw ApiException.Conflict("This coach already belongs to a Team.");
        var now = clock.GetUtcNow();
        var existing = await db.TeamRequests.SingleOrDefaultAsync(x => x.TeamId == id && x.UserId == target.UserId && x.Kind == "Invite" && x.Status == "Pending", token);
        if (existing is not null && existing.ExpiresAt > now)
            return RequestResult(existing);
        if (existing is not null)
        {
            existing.Status = "Expired";
            await db.SaveChangesAsync(token);
        }
        if (await db.TeamRequests.CountAsync(x => x.InviterId == accounts.UserId && x.CreatedAt > now.AddHours(-1), token) >= 20)
            throw new ApiException(429, "TEAM_INVITATION_LIMIT", "Try inviting more coaches later.");
        var request = new TeamRequest { Id = Guid.NewGuid(), TeamId = id, UserId = target.UserId, InviterId = accounts.UserId, Kind = "Invite", Role = invite.Role, CreatedAt = now, ExpiresAt = now.AddDays(7) };
        db.TeamRequests.Add(request);
        Audit(team, "MemberInvited", target.UserId);
        await Notify(request.UserId, team, "TeamInvitation", request.Id.ToString(), token);
        await db.SaveChangesAsync(token);
        return RequestResult(request);
    }, ct);
    public Task<TeamRequestResultDto> DecideAsync(Guid id, bool accept, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:user:" + accounts.UserId}, 0))", token);
        var request = await db.TeamRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == accounts.UserId && x.Kind == "Invite", token) ?? throw ApiException.NotFound();
        var team = await Locked(request.TeamId, token);
        await db.Entry(request).ReloadAsync(token);
        if (request.Status != "Pending")
            return RequestResult(request);
        if (request.ExpiresAt <= clock.GetUtcNow())
            throw ApiException.Conflict("This invitation expired.");
        if (accept)
        {
            await accounts.RequireCoachAsync(token);
            var subscription = await Active(team, token);
            if (await db.TeamMemberships.AnyAsync(x => x.UserId == accounts.UserId && x.Status == "Active", token))
                throw ApiException.Conflict("Leave your current Team before accepting another invitation.");
            if (await db.TeamMemberships.CountAsync(x => x.TeamId == team.Id && x.Status == "Active", token) >= subscription.PurchasedSeats)
                throw new ApiException(409, "TEAM_SEATS_FULL", "The workspace coach seat limit is reached. Upgrade the workspace or remove an unused membership.");
            var member = await db.TeamMemberships.SingleOrDefaultAsync(x => x.TeamId == team.Id && x.UserId == accounts.UserId, token);
            if (member is null)
                db.TeamMemberships.Add(new()
                {
                    TeamId = team.Id,
                    UserId = accounts.UserId,
                    Role = request.Role,
                    JoinedAt = clock.GetUtcNow()
                });
            else
            {
                member.Status = "Active";
                member.Role = request.Role;
                member.JoinedAt = clock.GetUtcNow();
                member.EndedAt = null;
            }
            // Joining never changes a separately paid individual subscription.
        }
        request.Status = accept ? "Accepted" : "Declined";
        request.DecidedAt = clock.GetUtcNow();
        Audit(team, "Invitation" + request.Status, accounts.UserId);
        await Notify(team.OwnerId, team, "TeamInvitation" + request.Status, request.Id.ToString(), token);
        await db.SaveChangesAsync(token);
        return RequestResult(request);
    }, ct);
    private static TeamRequestResultDto RequestResult(TeamRequest request) => new(request.Id, request.TeamId, request.UserId,
        request.Kind, request.Status, request.CreatedAt, request.InviterId, request.Role, request.ExpiresAt, request.DecidedAt);

    public Task RevokeAsync(Guid id, Guid requestId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var team = await Locked(id, token);
        await Admin(team, token);
        var request = await db.TeamRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.TeamId == id, token) ?? throw ApiException.NotFound();
        if (request.Status != "Pending")
            return;
        request.Status = "Revoked";
        request.DecidedAt = clock.GetUtcNow();
        Audit(team, "InvitationRevoked", request.UserId);
        await db.SaveChangesAsync(token);
    }, ct);
    public Task<TeamDto> UpdateAsync(Guid id, TeamUpdateRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var team = await Locked(id, token);
        await Owner(team, token);
        Version(team, request.Version);
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80 || request.Description.Length > 1000)
            throw ApiException.Invalid("Provide a Team name up to 80 and description up to 1000 characters.");
        team.Name = request.Name.Trim();
        team.Description = request.Description.Trim();
        Audit(team, "ProfileUpdated");
        await db.SaveChangesAsync(token);
        return await Dto(team, token);
    }, ct);
    public Task ChangeRoleAsync(Guid id, Guid user, TeamRoleRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var team = await Locked(id, token);
        await Owner(team, token);
        Version(team, request.Version);
        Role(request.Role);
        var member = await Member(id, user, token);
        if (member.Role == "Owner")
            throw ApiException.Conflict("Use ownership transfer to change the owner.");
        member.Role = request.Role;
        Audit(team, "RoleChanged:" + request.Role, user);
        await db.SaveChangesAsync(token);
    }, ct);
    public Task RemoveAsync(Guid id, Guid user, long version, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var team = await Locked(id, token);
        Version(team, version);
        var member = await Member(id, user, token);
        if (user != accounts.UserId)
        {
            var actor = await Admin(team, token);
            if (member.Role == "Admin" && actor.Role != "Owner")
                throw ApiException.NotFound();
        }
        else
            await Visible(id, token);
        if (member.Role == "Owner")
            throw ApiException.Conflict("Transfer ownership or schedule dissolution before leaving.");
        member.Status = "Ended";
        member.EndedAt = clock.GetUtcNow();
        if (lifecycle is null)
            throw new InvalidOperationException("Team lifecycle integration is not registered.");
        await lifecycle.RemoveCoachAsync(id, user, token);
        Audit(team, "MemberRemoved", user);
        await Notify(user, team, "TeamMembershipEnded", team.Version.ToString(), token);
        await db.SaveChangesAsync(token);
    }, ct);
    public Task<TeamDto> ScheduleDissolutionAsync(Guid id, TeamDissolutionRequest request, ClaimsPrincipal principal, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        TeamSecurity.RequireRecentAuthentication(principal, clock.GetUtcNow());
        var team = await Locked(id, token);
        await OwnerIdentity(team, token);
        Version(team, request.Version);
        if (!request.Confirmed)
            throw ApiException.Invalid("Explicitly confirm the dissolution consequences.");
        if (lifecycle is null)
            throw new InvalidOperationException("Team lifecycle integration is not registered.");
        await lifecycle.CheckDissolutionAsync(id, token);
        var subscription = await db.Set<TeamPlatformSubscription>().SingleAsync(x => x.TeamId == id, token);
        team.DissolutionAt = subscription.PeriodEnd > clock.GetUtcNow() ? subscription.PeriodEnd : clock.GetUtcNow();
        team.Status = "DissolutionScheduled";
        subscription.AutoRenew = false;
        subscription.Version++;
        Audit(team, "DissolutionScheduled");
        await NotifyMembers(team, "TeamDissolutionScheduled", token);
        await db.SaveChangesAsync(token);
        return await Dto(team, token);
    }, ct);
    public Task<TeamDto> CancelDissolutionAsync(Guid id, TeamCancelDissolutionRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var team = await Locked(id, token);
        await Owner(team, token);
        Version(team, request.Version);
        if (team.Status != "DissolutionScheduled" || team.DissolutionAt <= clock.GetUtcNow())
            throw ApiException.Conflict("There is no future dissolution to cancel.");
        if (request.ResumeRenewal)
            throw ApiException.Invalid("Cancel dissolution first, then explicitly enable renewal with a payment method in Billing.");
        team.DissolutionAt = null;
        team.Status = "Active";
        Audit(team, "DissolutionCancelled");
        await NotifyMembers(team, "TeamDissolutionCancelled", token);
        await db.SaveChangesAsync(token);
        return await Dto(team, token);
    }, ct);
    public Task RequestOwnershipAsync(Guid id, TeamOwnershipRequest request, ClaimsPrincipal principal, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        TeamSecurity.RequireRecentAuthentication(principal, clock.GetUtcNow());
        var team = await Locked(id, token);
        await Owner(team, token);
        Version(team, request.Version);
        if (request.RecipientUserId == accounts.UserId)
            throw ApiException.Invalid("Choose another active member.");
        await Member(id, request.RecipientUserId, token);
        team.PendingOwnerId = request.RecipientUserId;
        team.OwnershipExpiresAt = clock.GetUtcNow().AddDays(1);
        Audit(team, "OwnershipTransferRequested", request.RecipientUserId);
        await Notify(request.RecipientUserId, team, "TeamOwnershipTransfer", team.Version.ToString(), token);
        await db.SaveChangesAsync(token);
    }, ct);
    public Task AcceptOwnershipAsync(Guid id, long version, ClaimsPrincipal principal, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        TeamSecurity.RequireRecentAuthentication(principal, clock.GetUtcNow());
        var team = await Locked(id, token);
        await Active(team, token);
        Version(team, version);
        if (team.PendingOwnerId != accounts.UserId || team.OwnershipExpiresAt <= clock.GetUtcNow())
            throw ApiException.NotFound();
        var recipient = await Member(id, accounts.UserId, token);
        var previous = await Member(id, team.OwnerId, token);
        previous.Role = "Admin";
        await db.SaveChangesAsync(token);
        recipient.Role = "Owner";
        team.OwnerId = recipient.UserId;
        team.PendingOwnerId = null;
        team.OwnershipExpiresAt = null;
        var subscription = await db.Set<TeamPlatformSubscription>().SingleAsync(x => x.TeamId == id, token);
        subscription.AutoRenew = false;
        subscription.PaymentMethodId = null;
        subscription.Version++;
        Audit(team, "OwnershipTransferred", recipient.UserId);
        await NotifyMembers(team, "TeamOwnershipChanged", token);
        await db.SaveChangesAsync(token);
    }, ct);
    public async Task<int> ProcessTransitionsAsync(int maximum, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var ids = await db.Teams.AsNoTracking().Where(x => x.Status == "DissolutionScheduled" && x.DissolutionAt <= now).OrderBy(x => x.DissolutionAt).Select(x => x.Id).Take(maximum).ToArrayAsync(ct);
        var count = 0;
        foreach (var id in ids)
        {
            try
            {
                await transaction.RunAsync(async token =>
            {
                var team = await Locked(id, token);
                if (team.Status != "DissolutionScheduled" || team.DissolutionAt > clock.GetUtcNow())
                    return;
                if (lifecycle is null)
                    throw new InvalidOperationException("Team lifecycle integration is not registered.");
                await lifecycle.EndAsync(id, token);
                var members = await db.TeamMemberships.Where(x => x.TeamId == id && x.Status == "Active").ToArrayAsync(token);
                await NotifyMembers(team, "TeamDissolved", token);
                foreach (var member in members)
                {
                    member.Status = "Ended";
                    member.EndedAt = team.DissolutionAt;
                }
                var requests = await db.TeamRequests.Where(x => x.TeamId == id && x.Status == "Pending").ToArrayAsync(token);
                foreach (var request in requests)
                    request.Status = "Revoked";
                team.Status = "Dissolved";
                team.PendingOwnerId = null;
                var subscription = await db.Set<TeamPlatformSubscription>().SingleAsync(x => x.TeamId == id, token);
                subscription.Status = "Ended";
                subscription.AutoRenew = false;
                subscription.Version++;
                Audit(team, "Dissolved", actor: false);
                await db.SaveChangesAsync(token);
                count++;
            }, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception error) { logger?.LogError(error, "Team {TeamId} dissolution remains pending; other Teams will continue.", id); }
        }
        return count;
    }
    private async Task<Team> Visible(Guid id, CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        if (!await db.TeamMemberships.AnyAsync(x => x.TeamId == id && x.UserId == accounts.UserId && x.Status == "Active", ct))
            throw ApiException.NotFound();
        return await db.Teams.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Status != "Dissolved", ct) ?? throw ApiException.NotFound();
    }
    private async Task<TeamMembership> Admin(Team team, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var member = await Member(team.Id, accounts.UserId, ct);
        if (member.Role is not ("Owner" or "Admin"))
            throw ApiException.NotFound();
        await Active(team, ct);
        return member;
    }
    private async Task OwnerIdentity(Team team, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        if ((await Member(team.Id, accounts.UserId, ct)).Role != "Owner" || team.OwnerId != accounts.UserId || team.Status == "Dissolved")
            throw ApiException.NotFound();
    }
    private async Task Owner(Team team, CancellationToken ct)
    {
        if ((await Admin(team, ct)).Role != "Owner" || team.OwnerId != accounts.UserId)
            throw ApiException.NotFound();
    }
    private async Task<TeamPlatformSubscription> Active(Team team, CancellationToken ct)
    {
        if (team.Status is not ("Active" or "DissolutionScheduled"))
            throw ApiException.Conflict("Team operations require an active paid subscription.");
        var subscription = await db.Set<TeamPlatformSubscription>().SingleOrDefaultAsync(x => x.TeamId == team.Id, ct);
        if (subscription is not null && db.Entry(subscription).State == EntityState.Unchanged)
            await db.Entry(subscription).ReloadAsync(ct);
        if (subscription is not { Status: "Active" } || subscription.PeriodEnd <= clock.GetUtcNow())
            throw ApiException.Conflict("Team operations require an active paid subscription.");
        return subscription;
    }
    private async Task<TeamMembership> Member(Guid team, Guid user, CancellationToken ct)
    {
        var member = await db.TeamMemberships.SingleOrDefaultAsync(x => x.TeamId == team && x.UserId == user, ct) ?? throw ApiException.NotFound();
        if (db.Entry(member).State == EntityState.Unchanged)
            await db.Entry(member).ReloadAsync(ct);
        if (member.Status != "Active")
            throw ApiException.NotFound();
        return member;
    }
    private async Task<Team> Locked(Guid id, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + id}, 0))", ct);
        var team = (await db.Teams.FromSqlInterpolated($"SELECT * FROM billing.teams WHERE \"Id\"={id} FOR UPDATE").ToArrayAsync(ct)).SingleOrDefault() ?? throw ApiException.NotFound();
        await db.Entry(team).ReloadAsync(ct);
        return team;
    }
    private async Task<TeamDto> Dto(Team team, CancellationToken ct)
    {
        var member = await Member(team.Id, accounts.UserId, ct);
        var seats = await db.TeamMemberships.CountAsync(x => x.TeamId == team.Id && x.Status == "Active", ct);
        var subscription = await db.Set<TeamPlatformSubscription>().AsNoTracking().SingleOrDefaultAsync(x => x.TeamId == team.Id, ct);
        var active = team.Status is "Active" or "DissolutionScheduled" && subscription is { Status: "Active" } && subscription.PeriodEnd > clock.GetUtcNow();
        var actions = new List<string>();
        if (member.Role != "Owner")
            actions.Add("teams.leave");
        if (member.Role == "Owner")
            actions.AddRange(["teams.billing", "teams.dissolve"]);
        if (active)
        {
            actions.Add("teams.clients");
            if (member.Role is "Owner" or "Admin")
                actions.AddRange(["teams.manage", "teams.invite", "teams.analyze"]);
            if (member.Role == "Owner")
                actions.AddRange(["teams.settings", "teams.transfer-ownership"]);
        }
        return new(team.Id, team.Name, member.Role == "Owner", true, seats, member.Role,
            !active && team.Status != "Dissolved" ? "BillingInactive" : team.Status, team.Description, team.Version,
            subscription?.PurchasedSeats ?? 0, seats, subscription?.PeriodEnd, team.DissolutionAt, actions.ToArray(), team.PendingOwnerId);
    }
    private static void Role(string role)
    {
        if (role is not ("Admin" or "Member"))
            throw ApiException.Invalid("Choose Admin or Member.");
    }
    private static void Version(Team team, long version)
    {
        if (team.Version != version)
            throw ApiException.Conflict("Team changed. Refresh before updating.");
    }
    private void Audit(Team team, string action, Guid? subject = null, bool actor = true)
    {
        team.Version++;
        db.Set<TeamAudit>().Add(new()
        {
            Id = Guid.NewGuid(),
            TeamId = team.Id,
            ActorId = actor ? accounts.UserId : null,
            SubjectId = subject,
            Action = action,
            CreatedAt = clock.GetUtcNow(),
            Version = team.Version
        });
    }
    private Task Notify(Guid user, Team team, string type, string key, CancellationToken ct) => notifications?.PublishAsync(new(user, $"team:{team.Id}:{key}:{type}:{user}", type, "Coaching", "Billing", team.Id, "/app/team"), ct) ?? Task.CompletedTask;
    private async Task NotifyMembers(Team team, string type, CancellationToken ct)
    {
        foreach (var user in await db.TeamMemberships.Where(x => x.TeamId == team.Id && x.Status == "Active").Select(x => x.UserId).ToArrayAsync(ct))
            await Notify(user, team, type, team.Version.ToString(), ct);
    }
}
