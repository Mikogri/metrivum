using TrainFlow.Notifications.Contracts;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Infrastructure;

namespace TrainFlow.Coaching.Features;

public sealed class CoachingService(CoachingDbContext db, IAccountContext accounts, IAccountDirectory directory, IFeatureAccessService access, TimeProvider clock, IHostEnvironment environment, ModuleTransaction? moduleTransaction = null, IEnumerable<ICoachingMessagingObserver>? messagingObservers = null, INotificationPublisher? notifications = null, ITeamContext? teams = null) : IRelationshipAccessPolicy, IRelationshipActivation
{
    private readonly Dictionary<Guid, TeamAccess> teamScopes = [];
    public async Task<RelationshipAccessDecision> DecideAsync(Guid id, RelationshipOperation operation, CancellationToken ct) =>
        (await DecideManyAsync([id], operation, ct))[id];

    public async Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(IReadOnlyCollection<Guid> relationshipIds, RelationshipOperation operation, CancellationToken ct)
    {
        if (!Enum.IsDefined(operation))
            throw ApiException.Invalid("Unknown relationship operation.");
        if (relationshipIds.Count > 1000)
            throw ApiException.Invalid("Use at most 1000 relationship IDs per policy request.");
        var ids = relationshipIds.Distinct().ToArray();
        if (ids.Length == 0)
            return new Dictionary<Guid, RelationshipAccessDecision>();
        var rows = await db.Relationships.AsNoTracking().Where(x => ids.Contains(x.Id) && (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId || x.TeamId != null)).ToDictionaryAsync(x => x.Id, ct);
        if (rows.Count == 0)
            return ids.ToDictionary(x => x, _ => new RelationshipAccessDecision(false, "RESOURCE_NOT_FOUND", null));
        var roles = await accounts.GetRolesAsync(ct);
        var features = await access.GetAsync(ct);
        var decisions = new Dictionary<Guid, RelationshipAccessDecision>();
        var team = rows.Values.Any(x => x.TeamId != null) && teams != null ? await teams.GetForUserAsync(accounts.UserId, ct) : null;
        var teamCases = rows.Values.Where(x => x.TeamClientCaseId != null).Select(x => x.TeamClientCaseId!.Value).ToArray();
        var assigned = await db.Set<TeamCoachAssignment>().Where(x => teamCases.Contains(x.TeamClientCaseId) && x.CoachId == accounts.UserId && x.EndedAt == null).Select(x => x.TeamClientCaseId).ToArrayAsync(ct);
        var writing = operation is RelationshipOperation.ProtectedWrite or RelationshipOperation.Manage;
        var clientCases = writing && teams != null ? rows.Values
            .Where(x => x.TeamClientCaseId != null && x.ClientId == accounts.UserId && x.TeamId != team?.TeamId)
            .Select(x => x.TeamClientCaseId!.Value).Distinct().ToArray() : [];
        var representatives = clientCases.Length == 0 ? [] : await db.Set<TeamCoachAssignment>().AsNoTracking()
            .Where(x => clientCases.Contains(x.TeamClientCaseId) && x.EndedAt == null)
            .Select(x => new { x.TeamId, x.TeamClientCaseId, x.CoachId }).ToArrayAsync(ct);
        var representativeByCase = representatives.GroupBy(x => (x.TeamId, x.TeamClientCaseId))
            .ToDictionary(x => x.Key, x => x.First().CoachId);
        var activeScopes = new Dictionary<(Guid TeamId, Guid CoachId), bool>();
        foreach (var id in ids)
        {
            if (!rows.TryGetValue(id, out var relationship))
            {
                decisions[id] = new(false, "RESOURCE_NOT_FOUND", null);
                continue;
            }
            if (relationship.TeamId == null)
            {
                decisions[id] = Decision(relationship, accounts.UserId, operation, roles, features);
                continue;
            }
            var client = relationship.ClientId == accounts.UserId;
            var staff = team?.TeamId == relationship.TeamId && (team.Role is "Owner" or "Admin" || assigned.Contains(relationship.TeamClientCaseId!.Value));
            if (!client && !staff)
            {
                decisions[id] = new(false, "RESOURCE_NOT_FOUND", null);
                continue;
            }
            var feature = client ? "coaching.relationships.read-own" : writing ? "coaching.clients.manage" : "coaching.clients.view";
            var allowed = roles.Contains(client ? AccountRole.Client : AccountRole.Coach) && features.Features.Any(x => x.Key == feature && x.Available);
            if (writing)
            {
                var active = team?.TeamId == relationship.TeamId && team.IsActive;
                if (team?.TeamId != relationship.TeamId && teams != null &&
                    representativeByCase.TryGetValue((relationship.TeamId.Value, relationship.TeamClientCaseId!.Value), out var representative))
                {
                    var scope = (relationship.TeamId.Value, representative);
                    if (!activeScopes.TryGetValue(scope, out active))
                    {
                        active = (await teams.GetForUserAsync(representative, ct)) is { IsActive: true } coachTeam && coachTeam.TeamId == relationship.TeamId;
                        activeScopes[scope] = active;
                    }
                }
                allowed &= active && relationship.Status == RelationshipStatus.Active && (operation != RelationshipOperation.Manage || staff);
            }
            else if (client)
                allowed &= operation == RelationshipOperation.OrganizationalRead || relationship.Status != RelationshipStatus.Suspended;
            decisions[id] = new(allowed, allowed ? "ALLOWED" : "RELATIONSHIP_ACCESS_DENIED", relationship.Status);
        }
        return decisions;
    }

    private static RelationshipAccessDecision Decision(Relationship r, Guid actorId, RelationshipOperation operation, IReadOnlyList<AccountRole> roles, AccessSnapshot features)
    {
        var coach = r.CoachId == actorId;
        if (!roles.Contains(coach ? AccountRole.Coach : AccountRole.Client))
            return new(false, "ROLE_REQUIRED", r.Status);
        var feature = coach ? operation is RelationshipOperation.Manage or RelationshipOperation.ProtectedWrite ? "coaching.clients.manage" : "coaching.clients.view" : "coaching.relationships.read-own";
        if (!features.Features.Any(x => x.Key == feature && x.Available))
            return new(false, "FEATURE_UNAVAILABLE", r.Status);
        var allowed = operation switch
        {
            RelationshipOperation.OrganizationalRead => true,
            RelationshipOperation.Manage => coach,
            RelationshipOperation.ProtectedRead => coach || r.Status == RelationshipStatus.Active,
            RelationshipOperation.HistoricalSharedRead => coach || r.Status is RelationshipStatus.Active or RelationshipStatus.Completed,
            RelationshipOperation.ProtectedWrite => r.Status == RelationshipStatus.Active,
            _ => false
        };
        return new(allowed, allowed ? "ALLOWED" : "RELATIONSHIP_ACCESS_DENIED", r.Status);
    }

    public Task<Guid> ActivateAcceptedApplicationAsync(Guid coachId, Guid clientId, CancellationToken ct) =>
        ActivateAsync(coachId, clientId, ActivationSource.AcceptedApplication, ct);

    public Task<Guid> ActivateDevFixtureAsync(Guid coachId, Guid clientId, CancellationToken ct)
    {
        if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
            throw new ApiException(403, "DEV_FIXTURE_DISABLED", "Dev fixtures are restricted to Development and Testing.");
        return ActivateAsync(coachId, clientId, ActivationSource.DevFixture, ct);
    }

    private async Task<Guid> ActivateAsync(Guid coachId, Guid clientId, ActivationSource source, CancellationToken ct)
    {
        if (coachId == clientId || coachId == Guid.Empty || clientId == Guid.Empty)
            throw ApiException.Invalid("Coach and client must be distinct accounts.");
        var people = await directory.GetAccountsAsync([coachId, clientId], ct);
        if (!people.TryGetValue(coachId, out var coach) || !coach.Roles.Contains(AccountRole.Coach) || !people.TryGetValue(clientId, out var client) || !client.Roles.Contains(AccountRole.Client))
            throw ApiException.Invalid("An onboarded Coach and Client are required.");
        async Task<Guid> Activate(CancellationToken token)
        {
            // Serialize pair activation and returning-client reactivation across API instances.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({coachId.ToString() + ":" + clientId.ToString()}, 0))", token);
            var existing = await db.Relationships.FromSqlInterpolated($"SELECT * FROM coaching.\"Relationships\" WHERE \"CoachId\"={coachId} AND \"ClientId\"={clientId} AND \"TeamId\" IS NULL FOR UPDATE").SingleOrDefaultAsync(token);
            var now = clock.GetUtcNow();
            if (existing != null)
            {
                if (source == ActivationSource.AcceptedApplication && existing.Status == RelationshipStatus.Suspended)
                    throw ApiException.Conflict("Explicitly resume this suspended relationship before accepting the application.");
                if (source == ActivationSource.AcceptedApplication && existing.Status == RelationshipStatus.Completed)
                {
                    existing.Status = RelationshipStatus.Active;
                    existing.ResumedAt = now;
                    existing.UpdatedAt = now;
                    existing.Version++;
                    db.StatusChanges.Add(new()
                    {
                        RelationshipId = existing.Id,
                        ActorId = coachId,
                        PreviousStatus = RelationshipStatus.Completed,
                        NewStatus = RelationshipStatus.Active,
                        InternalReason = "Returning client: application accepted",
                        OccurredAt = now,
                        Version = existing.Version
                    });
                    await SaveAsync(token);
                }
                return existing.Id;
            }
            var r = new Relationship { CoachId = coachId, ClientId = clientId, WorkspaceId = coach.WorkspaceId, ActivationSource = source, StartedAt = now, CreatedAt = now, UpdatedAt = now };
            db.Relationships.Add(r);
            await SaveAsync(token);
            return r.Id;
        }
        if (moduleTransaction != null)
            return await moduleTransaction.RunAsync(Activate, ct);
        // Directly constructed isolated tests retain the legacy single-context transaction.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var id = await Activate(ct);
        await transaction.CommitAsync(ct);
        return id;
    }

    public async Task<Paged<CoachRelationshipDto>> ClientsAsync(CoachingListQuery request, CancellationToken ct)
    {
        var owner = await CoachAsync("coaching.clients.view", ct);
        ValidateList(request);
        TeamAccess? teamScope = request.TeamId == null ? null : await RequireTeamScope(request.TeamId.Value, false, ct);
        var query = db.Relationships.AsNoTracking().Where(x => x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId && x.TeamId == request.TeamId);
        if (teamScope is { Role: "Member" })
            query = query.Where(x => db.Set<TeamCoachAssignment>().Any(a => a.TeamClientCaseId == x.TeamClientCaseId && a.CoachId == owner.UserId && a.EndedAt == null));
        query = await FilterAsync(query, request, false, ct);
        var total = await query.LongCountAsync(ct);
        var rows = await Order(query, request.Sort).Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).ToArrayAsync(ct);
        return new(await CoachDtosAsync(rows, ct), request.Page, request.PageSize, total);
    }
    public async Task<CoachRelationshipDto> ClientAsync(Guid id, CancellationToken ct)
    {
        var r = await OwnedRelationshipAsync(id, await CoachAsync("coaching.clients.view", ct), ct);
        return (await CoachDtosAsync([r], ct))[0];
    }
    public async Task<Paged<ClientRelationshipDto>> MyCoachesAsync(CoachingListQuery request, CancellationToken ct)
    {
        var identity = await accounts.RequireClientAsync(ct);
        await access.RequireAsync("coaching.relationships.read-own", ct);
        ValidateList(request);
        if (request.GroupIds.Length > 0)
            throw ApiException.Invalid("Client lists do not support private group filters.");
        if (request.OfferId != null || request.OfferCategory != null)
            throw ApiException.Invalid("Client lists do not support offer filters.");
        var query = await FilterAsync(db.Relationships.AsNoTracking().Where(x => x.ClientId == identity.UserId), request, true, ct);
        var total = await query.LongCountAsync(ct);
        var rows = await Order(query, request.Sort).Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(rows.Select(x => x.CoachId).Distinct().ToArray(), ct);
        return new(rows.Select(x => ClientDto(x, people)).ToArray(), request.Page, request.PageSize, total);
    }
    public async Task<ClientRelationshipDto> RelationshipAsync(Guid id, CancellationToken ct)
    {
        var identity = await accounts.RequireClientAsync(ct);
        await access.RequireAsync("coaching.relationships.read-own", ct);
        var r = await db.Relationships.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.ClientId == identity.UserId, ct) ?? throw ApiException.NotFound();
        return ClientDto(r, await directory.GetAccountsAsync([r.CoachId], ct));
    }
    public async Task<object> RelationshipDetailsAsync(Guid id, CancellationToken ct)
    {
        var owner = await db.Relationships.AsNoTracking().AnyAsync(x => x.Id == id && x.CoachId == accounts.UserId, ct);
        return owner ? await ClientAsync(id, ct) : await RelationshipAsync(id, ct);
    }
    public async Task<CoachRelationshipDto> ChangeStatusAsync(Guid id, RelationshipStatus target, StatusRequest request, long version, CancellationToken ct)
    {
        var owner = await CoachAsync("coaching.clients.manage", ct);
        var r = await OwnedRelationshipAsync(id, owner, ct);
        if (r.TeamId != null)
            throw ApiException.Conflict("Manage organizational case status through the Team.");
        CheckVersion(r.Version, version);
        if (!Enum.IsDefined(target))
            throw ApiException.Invalid("Invalid status.");
        Text(request.InternalReason, 1000);
        if (r.Status == target)
            return (await CoachDtosAsync([r], ct))[0];
        if (!((r.Status == RelationshipStatus.Active && target is RelationshipStatus.Suspended or RelationshipStatus.Completed) || (r.Status == RelationshipStatus.Suspended && target == RelationshipStatus.Active)))
            throw ApiException.Conflict("This status transition is not supported.");
        var previous = r.Status;
        var now = clock.GetUtcNow();
        r.Status = target;
        r.Version++;
        r.UpdatedAt = now;
        if (target == RelationshipStatus.Suspended)
            r.SuspendedAt = now;
        if (target == RelationshipStatus.Active)
            r.ResumedAt = now;
        if (target == RelationshipStatus.Completed)
            r.CompletedAt = now;
        db.StatusChanges.Add(new()
        {
            RelationshipId = r.Id,
            ActorId = owner.UserId,
            PreviousStatus = previous,
            NewStatus = target,
            InternalReason = request.InternalReason,
            OccurredAt = now,
            Version = r.Version
        });
        await SaveAsync(ct);
        return (await CoachDtosAsync([r], ct))[0];
    }

    public async Task<Paged<GroupDto>> GroupsAsync(int page, int pageSize, string? search, string sort, bool archived, CancellationToken ct, Guid? teamId = null, Guid? relationshipId = null)
    {
        var owner = await CoachAsync("coaching.groups.manage", ct);
        Pagination(page, pageSize);
        Text(search, 200);
        if (teamId != null)
            await RequireTeamScope(teamId.Value, false, ct);
        if (relationshipId != null)
        {
            var relationship = await OwnedRelationshipAsync(relationshipId.Value, owner, ct);
            if (relationship.TeamId != teamId) throw ApiException.NotFound();
        }
        var query = db.Groups.AsNoTracking().Where(x => x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId && x.Archived == archived && x.TeamId == teamId);
        if (relationshipId != null) query = query.Where(x => db.Memberships.Any(m => m.GroupId == x.Id && m.RelationshipId == relationshipId));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(text));
        }
        var total = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "name" => query.OrderBy(x => x.Name).ThenBy(x => x.Id),
            "updated" => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id),
            "created" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be name, updated, or created.")
        };
        return new((await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct)).Select(GroupDto).ToArray(), page, pageSize, total);
    }
    public async Task<GroupDto> GroupAsync(Guid id, CancellationToken ct) => GroupDto(await OwnedGroupAsync(id, await CoachAsync("coaching.groups.manage", ct), ct));
    public async Task<GroupDto> CreateGroupAsync(GroupRequest request, CancellationToken ct)
    {
        var owner = await CoachAsync("coaching.groups.manage", ct);
        ValidateGroup(request);
        var now = clock.GetUtcNow();
        var group = new ClientGroup { TeamId = request.TeamId, CoachId = owner.UserId, WorkspaceId = owner.WorkspaceId, Name = request.Name.Trim(), Description = request.Description, Color = request.Color, CreatedAt = now, UpdatedAt = now };
        db.Groups.Add(group);
        await SaveAsync(ct, group.TeamId);
        return GroupDto(group);
    }
    public async Task<GroupDto> UpdateGroupAsync(Guid id, GroupRequest request, long version, CancellationToken ct)
    {
        var group = await OwnedGroupAsync(id, await CoachAsync("coaching.groups.manage", ct), ct);
        CheckVersion(group.Version, version);
        ValidateGroup(request);
        if (request.TeamId != group.TeamId)
            throw ApiException.Invalid("Group ownership scope cannot change. Create a new scoped group.");
        if (group.Name == request.Name.Trim() && group.Description == request.Description && group.Color == request.Color)
            return GroupDto(group);
        group.Name = request.Name.Trim();
        group.Description = request.Description;
        group.Color = request.Color;
        Touch(group);
        await SaveAsync(ct, group.TeamId);
        return GroupDto(group);
    }
    public async Task<GroupDto> ArchiveGroupAsync(Guid id, bool archived, long version, CancellationToken ct)
    {
        var group = await OwnedGroupAsync(id, await CoachAsync("coaching.groups.manage", ct), ct);
        CheckVersion(group.Version, version);
        if (group.Archived == archived)
            return GroupDto(group);
        group.Archived = archived;
        Touch(group);
        await SaveAsync(ct, group.TeamId);
        return GroupDto(group);
    }
    public async Task<Paged<CoachRelationshipDto>> MembersAsync(Guid id, CoachingListQuery request, CancellationToken ct)
    {
        var owner = await CoachAsync("coaching.groups.manage", ct);
        var group = await OwnedGroupAsync(id, owner, ct);
        await access.RequireAsync("coaching.clients.view", ct);
        request.GroupIds = [id];
        request.TeamId = group.TeamId;
        return await ClientsAsync(request, ct);
    }
    public async Task<GroupDto> MembershipAsync(Guid groupId, Guid relationshipId, bool added, long version, CancellationToken ct)
    {
        var owner = await CoachAsync("coaching.groups.manage", ct);
        var group = await OwnedGroupAsync(groupId, owner, ct);
        CheckVersion(group.Version, version);
        var relationship = await OwnedRelationshipAsync(relationshipId, owner, ct);
        var membership = await db.Memberships.FirstOrDefaultAsync(x => x.GroupId == groupId && x.RelationshipId == relationshipId, ct);
        if (relationship.TeamId != group.TeamId)
            throw ApiException.Invalid("Groups and clients must have the same Personal or Team scope.");
        if ((membership != null) == added)
            return GroupDto(group);
        if (added && group.Archived)
            throw ApiException.Conflict("Restore the group before adding members.");
        if (added)
            db.Memberships.Add(new()
            {
                GroupId = groupId,
                RelationshipId = relationshipId,
                CoachId = owner.UserId,
                WorkspaceId = owner.WorkspaceId,
                CreatedAt = clock.GetUtcNow()
            });
        else
            db.Memberships.Remove(membership!);
        Touch(group);
        db.MembershipChanges.Add(new()
        {
            GroupId = groupId,
            RelationshipId = relationshipId,
            ActorId = owner.UserId,
            Added = added,
            OccurredAt = group.UpdatedAt,
            Version = group.Version
        });
        await SaveAsync(ct, group.TeamId);
        return GroupDto(group);
    }

    private async Task<CoachRelationshipDto[]> CoachDtosAsync(Relationship[] rows, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var caseIds = rows.Where(x => x.TeamClientCaseId != null).Select(x => x.TeamClientCaseId!.Value).ToArray();
        var assignments = await db.Set<TeamCoachAssignment>().AsNoTracking().Where(x => caseIds.Contains(x.TeamClientCaseId) && x.EndedAt == null).ToArrayAsync(ct);
        var currentTeam = teams == null || caseIds.Length == 0 ? null : await teams.GetForUserAsync(accounts.UserId, ct);
        var people = await directory.GetAccountsAsync(rows.Select(x => x.ClientId).Concat(assignments.Select(x => x.CoachId)).Distinct().ToArray(), ct);
        var memberships = await db.Memberships.AsNoTracking().Where(x => ids.Contains(x.RelationshipId)).ToArrayAsync(ct);
        var history = await db.StatusChanges.AsNoTracking().Where(x => ids.Contains(x.RelationshipId)).OrderBy(x => x.Version).ToArrayAsync(ct);
        var canManage = (await access.GetAsync(ct)).Features.Any(x => x.Key == "coaching.clients.manage" && x.Available);
        return rows.Select(x => new CoachRelationshipDto(x.Id, Person(x.ClientId, people), x.Status, x.StartedAt, x.SuspendedAt, x.ResumedAt, x.CompletedAt, x.Version, x.UpdatedAt, memberships.Where(m => m.RelationshipId == x.Id).Select(m => m.GroupId).Order().ToArray(), history.Where(h => h.RelationshipId == x.Id).Select(h => new StatusChangeDto(h.ActorId, h.OccurredAt, h.PreviousStatus, h.NewStatus, h.InternalReason, h.Version)).ToArray(), canManage && x.TeamId == null ? x.Status switch { RelationshipStatus.Active => ["suspend", "complete"], RelationshipStatus.Suspended => ["resume"], _ => [] } : [], people.TryGetValue(x.ClientId, out var person) ? person.SharedPhone : null, x.TeamId, x.TeamClientCaseId, currentTeam?.TeamId == x.TeamId ? currentTeam?.Name : null, assignments.FirstOrDefault(a => a.TeamClientCaseId == x.TeamClientCaseId) is { } assigned ? Person(assigned.CoachId, people) : null)).ToArray();
    }
    private static ClientRelationshipDto ClientDto(Relationship r, IReadOnlyDictionary<Guid, AccountDirectoryEntry> people) => new(r.Id, Person(r.CoachId, people), r.Status, r.Status switch { RelationshipStatus.Active => ["read", "write"], RelationshipStatus.Completed => ["read-history"], _ => [] }, r.TeamId, r.TeamClientCaseId);
    private static PersonDto Person(Guid id, IReadOnlyDictionary<Guid, AccountDirectoryEntry> people) => people.TryGetValue(id, out var person) ? new(id, person.DisplayName, person.Username) : new(id, "Unavailable account", null);
    private GroupDto GroupDto(ClientGroup g) => new(g.Id, g.Name, g.Description, g.Color, g.Archived, g.Version, g.CreatedAt, g.UpdatedAt,
        g.TeamId != null && (!teamScopes.TryGetValue(g.TeamId.Value, out var team) || !team.IsActive) ? [] : g.Archived ? ["edit", "restore", "remove-member"] : ["edit", "archive", "add-member", "remove-member"], g.TeamId);
    private async Task<IQueryable<Relationship>> FilterAsync(IQueryable<Relationship> query, CoachingListQuery request, bool client, CancellationToken ct)
    {
        if (request.Status != null)
            query = query.Where(x => x.Status == request.Status);
        if (request.GroupIds.Length > 0)
            query = query.Where(x => db.Memberships.Any(m => m.RelationshipId == x.Id && request.GroupIds.Contains(m.GroupId)));
        if (request.OfferId != null || !string.IsNullOrWhiteSpace(request.OfferCategory))
        {
            // The offer a client is on is the snapshot kept with their service: the active one, or the latest.
            var scope = query.Select(x => x.Id);
            var services = await db.Services.AsNoTracking().Where(s => scope.Contains(s.RelationshipId))
                .Select(s => new { s.RelationshipId, s.Status, s.UpdatedAt, s.OfferSnapshot }).ToArrayAsync(ct);
            var matching = services.GroupBy(s => s.RelationshipId)
                .Select(g => g.OrderByDescending(s => s.Status == ServiceStatus.Active).ThenByDescending(s => s.UpdatedAt).First())
                .Where(s =>
                {
                    using var snapshot = System.Text.Json.JsonDocument.Parse(s.OfferSnapshot);
                    var offer = snapshot.RootElement;
                    return (request.OfferId == null || offer.TryGetProperty("offerId", out var id) && id.TryGetGuid(out var value) && value == request.OfferId)
                        && (string.IsNullOrWhiteSpace(request.OfferCategory) || offer.TryGetProperty("category", out var category) && category.GetString() == request.OfferCategory);
                })
                .Select(s => s.RelationshipId).ToArray();
            query = query.Where(x => matching.Contains(x.Id));
        }
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var ids = await query.Select(x => client ? x.CoachId : x.ClientId).Distinct().ToArrayAsync(ct);
            var matching = await directory.FindNameMatchesAsync(ids, request.Search.Trim(), ct);
            query = query.Where(x => matching.Contains(client ? x.CoachId : x.ClientId));
        }
        return query;
    }
    private static IOrderedQueryable<Relationship> Order(IQueryable<Relationship> query, string sort) => sort switch { "updated" => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id), "created" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id), "status" => query.OrderBy(x => x.Status).ThenBy(x => x.Id), _ => throw ApiException.Invalid("Sort must be updated, created, or status.") };
    private async Task<AccountIdentity> CoachAsync(string feature, CancellationToken ct)
    {
        var identity = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync(feature, ct);
        return identity;
    }
    private async Task<Relationship> OwnedRelationshipAsync(Guid id, AccountIdentity owner, CancellationToken ct)
    {
        var row = await db.Relationships.FirstOrDefaultAsync(x => x.Id == id && x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId, ct) ?? throw ApiException.NotFound();
        if (row.TeamId != null && !(await DecideAsync(id, RelationshipOperation.OrganizationalRead, ct)).Allowed)
            throw ApiException.NotFound();
        return row;
    }
    private async Task<ClientGroup> OwnedGroupAsync(Guid id, AccountIdentity owner, CancellationToken ct)
    {
        var group = await db.Groups.FirstOrDefaultAsync(x => x.Id == id && x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId, ct) ?? throw ApiException.NotFound();
        if (group.TeamId != null)
            await RequireTeamScope(group.TeamId.Value, false, ct);
        return group;
    }
    private async Task<TeamAccess> RequireTeamScope(Guid teamId, bool write, CancellationToken ct)
    {
        var value = teams == null ? throw ApiException.NotFound() : await teams.RequireAsync(teamId, accounts.UserId, false, ct);
        if (write && !value.IsActive)
            throw ApiException.Conflict("An active Team is required to change organizational client groups.");
        teamScopes[teamId] = value;
        return value;
    }
    private void Touch(ClientGroup group)
    {
        group.Version++;
        group.UpdatedAt = clock.GetUtcNow();
    }
    internal Task SaveScopeTransitionAsync(CancellationToken ct) => SaveAsync(ct);
    private async Task SaveAsync(CancellationToken ct, Guid? teamIdToCheck = null)
    {
        async Task Save(CancellationToken token)
        {
            if (teamIdToCheck != null)
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + teamIdToCheck}, 0))", token);
                await RequireTeamScope(teamIdToCheck.Value, true, token);
            }
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtextextended('coaching-messaging', 0))", token);
            var groupIds = db.ChangeTracker.Entries<ClientGroup>().Where(x => x.State is EntityState.Added or EntityState.Modified).Select(x => x.Entity.Id).ToHashSet();
            foreach (var entry in db.ChangeTracker.Entries<GroupMembership>().Where(x => x.State is EntityState.Added or EntityState.Deleted))
                groupIds.Add(entry.Entity.GroupId);
            var relationshipIds = db.ChangeTracker.Entries<Relationship>().Where(x => x.State is EntityState.Added or EntityState.Modified).Select(x => x.Entity.Id).ToArray();
            if (relationshipIds.Length > 0)
                foreach (var id in await db.Memberships.Where(x => relationshipIds.Contains(x.RelationshipId)).Select(x => x.GroupId).Distinct().ToArrayAsync(token))
                    groupIds.Add(id);
            var changed = db.ChangeTracker.Entries<Relationship>().Where(x => x.State == EntityState.Modified && x.Property(r => r.Status).IsModified).Select(x => x.Entity).ToArray();
            await db.SaveChangesAsync(token);
            if (notifications != null)
                foreach (var r in changed)
                    await notifications.PublishAsync(new(r.ClientId, "relationship:" + r.Id + ":" + r.Version, "Relationship" + r.Status, "Coaching", "Coaching", r.Id, "/app/my-coaches/" + r.Id), token);
            foreach (var groupId in groupIds)
            {
                var group = await db.Groups.AsNoTracking().SingleAsync(x => x.Id == groupId, token);
                var ids = await (from m in db.Memberships join r in db.Relationships on m.RelationshipId equals r.Id where m.GroupId == groupId && r.Status == RelationshipStatus.Active select r.ClientId).Distinct().ToArrayAsync(token);
                foreach (var observer in messagingObservers ?? [])
                    await observer.GroupChangedAsync(new(group.Id, group.CoachId, group.Name, group.Archived, ids), token);
            }
        }
        try
        {
            if (moduleTransaction != null)
                await moduleTransaction.RunAsync(Save, ct);
            else if (db.Database.CurrentTransaction != null)
                await Save(ct);
            else
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                await Save(ct);
                await tx.CommitAsync(ct);
            }
        }
        catch (DbUpdateConcurrencyException) { throw new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload it before retrying."); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw ApiException.Conflict("A concurrent operation changed this resource. Reload it before retrying."); }
    }
    public static void CheckVersion(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload it before retrying.");
    }
    private static void Pagination(int page, int size)
    {
        if (page is < 1 or > 1000000 || size is < 1 or > 100)
            throw ApiException.Invalid("Page must be 1–1000000 and pageSize 1–100.");
    }
    private static void Text(string? value, int max, bool required = false)
    {
        if ((required && string.IsNullOrWhiteSpace(value)) || value?.Length > max || value?.Any(char.IsControl) == true)
            throw ApiException.Invalid($"Text must be at most {max} characters and contain no control characters.");
    }
    private static void ValidateGroup(GroupRequest request)
    {
        Text(request.Name, 200, true);
        Text(request.Description, 4000);
        if (request.Description is null || request.Color is null || !Regex.IsMatch(request.Color, "^#[0-9a-fA-F]{6}$"))
            throw ApiException.Invalid("Color must be #RRGGBB and description must be a string.");
    }
    private static void ValidateList(CoachingListQuery request)
    {
        Pagination(request.Page, request.PageSize);
        Text(request.Search, 200);
        if (request.Status.HasValue && !Enum.IsDefined(request.Status.Value))
            throw ApiException.Invalid("Invalid relationship status.");
        Text(request.OfferCategory, 60);
        if (request.OfferId == Guid.Empty)
            throw ApiException.Invalid("Invalid offer ID.");
        if (request.GroupIds.Length > 50 || request.GroupIds.Contains(Guid.Empty))
            throw ApiException.Invalid("Use at most 50 nonempty group IDs.");
    }
}
