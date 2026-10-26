using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Contracts;

namespace TrainFlow.Coaching.Infrastructure;

public sealed class ClientCapacity(CoachingDbContext db, IPlanEntitlementsProvider plans)
{
    public async Task RequireAsync(Guid coach, Guid client, Guid? teamId, CancellationToken ct)
    {
        // The caller already authorized the state transition. A client accepting Team consent
        // is not a Team member; resolve the validated assigned coach's organizational allowance.
        var plan = teamId is {} team ? await plans.GetForTeamAsync(coach, team, ct) : await plans.GetAsync(coach, ct);
        // One lock for the whole capacity, not one per coach/client pair.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"client-capacity:" + plan.ScopeId}, 0))", ct);
        var active = teamId == null
            ? db.Relationships.Where(x => x.Status == RelationshipStatus.Active && x.TeamId == null && x.CoachId == coach).Select(x => x.ClientId)
            : db.Set<TeamClientCase>().Where(x => x.TeamId == teamId && x.Status == "Active").Select(x => x.ClientId);
        if (await active.AnyAsync(x => x == client, ct)) return;
        var count = await active.Distinct().LongCountAsync(ct);
        var limit = plan.Limits["coaching.active_clients"];
        if (limit is {} maximum && count >= maximum)
            throw new ApiException(409, "LIMIT_EXCEEDED", $"Active client limit reached ({count}/{maximum}). Existing clients retain access.");
    }
}
