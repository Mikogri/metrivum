namespace Metrivum.Media.Contracts;

// Trusted coach-portfolio workflow only: the caller checks the coach owns the item before upload, release or read.
public interface IPortfolioMedia
{
    Task<DocumentUpload> CreatePortfolioUploadAsync(Guid ownerId, string name, string contentType, long size, CancellationToken ct);
    /// <summary>Verifies the uploaded object and pins it so cleanup keeps it while the portfolio item exists.</summary>
    Task<ReadyMedia> AttachPortfolioAsync(Guid ownerId, Guid mediaId, CancellationToken ct);
    /// <summary>A short-lived read link for any signed-in viewer of the coach's public profile.</summary>
    Task<DocumentReadUrl> ReadPortfolioAsync(Guid ownerId, Guid mediaId, Guid viewerId, CancellationToken ct);
    /// <summary>Unpins and schedules the object for deletion.</summary>
    Task ReleasePortfolioAsync(Guid ownerId, Guid mediaId, CancellationToken ct);
}
