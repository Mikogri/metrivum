using System.Text.Json.Serialization;
using Metrivum.Billing.Contracts;
using Metrivum.Offers.Contracts;

namespace Metrivum.Billing.Domain;

[JsonConverter(typeof(JsonStringEnumConverter<DueStatus>))]
public enum DueStatus
{
    AwaitingPayment,
    Paid,
    PaidExternally,
    Free,
}

[JsonConverter(typeof(JsonStringEnumConverter<AttemptStatus>))]
public enum AttemptStatus
{
    Pending,
    Succeeded,
    Failed,
}

[JsonConverter(typeof(JsonStringEnumConverter<SimulatedOutcome>))]
public enum SimulatedOutcome
{
    Success,
    Decline,
}

/// <summary>Represents persisted order state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class Order
{
    public Guid? ApplicationId { get; set; }
    public Guid? TrainingPlanRevisionId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? TeamClientCaseId { get; set; }
    public BillingContext Context { get; set; }
    public Guid Id { get; set; }
    public Guid? ServiceId { get; set; }
    public Guid? RelationshipId { get; set; }
    public Guid CoachId { get; set; }
    public Guid ClientId { get; set; }
    public Guid OfferRevisionId { get; set; }
    public Guid BillingOptionId { get; set; }
    public int? SelectedSessionCount { get; set; }
    public string Name { get; set; } = "";
    public string OptionSnapshot { get; set; } = "{}";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EUR";
    public decimal FeeRate { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal CoachNetAmount { get; set; }
    public SettlementMode SettlementMode { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Represents persisted payment due state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class PaymentDue
{
    public int? ValidityDays { get; set; }
    public DateTimeOffset? ValidUntil { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? TeamClientCaseId { get; set; }
    public BillingContext Context { get; set; }
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid? ServiceId { get; set; }
    public Guid? RelationshipId { get; set; }
    public Guid CoachId { get; set; }
    public Guid ClientId { get; set; }
    public int Sequence { get; set; }
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset? PeriodEnd { get; set; }
    public DateTimeOffset DueAt { get; set; }
    public DueStatus Status { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EUR";
    public decimal FeeRate { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal CoachNetAmount { get; set; }
    public SettlementMode SettlementMode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? SettledAt { get; set; }
    public Guid? SettledBy { get; set; }
    public string? SettlementSource { get; set; }
}

/// <summary>Represents persisted payment method state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class PaymentMethod
{
    public Guid Id { get; set; }
    public Guid ClientId { get; set; }
    public string Label { get; set; } = "";
    public string Token { get; set; } = "";
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Represents persisted payment attempt state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class PaymentAttempt
{
    public Guid Id { get; set; }
    public Guid DueId { get; set; }
    public Guid? PaymentMethodId { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public AttemptStatus Status { get; set; }
    public string? FailureCode { get; set; }
    public string? ProviderReference { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>Represents persisted payment state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class Payment
{
    public Guid? TeamId { get; set; }
    public Guid? TeamClientCaseId { get; set; }
    public BillingContext Context { get; set; }
    public Guid Id { get; set; }
    public Guid DueId { get; set; }
    public Guid? AttemptId { get; set; }
    public Guid CoachId { get; set; }
    public Guid ClientId { get; set; }
    public decimal GrossAmount { get; set; }
    public decimal FeeRate { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal CoachNetAmount { get; set; }
    public string Currency { get; set; } = "EUR";
    public SettlementMode Mode { get; set; }
    public string Source { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public Guid? ActorId { get; set; }
    public DateTimeOffset SettledAt { get; set; }
}

/// <summary>Represents persisted payment transaction state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class PaymentTransaction
{
    public Guid Id { get; set; }
    public Guid PaymentId { get; set; }
    public Guid AttemptId { get; set; }
    public string Provider { get; set; } = "Simulated";
    public string ProviderReference { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EUR";
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Represents persisted subscription state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class Subscription
{
    public bool AutoRenew { get; set; }
    public Guid? PaymentMethodId { get; set; }
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid ServiceId { get; set; }
    public Guid ClientId { get; set; }
    public DateTimeOffset Anchor { get; set; }
    public int PeriodCount { get; set; }
    public PeriodUnit PeriodUnit { get; set; }
    public int NextSequence { get; set; } = 1;
    public DateTimeOffset NextPeriodAt { get; set; }
    public bool Active { get; set; } = true;
    public DateTimeOffset? EndedAt { get; set; }
    public DateTimeOffset? RetryAfter { get; set; }
}

/// <summary>Represents persisted renewal failure state in Billing; mapped and saved by the owning module's EF services.</summary>
public sealed class RenewalFailure
{
    public Guid Id { get; set; }
    public Guid SubscriptionId { get; set; }
    public int Sequence { get; set; }
    public int Attempts { get; set; }
    public string Code { get; set; } = "";
    public DateTimeOffset LastAttemptAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
}
