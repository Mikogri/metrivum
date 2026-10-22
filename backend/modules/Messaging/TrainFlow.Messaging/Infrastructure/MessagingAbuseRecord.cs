namespace TrainFlow.Messaging.Infrastructure;

public sealed class MessagingAbuseRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? RecipientId { get; set; }
    public string Kind { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
