namespace Metrivum.Notifications.Contracts;

public interface INotificationReadStore
{
    Task<string[]> UnreadEventKeysAsync(
        Guid recipient,
        string module,
        Guid source,
        string type,
        CancellationToken ct
    );
    Task MarkReadAsync(Guid recipient, string[] eventKeys, CancellationToken ct);
}
