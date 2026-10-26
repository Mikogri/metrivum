namespace TrainFlow.Access.Domain;

public sealed class UsageReservation
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid ScopeId { get; set; }
    public string Key { get; set; } = "";
    public string Operation { get; set; } = "";
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset PeriodEnd { get; set; }
    public long Amount { get; set; }
    public string Status { get; set; } = "Reserved";
    public string? Consumer { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
