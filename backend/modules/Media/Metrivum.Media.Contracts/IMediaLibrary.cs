namespace Metrivum.Media.Contracts;

public sealed record MediaReadUrl(string Url, DateTimeOffset ExpiresAt);

public sealed record ReadyMedia(
    Guid Id,
    Guid OwnerId,
    string Bucket,
    string ObjectKey,
    string ContentType,
    long Size,
    long? DurationMs = null
);

public interface IMediaLibrary
{
    Task<ReadyMedia> RequireReadyAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);
    Task<Stream> OpenReadAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);
    Task PinAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);

    /// <summary>
    /// A short-lived read URL for another module that has already authorised <paramref name="viewerId"/>
    /// (e.g. through a shared link); download limits are charged to the viewer, not the owner.
    /// </summary>
    Task<MediaReadUrl> ReadUrlForAsync(
        Guid id,
        Guid ownerId,
        Guid viewerId,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException();

    /// <summary>
    /// Deletes an owner's analysis video that nothing uses any more (its analysis was deleted): unpinned and scheduled
    /// for removal like a user delete. Missing or already deleted files are ignored.
    /// </summary>
    Task ReleaseVideoAsync(Guid id, Guid ownerId, CancellationToken cancellationToken) =>
        throw new NotSupportedException();
}
