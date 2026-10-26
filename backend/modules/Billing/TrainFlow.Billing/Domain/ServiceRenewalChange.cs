namespace TrainFlow.Billing.Domain;

/// <summary>A dated cancellation event, not a monetary transaction or an inferred historical charge.</summary>
public sealed class ServiceRenewalChange
{
    public Guid Id { get; set; }
    public Guid SubscriptionId { get; set; }
    public Guid ActorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
