namespace Metrivum.Billing.Domain;

/// <summary>Represents persisted simulated refund state in Billing; mapped and saved by the owning module's EF services.</summary>
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
