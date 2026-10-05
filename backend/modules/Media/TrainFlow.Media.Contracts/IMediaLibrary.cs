namespace TrainFlow.Media.Contracts;

public sealed record ReadyMedia(Guid Id, Guid OwnerId, string Bucket, string ObjectKey, string ContentType, long Size);

public interface IMediaLibrary
{
    Task<ReadyMedia> RequireReadyAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);
    Task<Stream> OpenReadAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);
    Task PinAsync(Guid id, Guid ownerId, CancellationToken cancellationToken);
}
