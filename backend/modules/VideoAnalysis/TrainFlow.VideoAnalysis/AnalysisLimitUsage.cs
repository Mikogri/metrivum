using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.Access.Contracts;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public sealed class AnalysisLimitUsage(VideoAnalysisDbContext db, IOptions<AnalysisOptions> options) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        var active = await db.Jobs.CountAsync(x => x.OwnerId == ownerId && (x.Status == "Queued" || x.Status == "Processing"), cancellationToken);
        return [new("analysis.concurrent", options.Value.MaxConcurrentPerOwner, active)];
    }
}
