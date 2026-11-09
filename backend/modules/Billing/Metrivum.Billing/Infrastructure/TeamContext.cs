using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.BuildingBlocks;

namespace Metrivum.Billing.Infrastructure;

/// <summary>Resolves the current team workspace and membership permissions from Billing state.</summary>
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
        // Membership keeps historical records accessible after billing expiry; writes check IsActive in their owning module.
        if (context is null || context.TeamId != teamId || administrative && context.Role is not ("Owner" or "Admin"))
            throw ApiException.NotFound();
        return context;
    }
}
