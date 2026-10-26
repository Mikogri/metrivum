using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.Access.Contracts;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.Media;

public sealed class MediaLimitUsage(MediaDbContext db, IOptions<StorageOptions> options) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var pending = await db.Files.CountAsync(x => x.OwnerId == ownerId && (x.State == "Pending" || x.State == "Deleting") && x.UploadExpiresAt > now, cancellationToken);
        return [new("media.maxVideoBytes", options.Value.AcceptedVideoBytes, 0), new("media.maxPendingUploads", options.Value.AcceptedPendingUploads, pending)];
    }
}
