using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Billing.Infrastructure;

public sealed class TeamContext(BillingDbContext db, TimeProvider clock) : ITeamContext
{
    public async Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return await (from member in db.TeamMemberships.AsNoTracking()
                      join team in db.Teams.AsNoTracking() on member.TeamId equals team.Id
                      where member.UserId == userId && member.Status == "Active" && team.Status != "Dissolved"
                      select new TeamAccess(team.Id, team.OwnerId, member.Role, team.Status,
                          (team.Status == "Active" || team.Status == "DissolutionScheduled") &&
                          db.Set<TeamPlatformSubscription>().Any(s => s.TeamId == team.Id && s.Status == "Active" && s.PeriodEnd > now), team.Name)).SingleOrDefaultAsync(ct);
    }

    public async Task<TeamAccess> RequireAsync(Guid teamId, Guid userId, bool administrative, CancellationToken ct)
    {
        var context = await GetForUserAsync(userId, ct);
        if (context is null || context.TeamId != teamId || !context.IsActive || administrative && context.Role is not ("Owner" or "Admin"))
            throw ApiException.NotFound();
        return context;
    }
}
