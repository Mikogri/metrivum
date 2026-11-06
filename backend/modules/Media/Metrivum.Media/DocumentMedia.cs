using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Metrivum.Media.Infrastructure;

namespace Metrivum.Media;

public sealed partial class MediaLibrary
{
    public async Task<DocumentUpload> CreateDocumentUploadAsync(Guid relationshipId, Guid ownerId, string name, string contentType, long size, CancellationToken ct)
    {
        if (contentType is not ("image/png" or "image/jpeg" or "image/webp" or "application/pdf" or "text/plain"))
            throw ApiException.Invalid("Documentation accepts PNG, JPEG, WebP, PDF and plain text files.");
        var upload = await CreateCoreAsync(ownerId, new(name, contentType, size), true, ct, relationshipId);
        return new(upload.File.Id, upload.UploadUrl, upload.ExpiresAt, upload.Method);
    }

    private async Task<MediaFile> DocumentFileAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct)
    {
        var file = await OwnedAsync(mediaId, ownerId, ct);
        if (file.Purpose != "Documentation" || !file.ObjectKey.StartsWith($"{ownerId:N}/documentation/{relationshipId:N}/", StringComparison.Ordinal))
            throw ApiException.NotFound();
        return file;
    }

    public async Task FinalizeDocumentUploadAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct)
    {
        await DocumentFileAsync(relationshipId, ownerId, mediaId, ct);
        await FinalizeCoreAsync(mediaId, ownerId, ct, true);
    }

    public async Task<ReadyMedia> RequireDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct)
    {
        var file = await DocumentFileAsync(relationshipId, ownerId, mediaId, ct);
        if (file.State != "Ready")
            throw new ApiException(409, "MEDIA_NOT_READY", "Finish uploading the file first.");
        return new(file.Id, file.OwnerId, file.Bucket, file.ObjectKey, file.ContentType, file.Size);
    }

    public async Task PinDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct)
    {
        await RequireDocumentAsync(relationshipId, ownerId, mediaId, ct);
        await PinAsync(mediaId, ownerId, ct);
    }

    public async Task<DocumentReadUrl> ReadDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, Guid viewerId, CancellationToken ct)
    {
        var file = await RequireDocumentAsync(relationshipId, ownerId, mediaId, ct);
        if (abuse is not null) await abuse.RequireAsync(viewerId, AbusePolicies.SignedDownload, cancellationToken: ct);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        await ValidateAsync(await DocumentFileAsync(relationshipId, ownerId, mediaId, ct), actual, ct);
        return new(await storage.CreateReadUrlAsync(file.Bucket, file.ObjectKey, ct), DateTimeOffset.UtcNow.AddSeconds(options.ReadUrlSeconds));
    }
}
