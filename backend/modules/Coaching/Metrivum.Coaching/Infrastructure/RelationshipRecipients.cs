using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Coaching.Infrastructure;

/// <summary>Resolves authorized coach/client and group recipients from the Coaching database for other modules.</summary>
public sealed class RelationshipRecipients(
    CoachingDbContext db,
    ITeamContext? teams = null,
    ModuleTransaction? transaction = null
) : IRelationshipRecipients
{
    public async Task<IReadOnlyList<RelationshipGroupSource>> GetGroupSourcesAsync(
        Guid coachId,
        Guid workspaceId,
        IReadOnlyCollection<Guid> groupIds,
        CancellationToken ct
    ) =>
        await (
            from membership in db.Memberships.AsNoTracking()
            join groupEntry in db.Groups.AsNoTracking() on membership.GroupId equals groupEntry.Id
            where
                membership.CoachId == coachId
                && membership.WorkspaceId == workspaceId
                && groupEntry.CoachId == coachId
                && groupEntry.WorkspaceId == workspaceId
                && groupIds.Contains(groupEntry.Id)
                && !groupEntry.Archived
            select new RelationshipGroupSource(
                membership.RelationshipId,
                groupEntry.Id,
                groupEntry.Name
            )
        ).ToArrayAsync(ct);

    public async Task<IReadOnlyList<RelationshipRecipient>> GetForTeamAsync(
        Guid teamId,
        Guid? memberId,
        CancellationToken ct
    ) =>
        await db
            .Relationships.AsNoTracking()
            .Where(x => x.TeamId == teamId && (memberId == null || x.CoachId == memberId))
            .Select(x => new RelationshipRecipient(
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
                x.Status,
                x.TeamId,
                x.TeamClientCaseId
            ))
            .ToArrayAsync(ct);

    public async Task<IReadOnlyList<RelationshipRecipient>> ResolveActiveAsync(
        Guid coachId,
        Guid workspaceId,
        IReadOnlyCollection<Guid> relationshipIds,
        IReadOnlyCollection<Guid> groupIds,
        CancellationToken ct
    )
    {
        var direct = relationshipIds.Distinct().ToArray();
        var groups = groupIds.Distinct().ToArray();
        if (transaction?.IsActive == true)
        {
            // Serialize active relationship checks with status transitions through the caller's commit.
            // Ordinary status updates take row locks too; unrelated advisory locks cannot protect this read.
            await db
                .Relationships.FromSqlInterpolated(
                    $"""
                    SELECT r.* FROM coaching."Relationships" r
                    WHERE r."CoachId" = {coachId} AND r."WorkspaceId" = {workspaceId}
                      AND (r."Id" = ANY ({direct}) OR EXISTS (
                        SELECT FROM coaching."Memberships" m WHERE m."RelationshipId" = r."Id"
                          AND m."GroupId" = ANY ({groups}) AND m."CoachId" = {coachId} AND m."WorkspaceId" = {workspaceId}))
                    ORDER BY r."Id" FOR SHARE OF r
                    """
                )
                .AsNoTracking()
                .ToArrayAsync(ct);
        }
        if (
            await db.Relationships.CountAsync(
                x => direct.Contains(x.Id) && x.CoachId == coachId && x.WorkspaceId == workspaceId,
                ct
            ) != direct.Length
            || await db.Groups.CountAsync(
                x =>
                    groups.Contains(x.Id)
                    && x.CoachId == coachId
                    && x.WorkspaceId == workspaceId
                    && !x.Archived,
                ct
            ) != groups.Length
        )
            throw ApiException.NotFound();
        var selectedScopes = (
            await db
                .Relationships.Where(x => direct.Contains(x.Id))
                .Select(x => x.TeamId)
                .ToArrayAsync(ct)
        )
            .Concat(
                await db
                    .Groups.Where(x => groups.Contains(x.Id))
                    .Select(x => x.TeamId)
                    .ToArrayAsync(ct)
            )
            .Distinct()
            .ToArray();
        if (selectedScopes.Length > 1)
            throw ApiException.Invalid(
                "Choose clients and groups from one Personal or Team scope."
            );
        var team = teams == null ? null : await teams.GetForUserAsync(coachId, ct);
        var teamId = team?.TeamId ?? Guid.Empty;
        var teamActive = team?.IsActive ?? false;
        return await db
            .Relationships.AsNoTracking()
            .Where(x =>
                x.CoachId == coachId
                && x.WorkspaceId == workspaceId
                && x.Status == RelationshipStatus.Active
                && (
                    x.TeamId == null
                    || teamActive
                        && x.TeamId == teamId
                        && db.Set<Domain.TeamCoachAssignment>()
                            .Any(a =>
                                a.TeamClientCaseId == x.TeamClientCaseId
                                && a.CoachId == coachId
                                && a.EndedAt == null
                            )
                )
                && (
                    direct.Contains(x.Id)
                    || db.Memberships.Any(m =>
                        groups.Contains(m.GroupId)
                        && m.RelationshipId == x.Id
                        && m.CoachId == coachId
                        && m.WorkspaceId == workspaceId
                    )
                )
            )
            .Select(x => new RelationshipRecipient(
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
                x.Status,
                x.TeamId,
                x.TeamClientCaseId
            ))
            .ToArrayAsync(ct);
    }

    public async Task<IReadOnlyList<RelationshipRecipient>> GetForUserAsync(
        Guid userId,
        bool coach,
        CancellationToken ct
    )
    {
        var team = teams == null || !coach ? null : await teams.GetForUserAsync(userId, ct);
        var teamId = team?.TeamId ?? Guid.Empty;
        return await db
            .Relationships.AsNoTracking()
            .Where(x =>
                coach
                    ? x.CoachId == userId
                        && (
                            x.TeamId == null
                            || x.TeamId == teamId
                                && db.Set<Domain.TeamCoachAssignment>()
                                    .Any(a =>
                                        a.TeamClientCaseId == x.TeamClientCaseId
                                        && a.CoachId == userId
                                        && a.EndedAt == null
                                    )
                        )
                    : x.ClientId == userId
            )
            .Select(x => new RelationshipRecipient(
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
                x.Status,
                x.TeamId,
                x.TeamClientCaseId
            ))
            .ToArrayAsync(ct);
    }

    public async Task<RelationshipRecipient?> GetAsync(Guid relationshipId, CancellationToken ct) =>
        await db
            .Relationships.AsNoTracking()
            .Where(x => x.Id == relationshipId)
            .Select(x => new RelationshipRecipient(
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
                x.Status,
                x.TeamId,
                x.TeamClientCaseId
            ))
            .FirstOrDefaultAsync(ct);
}
