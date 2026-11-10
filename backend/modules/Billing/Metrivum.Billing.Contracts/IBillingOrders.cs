using System.Text.Json.Serialization;

namespace Metrivum.Billing.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<SettlementMode>))]
public enum SettlementMode
{
    Simulated,
    External,
}

public sealed record CreateServiceOrderCommand(
    Guid ServiceId,
    Guid RelationshipId,
    Guid CoachId,
    Guid ClientId,
    Guid OfferRevisionId,
    Guid BillingOptionId,
    int? SelectedSessionCount,
    DateTimeOffset StartedAt,
    SettlementMode SettlementMode = SettlementMode.Simulated,
    Guid? TeamId = null,
    Guid? TeamClientCaseId = null
);

public sealed record ServiceOrderSnapshot(
    Guid OrderId,
    Guid PaymentDueId,
    decimal Amount,
    string Currency,
    decimal FeeRate,
    decimal FeeAmount,
    decimal CoachNetAmount,
    DateTimeOffset DueAt,
    Guid? SubscriptionId
);

public sealed record ServiceBillingState(
    string Status,
    int? RemainingSessions,
    DateTimeOffset? PeriodStart,
    DateTimeOffset? PeriodEnd,
    DateTimeOffset? NextDueAt,
    decimal? NextDueAmount,
    string? Currency,
    DateTimeOffset? ValidUntil = null,
    bool IsExpired = false
);

public sealed record CreatePlanPurchaseOrderCommand(
    Guid ApplicationId,
    Guid CoachId,
    Guid ClientId,
    Guid OfferRevisionId,
    Guid BillingOptionId,
    Guid TrainingPlanRevisionId,
    SettlementMode SettlementMode,
    Guid? TeamId = null
);

public interface IBillingOrders
{
    Task<IReadOnlyDictionary<Guid, ServiceBillingState>> GetServiceStatesAsync(
        IReadOnlyCollection<Guid> serviceIds,
        CancellationToken ct
    ) =>
        Task.FromResult<IReadOnlyDictionary<Guid, ServiceBillingState>>(
            new Dictionary<Guid, ServiceBillingState>()
        );
    Task<ServiceOrderSnapshot> CreateForPlanPurchaseAsync(
        CreatePlanPurchaseOrderCommand command,
        CancellationToken ct
    ) => throw new NotSupportedException("Plan purchases are unavailable.");

    // Trusted Coaching workflow only; prices and fee snapshots are computed by Billing.
    Task<ServiceOrderSnapshot> CreateForServiceAsync(
        CreateServiceOrderCommand command,
        CancellationToken ct
    );
    Task EndServiceAsync(Guid serviceId, CancellationToken ct);
    Task<bool> HasOutstandingPersonalObligationsAsync(Guid relationshipId, CancellationToken ct) =>
        Task.FromResult(true);
}
