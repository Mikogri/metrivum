using TrainFlow.BuildingBlocks;
namespace TrainFlow.Billing.Domain;

public sealed class TeamPlatformSubscription
{
    public string? PendingPlanId { get; set; }
    public Guid TeamId
    {
        get; set;
    }
    public Guid AcceptedPriceId
    {
        get; set;
    }
    public int PurchasedSeats
    {
        get; set;
    }
    public int? PendingSeats
    {
        get; set;
    }
    public DateTimeOffset PeriodStart
    {
        get; set;
    }
    public DateTimeOffset PeriodEnd
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
    public string Status { get; set; } = "Active";
    public long Version { get; set; } = 1;
}
public sealed class TeamBillingQuote
{
    public Guid Id
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public Guid TeamId
    {
        get; set;
    }
    public string TeamName { get; set; } = "";
    public string Kind { get; set; } = "Initial";
    public string Status { get; set; } = "Pending";
    public int PurchasedSeats
    {
        get; set;
    }
    public Guid PriceId
    {
        get; set;
    }
    public decimal GrossAmount
    {
        get; set;
    }
    public decimal CreditAmount
    {
        get; set;
    }
    public decimal AmountDue
    {
        get; set;
    }
    public string Currency { get; set; } = "";
    public bool AutoRenew
    {
        get; set;
    }
    public Guid? PaymentMethodId
    {
        get; set;
    }
    public Guid? DueId
    {
        get; set;
    }
    public Guid? SourceSubscriptionId
    {
        get; set;
    }
    public Guid? SourcePaymentId
    {
        get; set;
    }
    public DateTimeOffset? SourcePeriodStart
    {
        get; set;
    }
    public DateTimeOffset? SourcePeriodEnd
    {
        get; set;
    }
    public long? SubscriptionVersion
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset ExpiresAt
    {
        get; set;
    }
    public DateTimeOffset? ConfirmedAt
    {
        get; set;
    }
}
public sealed class ProrationCredit
{
    public Guid Id
    {
        get; set;
    }
    public Guid QuoteId
    {
        get; set;
    }
    public Guid OrderId
    {
        get; set;
    }
    public Guid SourceSubscriptionId
    {
        get; set;
    }
    public Guid SourcePaymentId
    {
        get; set;
    }
    public DateTimeOffset SourcePeriodStart
    {
        get; set;
    }
    public DateTimeOffset SourcePeriodEnd
    {
        get; set;
    }
    public decimal Amount
    {
        get; set;
    }
    public string Currency { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
public static class TeamBillingRules
{
    public static decimal UnusedValue(decimal actuallyPaid, DateTimeOffset start, DateTimeOffset end, DateTimeOffset at)
    {
        if (actuallyPaid <= 0 || end <= start || at >= end)
            return 0;
        var remaining = Math.Min((end - at).Ticks, (end - start).Ticks);
        return decimal.Round(actuallyPaid * remaining / (end - start).Ticks, 2, MidpointRounding.AwayFromZero);
    }
    public static decimal AmountDue(decimal gross, decimal credit)
    {
        if (credit > gross)
            throw ApiException.Conflict("Unused Pro value exceeds this Team bill. A noncash credit policy must be configured before this upgrade can proceed; no paid value has been consumed.");
        return Math.Max(0, gross - credit);
    }
}
