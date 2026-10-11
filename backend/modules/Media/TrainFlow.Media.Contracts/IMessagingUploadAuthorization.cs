namespace TrainFlow.Media.Contracts;

public interface IMessagingUploadAuthorization
{
    Task RequireUploadAsync(Guid conversationId, CancellationToken ct);
}
