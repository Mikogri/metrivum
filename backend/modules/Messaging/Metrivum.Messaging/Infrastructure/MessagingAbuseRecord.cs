namespace Metrivum.Messaging.Infrastructure;

/// <summary>Represents persisted messaging abuse record state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MessagingAbuseRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? RecipientId { get; set; }
    public string Kind { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
