using System.Text.Json.Serialization;

namespace TrainFlow.Billing.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<SettlementMode>))]
public enum SettlementMode
{
    Simulated, External
}
public sealed record CreateServiceOrderCommand(Guid ServiceId, Guid RelationshipId, Guid CoachId, Guid ClientId,
    Guid OfferRevisionId, Guid BillingOptionId, int? SelectedSessionCount, DateTimeOffset StartedAt, SettlementMode SettlementMode = SettlementMode.Simulated, Guid? TeamId = null, Guid? TeamClientCaseId = null);
public sealed record ServiceOrderSnapshot(Guid OrderId, Guid PaymentDueId, decimal Amount, string Currency,
    decimal FeeRate, decimal FeeAmount, decimal CoachNetAmount, DateTimeOffset DueAt, Guid? SubscriptionId);
public interface IBillingOrders
{
    // Trusted Coaching workflow only; prices and fee snapshots are computed by Billing.
    Task<ServiceOrderSnapshot> CreateForServiceAsync(CreateServiceOrderCommand command, CancellationToken ct);
    Task EndServiceAsync(Guid serviceId, CancellationToken ct);
    Task<bool> HasOutstandingPersonalObligationsAsync(Guid relationshipId, CancellationToken ct) => Task.FromResult(true);
}
