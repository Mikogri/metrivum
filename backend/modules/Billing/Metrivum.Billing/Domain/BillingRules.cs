using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;

namespace Metrivum.Billing.Domain;

public static class BillingRules
{
    public static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    public static (decimal Fee, decimal Net) Split(decimal gross, decimal rate)
    {
        if (gross < 0 || rate is < 0 or > 1 || decimal.Round(rate, 6) != rate)
            throw ApiException.Invalid("Gross must be non-negative; fee rate must be 0–1 with at most six decimals.");
        var fee = Round(gross * rate);
        return (fee, gross - fee);
    }
    public static DateTimeOffset PeriodAt(DateTimeOffset anchor, int periodCount, PeriodUnit unit, int sequence)
    {
        try
        {
            var count = checked(periodCount * sequence);
            return unit switch
            {
                PeriodUnit.Week => anchor.AddDays(checked(count * 7)),
                PeriodUnit.Month => anchor.AddMonths(count),
                PeriodUnit.Year => anchor.AddYears(count),
                _ => throw ApiException.Invalid("Unknown period unit.")
            };
        }
        catch (Exception error) when (error is OverflowException or ArgumentOutOfRangeException) { throw ApiException.Invalid("Subscription period exceeds the supported date range."); }
    }
    public static DateTimeOffset DueAt(PaymentTerms terms, DateTimeOffset start, DateTimeOffset? end)
    {
        try
        {
            return terms.Rule switch
            {
                DueRule.Upfront or DueRule.OnStart => start,
                DueRule.EndOfServicePeriod => end ?? throw ApiException.Invalid("EndOfServicePeriod requires a subscription service period."),
                DueRule.EndOfCalendarMonth => new DateTimeOffset(start.Year, start.Month, 1, 0, 0, 0, TimeSpan.Zero).AddMonths(1),
                DueRule.CustomOffsetDays when terms.OffsetDays is >= 0 and <= 365 => start.AddDays(terms.OffsetDays.Value),
                _ => throw ApiException.Invalid("Invalid payment timing.")
            };
        }
        catch (ArgumentOutOfRangeException) { throw ApiException.Invalid("Payment due date exceeds the supported range."); }
    }
}
