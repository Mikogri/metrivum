using Microsoft.EntityFrameworkCore;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Accounts.Contracts;

namespace TrainFlow.Coaching.Infrastructure;

public sealed class RelationshipRecipients(CoachingDbContext db, ITeamContext? teams = null) : IRelationshipRecipients
{
    public async Task<IReadOnlyList<RelationshipRecipient>> GetForTeamAsync(Guid teamId, Guid? memberId, CancellationToken ct) =>
        await db.Relationships.AsNoTracking().Where(x => x.TeamId == teamId && (memberId == null || x.CoachId == memberId))
            .Select(x => new RelationshipRecipient(x.Id, x.CoachId, x.WorkspaceId, x.ClientId, x.Status, x.TeamId, x.TeamClientCaseId)).ToArrayAsync(ct);
    public async Task<IReadOnlyList<RelationshipRecipient>> ResolveActiveAsync(Guid coachId, Guid workspaceId, IReadOnlyCollection<Guid> relationshipIds, IReadOnlyCollection<Guid> groupIds, CancellationToken ct)
    {
        var direct = relationshipIds.Distinct().ToArray();
        var groups = groupIds.Distinct().ToArray();
        if (await db.Relationships.CountAsync(x => direct.Contains(x.Id) && x.CoachId == coachId && x.WorkspaceId == workspaceId, ct) != direct.Length ||
            await db.Groups.CountAsync(x => groups.Contains(x.Id) && x.CoachId == coachId && x.WorkspaceId == workspaceId && !x.Archived, ct) != groups.Length)
            throw ApiException.NotFound();
        var selectedScopes = (await db.Relationships.Where(x => direct.Contains(x.Id)).Select(x => x.TeamId).ToArrayAsync(ct))
            .Concat(await db.Groups.Where(x => groups.Contains(x.Id)).Select(x => x.TeamId).ToArrayAsync(ct)).Distinct().ToArray();
        if (selectedScopes.Length > 1)
            throw ApiException.Invalid("Choose clients and groups from one Personal or Team scope.");
        var team = teams == null ? null : await teams.GetForUserAsync(coachId, ct);
        var teamId = team?.TeamId ?? Guid.Empty;
        var teamActive = team?.IsActive ?? false;
        return await db.Relationships.AsNoTracking().Where(x => x.CoachId == coachId && x.WorkspaceId == workspaceId && x.Status == RelationshipStatus.Active &&
            (x.TeamId == null || teamActive && x.TeamId == teamId && db.Set<Domain.TeamCoachAssignment>().Any(a => a.TeamClientCaseId == x.TeamClientCaseId && a.CoachId == coachId && a.EndedAt == null)) &&
            (direct.Contains(x.Id) || db.Memberships.Any(m => groups.Contains(m.GroupId) && m.RelationshipId == x.Id && m.CoachId == coachId && m.WorkspaceId == workspaceId)))
            .Select(x => new RelationshipRecipient(x.Id, x.CoachId, x.WorkspaceId, x.ClientId, x.Status, x.TeamId, x.TeamClientCaseId)).ToArrayAsync(ct);
    }
    public async Task<IReadOnlyList<RelationshipRecipient>> GetForUserAsync(Guid userId, bool coach, CancellationToken ct)
    {
        var team = teams == null || !coach ? null : await teams.GetForUserAsync(userId, ct);
        var teamId = team?.TeamId ?? Guid.Empty;
        return await db.Relationships.AsNoTracking().Where(x => coach ? x.CoachId == userId &&
            (x.TeamId == null || x.TeamId == teamId && db.Set<Domain.TeamCoachAssignment>().Any(a => a.TeamClientCaseId == x.TeamClientCaseId && a.CoachId == userId && a.EndedAt == null)) : x.ClientId == userId)
            .Select(x => new RelationshipRecipient(x.Id, x.CoachId, x.WorkspaceId, x.ClientId, x.Status, x.TeamId, x.TeamClientCaseId)).ToArrayAsync(ct);
    }
    public async Task<RelationshipRecipient?> GetAsync(Guid relationshipId, CancellationToken ct) => await db.Relationships.AsNoTracking().Where(x => x.Id == relationshipId)
        .Select(x => new RelationshipRecipient(x.Id, x.CoachId, x.WorkspaceId, x.ClientId, x.Status, x.TeamId, x.TeamClientCaseId)).FirstOrDefaultAsync(ct);
}
