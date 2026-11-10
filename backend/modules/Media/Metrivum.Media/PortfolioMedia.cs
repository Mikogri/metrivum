using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Metrivum.Media.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Media;

/// <summary>Coach portfolio files (certificates, client results): images and PDFs under the owner's portfolio folder.</summary>
public sealed partial class MediaLibrary : IPortfolioMedia
{
    public async Task<DocumentUpload> CreatePortfolioUploadAsync(
        Guid ownerId,
        string name,
        string contentType,
        long size,
        CancellationToken ct
    )
    {
        if (contentType is not ("image/png" or "image/jpeg" or "image/webp" or "application/pdf"))
            throw ApiException.Invalid("Portfolio accepts PNG, JPEG, WebP and PDF files.");
        var upload = await CreateCoreAsync(
            ownerId,
            new(name, contentType, size),
            true,
            ct,
            portfolio: true
        );
        return new(upload.File.Id, upload.UploadUrl, upload.ExpiresAt, upload.Method);
    }

    private async Task<MediaFile> PortfolioFileAsync(
        Guid ownerId,
        Guid mediaId,
        CancellationToken ct
    )
    {
        var file = await OwnedAsync(mediaId, ownerId, ct);
        if (
            file.Purpose != "Portfolio"
            || !file.ObjectKey.StartsWith($"{ownerId:N}/portfolio/", StringComparison.Ordinal)
        )
            throw ApiException.NotFound();
        return file;
    }

    public async Task<ReadyMedia> AttachPortfolioAsync(
        Guid ownerId,
        Guid mediaId,
        CancellationToken ct
    )
    {
        await PortfolioFileAsync(ownerId, mediaId, ct);
        await FinalizeCoreAsync(mediaId, ownerId, ct, true);
        await PinAsync(mediaId, ownerId, ct);
        var file = await PortfolioFileAsync(ownerId, mediaId, ct);
        return new(file.Id, file.OwnerId, file.Bucket, file.ObjectKey, file.ContentType, file.Size);
    }

    public async Task<DocumentReadUrl> ReadPortfolioAsync(
        Guid ownerId,
        Guid mediaId,
        Guid viewerId,
        CancellationToken ct
    )
    {
        var file = await PortfolioFileAsync(ownerId, mediaId, ct);
        if (file.State != "Ready")
            throw ApiException.NotFound();
        if (abuse is not null)
            await abuse.RequireAsync(viewerId, AbusePolicies.SignedDownload, cancellationToken: ct);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        await ValidateAsync(file, actual, ct);
        return new(
            await storage.CreateReadUrlAsync(file.Bucket, file.ObjectKey, ct),
            DateTimeOffset.UtcNow.AddSeconds(options.ReadUrlSeconds)
        );
    }

    public async Task ReleasePortfolioAsync(Guid ownerId, Guid mediaId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await db
            .Files.Where(x =>
                x.Id == mediaId
                && x.OwnerId == ownerId
                && x.Purpose == "Portfolio"
                && x.State != "Deleting"
                && x.State != "Deleted"
            )
            .ExecuteUpdateAsync(
                update =>
                    update
                        .SetProperty(x => x.Pinned, false)
                        .SetProperty(x => x.State, "Deleting")
                        .SetProperty(
                            x => x.DeleteAfter,
                            x => x.UploadExpiresAt > now ? x.UploadExpiresAt : now
                        )
                        .SetProperty(x => x.Version, x => x.Version + 1),
                ct
            );
    }
}
