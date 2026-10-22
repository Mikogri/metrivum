using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Infrastructure;

namespace TrainFlow.Coaching.Infrastructure;

public sealed class CoachingMessagingDirectory(CoachingDbContext db, IAccountContext accounts, ITeamContext? teams = null) : ICoachingMessagingDirectory
{
    public Task<bool> HasActiveRelationshipAsync(Guid userId, CancellationToken ct) => db.Relationships.AnyAsync(x =>
        x.Status == RelationshipStatus.Active && x.TeamId == null && (x.CoachId == userId || x.ClientId == userId), ct);
    public async Task<bool> IsActivePairAsync(Guid first, Guid second, CancellationToken ct)
    {
        var rows = await db.Relationships.AsNoTracking().Where(x => x.Status == RelationshipStatus.Active && ((x.CoachId == first && x.ClientId == second) || (x.CoachId == second && x.ClientId == first))).ToArrayAsync(ct);
        if (rows.Any(x => x.TeamId == null))
            return true;
        foreach (var row in rows)
        {
            var team = teams == null ? null : await teams.GetForUserAsync(row.CoachId, ct);
            if (team is { IsActive: true } && team.TeamId == row.TeamId && await db.Set<TrainFlow.Coaching.Domain.TeamCoachAssignment>().AnyAsync(x => x.TeamClientCaseId == row.TeamClientCaseId && x.CoachId == row.CoachId && x.EndedAt == null, ct))
                return true;
        }
        return false;
    }
    public async Task<MessagingClientGroup> OwnedGroupAsync(Guid groupId, CancellationToken ct)
    {
        var g = await db.Groups.AsNoTracking().SingleOrDefaultAsync(x => x.Id == groupId && x.CoachId == accounts.UserId, ct) ?? throw ApiException.NotFound();
        if (g.TeamId != null)
            throw ApiException.Conflict("Team client groups cannot be linked to chat yet. Direct conversations remain private.");
        var ids = await (
            from m in db.Memberships
            join r in db.Relationships on m.RelationshipId equals r.Id
            where m.GroupId == groupId && r.Status == RelationshipStatus.Active
            select r.ClientId).Distinct().ToArrayAsync(ct);
        return new(g.Id, g.CoachId, g.Name, g.Archived, ids);
    }
}
