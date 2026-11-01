namespace Metrivum.Billing.Domain;

public sealed class SimulatedRefund
{
    public Guid Id { get; set; }
    public Guid PaymentId { get; set; }
    public Guid OwnerId { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "PLN";
    public DateTimeOffset CreatedAt { get; set; }
}
