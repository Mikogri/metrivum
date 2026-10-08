using System.Text.Json.Serialization;

namespace TrainFlow.Billing.Domain;

[JsonConverter(typeof(JsonStringEnumConverter<BillingContext>))]
public enum BillingContext
{
    CoachingService, Platform
}

public sealed class PlatformPlan
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal CommissionRate
    {
        get; set;
    }
}
public sealed class PlanPrice
{
    public Guid Id
    {
        get; set;
    }
    public string PlanId { get; set; } = "Pro";
    public string Version { get; set; } = "";
    public decimal Amount
    {
        get; set;
    }
    public string Currency { get; set; } = "EUR";
    public string TermsVersion { get; set; } = "v1";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
public sealed class PlatformSubscription
{
    public Guid Id
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public string PlanId { get; set; } = "Free";
    public string Status { get; set; } = "Active";
    public Guid? AcceptedPriceId
    {
        get; set;
    }
    public DateTimeOffset? PeriodStart
    {
        get; set;
    }
    public DateTimeOffset? PeriodEnd
    {
        get; set;
    }
    public DateTimeOffset? NextDueAt
    {
        get; set;
    }
    public bool AutoRenew
    {
        get; set;
    }
    public Guid? PaymentMethodId
    {
        get; set;
    }
    public string? CheckoutTeamName
    {
        get; set;
    }
    public string? PendingPlanId
    {
        get; set;
    }
    public Guid? PendingDueId
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
}
public sealed class PlanChange
{
    public Guid Id
    {
        get; set;
    }
    public Guid SubscriptionId
    {
        get; set;
    }
    public string Type { get; set; } = "";
    public string PlanId { get; set; } = "";
    public Guid? DueId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset? EffectiveAt
    {
        get; set;
    }
}

public sealed class Team
{
    public Guid Id
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public string Description { get; set; } = "";
    public string Status { get; set; } = "Active";
    public long Version { get; set; } = 1;
    public DateTimeOffset? DissolutionAt
    {
        get; set;
    }
    public Guid? PendingOwnerId
    {
        get; set;
    }
    public DateTimeOffset? OwnershipExpiresAt
    {
        get; set;
    }
}
public sealed class TeamMembership
{
    public Guid TeamId
    {
        get; set;
    }
    public Guid UserId
    {
        get; set;
    }
    public DateTimeOffset JoinedAt
    {
        get; set;
    }
    public string Role { get; set; } = "Member";
    public string Status { get; set; } = "Active";
    public DateTimeOffset? EndedAt
    {
        get; set;
    }
}
public sealed class TeamRequest
{
    public Guid Id
    {
        get; set;
    }
    public Guid TeamId
    {
        get; set;
    }
    public Guid UserId
    {
        get; set;
    }
    public string Kind { get; set; } = "Join";
    public string Status { get; set; } = "Pending";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public Guid InviterId
    {
        get; set;
    }
    public string Role { get; set; } = "Member";
    public DateTimeOffset? ExpiresAt
    {
        get; set;
    }
    public DateTimeOffset? DecidedAt
    {
        get; set;
    }
}

public sealed class TeamAudit
{
    public Guid Id
    {
        get; set;
    }
    public Guid TeamId
    {
        get; set;
    }
    public Guid? ActorId
    {
        get; set;
    }
    public Guid? SubjectId
    {
        get; set;
    }
    public string Action { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public long Version
    {
        get; set;
    }
}
