namespace TrainFlow.Media.Contracts;

public sealed record DocumentUpload(Guid MediaId, string UploadUrl, DateTimeOffset ExpiresAt, string Method);
public sealed record DocumentReadUrl(string Url, DateTimeOffset ExpiresAt);

// Trusted documentation workflow only: authorize current relationship and visibility before every call.
public interface IDocumentMedia
{
    Task<DocumentUpload> CreateDocumentUploadAsync(Guid relationshipId, Guid ownerId, string name, string contentType, long size, CancellationToken ct);
    Task FinalizeDocumentUploadAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct);
    Task<ReadyMedia> RequireDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct);
    Task PinDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct);
    Task<DocumentReadUrl> ReadDocumentAsync(Guid relationshipId, Guid ownerId, Guid mediaId, CancellationToken ct);
}
