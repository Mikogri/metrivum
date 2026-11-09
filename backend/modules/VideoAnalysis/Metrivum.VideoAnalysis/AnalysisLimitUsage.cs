using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Metrivum.Access.Contracts;
using Metrivum.VideoAnalysis.Infrastructure;

namespace Metrivum.VideoAnalysis;

/// <summary>Reads analysis usage for Access quota decisions.</summary>
public sealed class AnalysisLimitUsage(VideoAnalysisDbContext db, IOptions<AnalysisOptions> options) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        if (options.Value.MaxConcurrentPerOwner == 0)
            return [];
        var active = await db.Jobs.CountAsync(x => x.OwnerId == ownerId && (x.Status == "Queued" || x.Status == "Processing"), cancellationToken);
        return [new("analysis.concurrent", options.Value.MaxConcurrentPerOwner, active)];
    }
}
