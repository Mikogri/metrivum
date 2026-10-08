using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.Coaching.Features;

public sealed class TeamClientsService(CoachingDbContext db, IAccountContext accounts, IAccountDirectory directory,
    ITeamContext teams, IFeatureAccessService features, IBillingOrders billing, ModuleTransaction transaction,
    INotificationPublisher notifications, TimeProvider clock, CoachingService personalRelationships,
    IEnumerable<ITeamRelationshipLifecycle>? lifecycles = null) : ITeamLifecycle, ITeamCaseAccess, INotificationDeliveryPolicy
{
    public string SourceModule => "TeamCoaching";
    public const string ConsentText = "Your future organizational coaching registration will belong to this Team. " +
        "The Team Owner and Admins may see your Team client registration, assigned coaches and organizational summaries. " +
        "Assigned Team coaches may work with your Team case. Your previous personal coaching relationship will end. " +
        "Existing personal notes, forms, check-ins, documents, private messages, training records and payments remain personal and are not shared with the Team. " +
        "No paid service, money or historical record is transferred. Team coaching services require separate accepted terms.";

    private DbSet<TeamClientCase> Cases => db.Set<TeamClientCase>();
    private DbSet<TeamCoachAssignment> Assignments => db.Set<TeamCoachAssignment>();
    private DbSet<ClientTransferRequest> Transfers => db.Set<ClientTransferRequest>();
    private static bool Admin(TeamAccess access) => access.Role is "Owner" or "Admin";
    private Task Lock(Guid teamId, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + teamId}, 0))", ct);
    private static void Active(TeamAccess access)
    {
        if (!access.IsActive)
            throw new ApiException(409, "TEAM_INACTIVE", "The Team must have an active paid subscription for this action.");
    }
    private async Task<TeamAccess> Access(Guid teamId, bool administrative, bool write, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        await features.RequireAsync(write ? "coaching.clients.manage" : "coaching.clients.view", ct);
        var access = await teams.RequireAsync(teamId, accounts.UserId, administrative, ct);
        if (write)
            Active(access);
        return access;
    }
    public async Task<TeamClientCaseDto[]> ListAsync(Guid teamId, CancellationToken ct)
    {
        var access = await Access(teamId, false, false, ct);
        var query = Cases.AsNoTracking().Where(x => x.TeamId == teamId);
        if (!Admin(access))
            query = query.Where(x => Assignments.Any(a => a.TeamClientCaseId == x.Id && a.CoachId == accounts.UserId && a.EndedAt == null));
        return await CaseDtos(await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(1000).ToArrayAsync(ct), access, ct);
    }
    public async Task<TeamClientCaseDto> GetAsync(Guid teamId, Guid id, CancellationToken ct)
    {
        var access = await Access(teamId, false, false, ct);
        var row = await Cases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.TeamId == teamId, ct) ?? throw ApiException.NotFound();
        if (!Admin(access) && !await Assignments.AnyAsync(x => x.TeamClientCaseId == id && x.CoachId == accounts.UserId && x.EndedAt == null, ct))
            throw ApiException.NotFound();
        return (await CaseDtos([row], access, ct))[0];
    }
    public Task<TeamClientTransferDto> RequestAsync(Guid teamId, RequestTeamTransfer input, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(teamId, token);
        var access = await Access(teamId, false, true, token);
        var source = await Source(input.RelationshipId, accounts.UserId, token);
        await PairLock(source.CoachId, source.ClientId, token);
        await db.Entry(source).ReloadAsync(token);
        await Eligible(source, token);
        var previous = await Transfers.SingleOrDefaultAsync(x => x.RelationshipId == source.Id && x.Status == "Pending", token);
        if (previous != null)
        {
            if (previous.ExpiresAt > clock.GetUtcNow())
            {
                if (previous.TeamId != teamId)
                    throw ApiException.Conflict("This relationship already has a pending transfer request.");
                return (await TransferDtos([previous], false, token))[0];
            }
            TransferState(previous, "Expired", accounts.UserId);
            await db.SaveChangesAsync(token);
        }
        var now = clock.GetUtcNow();
        var request = new ClientTransferRequest
        {
            TeamId = teamId,
            TeamName = access.Name,
            RelationshipId = source.Id,
            ClientId = source.ClientId,
            ProposedBy = accounts.UserId,
            SourceRelationshipVersion = source.Version,
            ConsentText = ConsentText,
            CreatedAt = now,
            ExpiresAt = now.AddDays(14)
        };
        Transfers.Add(request);
        TransferAudit(request, accounts.UserId);
        await db.SaveChangesAsync(token);
        await notifications.PublishAsync(new(request.ClientId, $"team-transfer:{request.Id}:requested", "team.transfer.requested", "Coaching", SourceModule, request.Id, "/app/team"), token);
        return (await TransferDtos([request], false, token))[0];
    }, ct);

    public async Task<TeamClientTransferDto[]> IncomingAsync(CancellationToken ct)
    {
        await accounts.RequireClientAsync(ct);
        await features.RequireAsync("coaching.relationships.read-own", ct);
        return await TransferDtos(await Transfers.AsNoTracking().Where(x => x.ClientId == accounts.UserId)
            .OrderByDescending(x => x.CreatedAt).Take(1000).ToArrayAsync(ct), true, ct);
    }
    public async Task<TeamClientTransferDto[]> RequestsAsync(Guid teamId, CancellationToken ct)
    {
        var access = await Access(teamId, false, false, ct);
        var query = Transfers.AsNoTracking().Where(x => x.TeamId == teamId);
        if (!Admin(access))
            query = query.Where(x => x.ProposedBy == accounts.UserId);
        return await TransferDtos(await query.OrderByDescending(x => x.CreatedAt).Take(1000).ToArrayAsync(ct), false, ct);
    }

    public Task<TeamClientTransferDto> DecideAsync(Guid id, bool accept, long version, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireClientAsync(token);
        await features.RequireAsync("coaching.relationships.read-own", token);
        var lookup = await Transfers.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.ClientId == accounts.UserId, token) ?? throw ApiException.NotFound();
        await Lock(lookup.TeamId, token);
        var request = await Transfers.SingleAsync(x => x.Id == id, token);
        CoachingService.CheckVersion(request.Version, version);
        var expected = accept ? "Accepted" : "Declined";
        if (request.Status == expected)
            return (await TransferDtos([request], true, token))[0];
        if (request.Status != "Pending" || request.ExpiresAt <= clock.GetUtcNow())
            throw ApiException.Conflict("This transfer request is no longer pending. Ask your coach to send a new request.");
        if (accept)
        {
            Active(await teams.RequireAsync(request.TeamId, request.ProposedBy, false, token));
            var source = await Source(request.RelationshipId, request.ProposedBy, token);
            await PairLock(source.CoachId, source.ClientId, token);
            await db.Entry(source).ReloadAsync(token);
            CoachingService.CheckVersion(source.Version, request.SourceRelationshipVersion);
            if (source.ClientId != accounts.UserId)
                throw ApiException.NotFound();
            await Eligible(source, token);
            var now = clock.GetUtcNow();
            var row = await Cases.SingleOrDefaultAsync(x => x.TeamId == request.TeamId && x.ClientId == source.ClientId, token);
            if (row == null)
            {
                row = new TeamClientCase { TeamId = request.TeamId, ClientId = source.ClientId, CreatedAt = now };
                Cases.Add(row);
            }
            else
            {
                if (row.Status != "Active")
                    throw ApiException.Conflict("This organizational case has ended and cannot be silently reactivated.");
                row.Version++;
            }
            if (!await Assignments.AnyAsync(x => x.TeamClientCaseId == row.Id && x.CoachId == source.CoachId && x.EndedAt == null, token))
                Assignments.Add(new()
                {
                    TeamClientCaseId = row.Id,
                    TeamId = row.TeamId,
                    CoachId = source.CoachId,
                    AssignedBy = accounts.UserId,
                    StartedAt = now
                });
            CaseAudit(row, "ConsentAccepted", accounts.UserId, source.CoachId);
            await EnsureTeamRelationship(row, source.CoachId, token);
            source.Status = RelationshipStatus.Completed;
            source.CompletedAt = now;
            source.UpdatedAt = now;
            source.Version++;
            db.StatusChanges.Add(new()
            {
                RelationshipId = source.Id,
                ActorId = accounts.UserId,
                PreviousStatus = RelationshipStatus.Active,
                NewStatus = RelationshipStatus.Completed,
                InternalReason = "Client accepted future organizational coaching scope; private history retained.",
                OccurredAt = now,
                Version = source.Version
            });
            request.TeamClientCaseId = row.Id;
        }
        TransferState(request, expected, accounts.UserId);
        if (accept)
            await personalRelationships.SaveScopeTransitionAsync(token);
        else
            await db.SaveChangesAsync(token);
        await notifications.PublishAsync(new(request.ProposedBy, $"team-transfer:{request.Id}:{expected}", "team.transfer.decided", "Coaching", SourceModule, request.Id, "/app/team"), token);
        return (await TransferDtos([request], true, token))[0];
    }, ct);

    public Task<TeamClientCaseDto> AssignAsync(Guid teamId, Guid caseId, AssignTeamCoach input, CancellationToken ct) => ChangeAssignment(teamId, caseId, input.CoachId, input.Version, true, ct);
    public Task<TeamClientCaseDto> UnassignAsync(Guid teamId, Guid caseId, Guid coachId, long version, CancellationToken ct) => ChangeAssignment(teamId, caseId, coachId, version, false, ct);
    private Task<TeamClientCaseDto> ChangeAssignment(Guid teamId, Guid caseId, Guid coachId, long version, bool add, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(teamId, token);
        var access = await Access(teamId, true, true, token);
        var row = await Cases.SingleOrDefaultAsync(x => x.TeamId == teamId && x.Id == caseId, token) ?? throw ApiException.NotFound();
        CoachingService.CheckVersion(row.Version, version);
        if (row.Status != "Active")
            throw ApiException.Conflict("Only active organizational cases can be assigned.");
        if (add)
        {
            Active(await teams.RequireAsync(teamId, coachId, false, token));
            var people = await directory.GetAccountsAsync([coachId], token);
            if (coachId == row.ClientId || !people.TryGetValue(coachId, out var person) || !person.Roles.Contains(AccountRole.Coach))
                throw ApiException.Invalid("Select an eligible Team coach who is not this client.");
        }
        var current = await Assignments.SingleOrDefaultAsync(x => x.TeamClientCaseId == caseId && x.CoachId == coachId && x.EndedAt == null, token);
        if (add == (current != null))
            return (await CaseDtos([row], access, token))[0];
        if (add)
            Assignments.Add(new()
            {
                TeamClientCaseId = row.Id,
                TeamId = teamId,
                CoachId = coachId,
                AssignedBy = accounts.UserId,
                StartedAt = clock.GetUtcNow()
            });
        else
            current!.EndedAt = clock.GetUtcNow();
        if (add)
            await EnsureTeamRelationship(row, coachId, token);
        else
            await EndRelationships(teamId, coachId, caseId, token, accounts.UserId);
        row.Version++;
        CaseAudit(row, add ? "CoachAssigned" : "CoachUnassigned", accounts.UserId, coachId);
        await personalRelationships.SaveScopeTransitionAsync(token);
        await NotifyClient(row, add ? "TeamCoachAssigned" : "TeamCoachUnassigned", token);
        return (await CaseDtos([row], access, token))[0];
    }, ct);

    public Task EndAsync(Guid teamId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(teamId, token);
        await CheckDissolutionAsync(teamId, token);
        var now = clock.GetUtcNow();
        var rows = await Cases.Where(x => x.TeamId == teamId && x.Status == "Active").ToArrayAsync(token);
        foreach (var row in rows)
        {
            row.Status = "Ended";
            row.EndedAt = now;
            row.Version++;
            CaseAudit(row, "TeamDissolved", Guid.Empty, null);
        }
        foreach (var assignment in await Assignments.Where(x => x.TeamId == teamId && x.EndedAt == null).ToArrayAsync(token))
            assignment.EndedAt = now;
        foreach (var request in await Transfers.Where(x => x.TeamId == teamId && x.Status == "Pending").ToArrayAsync(token))
            TransferState(request, "Revoked", Guid.Empty);
        await ArchiveGroups(teamId, null, token);
        await EndRelationships(teamId, null, null, token);
        await personalRelationships.SaveScopeTransitionAsync(token);
        foreach (var row in rows)
            await NotifyClient(row, "TeamCoachingEnded", token);
    }, ct);

    public Task RemoveCoachAsync(Guid teamId, Guid userId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(teamId, token);
        var assignments = await Assignments.Where(x => x.TeamId == teamId && x.CoachId == userId && x.EndedAt == null).ToArrayAsync(token);
        var ids = assignments.Select(x => x.TeamClientCaseId).Distinct().ToArray();
        foreach (var assignment in assignments)
            assignment.EndedAt = clock.GetUtcNow();
        var rows = await Cases.Where(x => ids.Contains(x.Id)).ToArrayAsync(token);
        foreach (var row in rows)
        {
            row.Version++;
            CaseAudit(row, "CoachLeftTeam", userId, userId);
        }
        foreach (var request in await Transfers.Where(x => x.TeamId == teamId && x.ProposedBy == userId && x.Status == "Pending").ToArrayAsync(token))
            TransferState(request, "Revoked", userId);
        await ArchiveGroups(teamId, userId, token);
        await EndRelationships(teamId, userId, null, token, userId);
        await personalRelationships.SaveScopeTransitionAsync(token);
        foreach (var row in rows)
            await NotifyClient(row, "TeamCoachLeft", token);
    }, ct);

    private async Task<Relationship> Source(Guid id, Guid coach, CancellationToken ct) =>
        await db.Relationships.SingleOrDefaultAsync(x => x.Id == id && x.CoachId == coach && x.TeamId == null, ct) ?? throw ApiException.NotFound();
    private Task PairLock(Guid coachId, Guid clientId, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT pg_advisory_xact_lock(hashtextextended({coachId.ToString() + ":" + clientId.ToString()}, 0))", ct);
    private async Task Eligible(Relationship source, CancellationToken ct)
    {
        if (source.Status != RelationshipStatus.Active)
            throw ApiException.Conflict("Only an active personal relationship can be transferred.");
        if (await db.Services.AnyAsync(x => x.RelationshipId == source.Id && x.Status == ServiceStatus.Active, ct)
            || await billing.HasOutstandingPersonalObligationsAsync(source.Id, ct))
            throw new ApiException(409, "PERSONAL_OBLIGATIONS_REMAIN", "Complete personal coaching services, cancel their renewals and resolve outstanding payments before requesting this transfer. Historical payments remain personal.");
    }
    private Task NotifyClient(TeamClientCase row, string type, CancellationToken ct) => notifications.PublishAsync(
        new(row.ClientId, $"team-case:{row.Id}:{row.Version}:{type}", type, "Coaching", SourceModule, row.Id, "/app/my-coaches", Required: true), ct);
    private void CaseAudit(TeamClientCase row, string kind, Guid actor, Guid? coach) => db.Set<TeamCaseChange>().Add(new()
    {
        TeamClientCaseId = row.Id,
        ActorId = actor,
        CoachId = coach,
        Kind = kind,
        OccurredAt = clock.GetUtcNow(),
        Version = row.Version
    });
    private void TransferAudit(ClientTransferRequest row, Guid actor) => db.Set<TeamTransferChange>().Add(new()
    {
        TransferRequestId = row.Id,
        ActorId = actor,
        Status = row.Status,
        OccurredAt = clock.GetUtcNow(),
        Version = row.Version
    });
    private void TransferState(ClientTransferRequest row, string status, Guid actor)
    {
        row.Status = status;
        row.DecidedAt = clock.GetUtcNow();
        row.DecidedBy = actor;
        row.Version++;
        TransferAudit(row, actor);
    }
    private async Task<TeamClientCaseDto[]> CaseDtos(TeamClientCase[] rows, TeamAccess access, CancellationToken ct)
    {
        var people = await directory.GetAccountsAsync(rows.Select(x => x.ClientId).Distinct().ToArray(), ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var assignments = await Assignments.AsNoTracking().Where(x => ids.Contains(x.TeamClientCaseId) && x.EndedAt == null).ToArrayAsync(ct);
        var links = await db.Relationships.AsNoTracking().Where(x => x.TeamClientCaseId != null && ids.Contains(x.TeamClientCaseId.Value) && x.CoachId == accounts.UserId).ToArrayAsync(ct);
        return rows.Select(x => new TeamClientCaseDto(x.Id, x.TeamId, x.ClientId, people.GetValueOrDefault(x.ClientId)?.DisplayName ?? "Client", x.Status, x.CreatedAt, x.Version,
            assignments.Where(a => a.TeamClientCaseId == x.Id).Select(a => a.CoachId).Order().ToArray(), Admin(access) && access.IsActive && x.Status == "Active" ? ["assign-coach"] : [], links.SingleOrDefault(r => r.TeamClientCaseId == x.Id)?.Id)).ToArray();
    }
    private async Task<TeamClientTransferDto[]> TransferDtos(ClientTransferRequest[] rows, bool client, CancellationToken ct)
    {
        var people = await directory.GetAccountsAsync(rows.Select(x => x.ProposedBy).Distinct().ToArray(), ct);
        return rows.Select(x => new TeamClientTransferDto(x.Id, x.TeamId, x.TeamName, x.RelationshipId, x.ClientId, x.ProposedBy,
            people.GetValueOrDefault(x.ProposedBy)?.DisplayName ?? "Coach", x.Status == "Pending" && x.ExpiresAt <= clock.GetUtcNow() ? "Expired" : x.Status,
            x.ConsentVersion, x.ConsentText, x.CreatedAt, x.ExpiresAt, x.Version,
            client && x.ClientId == accounts.UserId && x.Status == "Pending" && x.ExpiresAt > clock.GetUtcNow() ? ["accept", "decline"] : [])).ToArray();
    }
    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        if (notification.Type is "TeamCoachAssigned" or "TeamCoachUnassigned" or "TeamCoachLeft" or "TeamCoachingEnded")
            return await Cases.AsNoTracking().AnyAsync(x => x.Id == notification.SourceId && x.ClientId == notification.RecipientUserId, ct);
        var row = await Transfers.AsNoTracking().SingleOrDefaultAsync(x => x.Id == notification.SourceId, ct);
        if (row == null)
            return false;
        if (notification.Type == "team.transfer.requested")
            return row.ClientId == notification.RecipientUserId && row.Status == "Pending" && row.ExpiresAt > clock.GetUtcNow();
        return notification.Type == "team.transfer.decided" && row.ProposedBy == notification.RecipientUserId && row.Status is "Accepted" or "Declined";
    }

    public async Task<TeamCaseAccessDecision> DecideAsync(Guid teamClientCaseId, Guid actorId, bool write, CancellationToken ct)
    {
        var row = await Cases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == teamClientCaseId, ct);
        if (row == null)
            return new(false, false, false, "NotFound");
        var team = await teams.GetForUserAsync(actorId, ct);
        var member = team?.TeamId == row.TeamId;
        var admin = member && Admin(team!);
        var assigned = member && await Assignments.AnyAsync(x => x.TeamClientCaseId == row.Id && x.CoachId == actorId && x.EndedAt == null, ct);
        var allowed = actorId == row.ClientId || admin || assigned;
        if (write)
        {
            var active = member && team!.IsActive;
            if (actorId == row.ClientId)
            {
                var coachId = await Assignments.Where(x => x.TeamClientCaseId == row.Id && x.EndedAt == null).Select(x => (Guid?)x.CoachId).FirstOrDefaultAsync(ct);
                var coachTeam = coachId == null ? null : await teams.GetForUserAsync(coachId.Value, ct);
                active = coachTeam?.TeamId == row.TeamId && coachTeam.IsActive;
            }
            allowed &= active && row.Status == "Active";
        }
        return new(allowed, admin, assigned, row.Status);
    }

    // Called only after the existing intake has verified the client's submitted organizational consent.
    internal async Task<Relationship> AcceptApplicationAsync(CoachingApplication app, CancellationToken ct)
    {
        if (app.TeamId == null || app.TeamConsentVersion != "team-acquisition-v1" || app.TeamConsentAt == null || app.Status != ApplicationStatus.Submitted)
            throw ApiException.Conflict("The client must submit the application with explicit Team consent.");
        await Lock(app.TeamId.Value, ct);
        var team = await Access(app.TeamId.Value, false, true, ct);
        if (team.Status == "DissolutionScheduled")
            throw ApiException.Conflict("This Team is scheduled to dissolve and cannot accept new paid coaching commitments.");
        if (app.CoachId != accounts.UserId)
            throw ApiException.NotFound();
        var row = await Cases.SingleOrDefaultAsync(x => x.TeamId == app.TeamId && x.ClientId == app.ApplicantUserId, ct);
        if (row == null)
        {
            row = new()
            {
                TeamId = app.TeamId.Value,
                ClientId = app.ApplicantUserId,
                CreatedAt = clock.GetUtcNow()
            };
            Cases.Add(row);
        }
        else
        {
            if (row.Status != "Active")
                throw ApiException.Conflict("This Team client case has ended.");
            row.Version++;
        }
        if (!await Assignments.AnyAsync(x => x.TeamClientCaseId == row.Id && x.CoachId == app.CoachId && x.EndedAt == null, ct))
            Assignments.Add(new()
            {
                TeamId = row.TeamId,
                TeamClientCaseId = row.Id,
                CoachId = app.CoachId,
                AssignedBy = accounts.UserId,
                StartedAt = clock.GetUtcNow()
            });
        CaseAudit(row, "ApplicationAccepted", accounts.UserId, app.CoachId);
        var relationship = await EnsureTeamRelationship(row, app.CoachId, ct);
        await personalRelationships.SaveScopeTransitionAsync(ct);
        return relationship;
    }

    private async Task<Relationship> EnsureTeamRelationship(TeamClientCase row, Guid coachId, CancellationToken ct)
    {
        var relationship = await db.Relationships.SingleOrDefaultAsync(x => x.TeamClientCaseId == row.Id && x.CoachId == coachId, ct);
        if (relationship == null)
        {
            var people = await directory.GetAccountsAsync([coachId], ct);
            if (!people.TryGetValue(coachId, out var coach) || !coach.Roles.Contains(AccountRole.Coach))
                throw ApiException.Invalid("An onboarded coach is required.");
            relationship = new()
            {
                TeamId = row.TeamId,
                TeamClientCaseId = row.Id,
                CoachId = coachId,
                ClientId = row.ClientId,
                WorkspaceId = coach.WorkspaceId,
                ActivationSource = ActivationSource.TeamConsent,
                StartedAt = clock.GetUtcNow(),
                CreatedAt = clock.GetUtcNow(),
                UpdatedAt = clock.GetUtcNow()
            };
            db.Relationships.Add(relationship);
        }
        else if (relationship.Status != RelationshipStatus.Active)
        {
            var old = relationship.Status;
            relationship.Status = RelationshipStatus.Active;
            relationship.ResumedAt = clock.GetUtcNow();
            relationship.UpdatedAt = clock.GetUtcNow();
            relationship.Version++;
            db.StatusChanges.Add(new()
            {
                RelationshipId = relationship.Id,
                ActorId = accounts.UserId,
                PreviousStatus = old,
                NewStatus = RelationshipStatus.Active,
                InternalReason = "Team coach assignment restored",
                OccurredAt = clock.GetUtcNow(),
                Version = relationship.Version
            });
        }
        return relationship;
    }
    private async Task EndRelationships(Guid teamId, Guid? coachId, Guid? caseId, CancellationToken ct, Guid actorId = default)
    {
        var rows = await db.Relationships.Where(x => x.TeamId == teamId && x.Status != RelationshipStatus.Completed && (coachId == null || x.CoachId == coachId) && (caseId == null || x.TeamClientCaseId == caseId)).ToArrayAsync(ct);
        var ids = rows.Select(x => x.Id).ToArray();
        foreach (var lifecycle in lifecycles ?? [])
            await lifecycle.CloseAsync(teamId, ids, actorId, clock.GetUtcNow(), ct);
        foreach (var row in rows)
        {
            var old = row.Status;
            row.Status = RelationshipStatus.Completed;
            row.CompletedAt = clock.GetUtcNow();
            row.UpdatedAt = clock.GetUtcNow();
            row.Version++;
            db.StatusChanges.Add(new()
            {
                RelationshipId = row.Id,
                ActorId = actorId,
                PreviousStatus = old,
                NewStatus = row.Status,
                InternalReason = "Team case or coach assignment ended",
                OccurredAt = clock.GetUtcNow(),
                Version = row.Version
            });
        }
    }
    public async Task CheckDissolutionAsync(Guid teamId, CancellationToken ct)
    {
        if (await db.Services.AnyAsync(x => x.TeamId == teamId && x.Status == ServiceStatus.Active, ct))
            throw new ApiException(409, "TEAM_SERVICES_REQUIRE_RESOLUTION", "Complete or explicitly resolve active Team coaching services before dissolving. Paid commitments are not automatically refunded or transferred.");
    }
    private async Task ArchiveGroups(Guid teamId, Guid? coachId, CancellationToken ct)
    {
        foreach (var group in await db.Groups.Where(x => x.TeamId == teamId && !x.Archived && (coachId == null || x.CoachId == coachId)).ToArrayAsync(ct))
        {
            group.Archived = true;
            group.UpdatedAt = clock.GetUtcNow();
            group.Version++;
        }
    }
}
