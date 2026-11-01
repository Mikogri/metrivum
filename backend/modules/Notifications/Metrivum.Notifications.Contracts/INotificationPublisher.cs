namespace Metrivum.Notifications.Contracts;

public sealed record NotificationEvent(
    Guid RecipientUserId,
    string EventKey,
    string Type,
    string Category,
    string SourceModule,
    Guid SourceId,
    string? DeepLink = null,
    DateTimeOffset? AvailableAt = null,
    bool Required = false);
public interface INotificationPublisher
{
    Task PublishAsync(NotificationEvent notification, CancellationToken ct);
    Task CancelScheduledAsync(string sourceModule, Guid sourceId, CancellationToken ct);
}

public interface INotificationDeliveryPolicy
{
    string SourceModule
    {
        get;
    }
    Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct);
}
