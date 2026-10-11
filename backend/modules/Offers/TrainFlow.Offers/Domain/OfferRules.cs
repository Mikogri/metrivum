using System.Text;
using TrainFlow.BuildingBlocks;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.Offers.Domain;

public static class OfferRules
{
    // numeric(28,2) monetary storage; no commercial price cap.
    public const decimal MaximumAmount = 99999999999999999999999999.99m;
    public static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    public static void Validate(BillingOptionSnapshot option)
    {
        if (option.Id == Guid.Empty || string.IsNullOrWhiteSpace(option.Name) || option.Name.Length > 120 || !Enum.IsDefined(option.Model) || option.Price < 0 || option.Price > MaximumAmount || Round(option.Price) != option.Price)
            throw ApiException.Invalid("Billing option requires an id, name and non-negative price with at most two decimals.");
        if (option.ValidityDays is < 1 or > 36500 || (option.ValidityDays != null && option.Model is BillingModel.PeriodSubscription or BillingModel.OneTime))
            throw ApiException.Invalid("Session validity must be 1–36500 days; subscriptions use their billing period.");
        switch (option.Model)
        {
            case BillingModel.OneTime:
            case BillingModel.PerSession:
                if (option.MinSessions != null || option.MaxSessions != null || option.SessionCount != null || option.PeriodCount != null || option.PeriodUnit != null)
                    throw ApiException.Invalid("PerSession accepts price only.");
                break;
            case BillingModel.CustomPackage:
                if (option.MinSessions is not >= 1 || option.MaxSessions is not >= 1 || option.MinSessions > option.MaxSessions || option.SessionCount != null || option.PeriodCount != null || option.PeriodUnit != null)
                    throw ApiException.Invalid("CustomPackage requires a positive inclusive session range.");
                Multiply(option.Price, option.MaxSessions.Value);
                break;
            case BillingModel.FixedPackage:
                if (option.SessionCount is not >= 1 || option.MinSessions != null || option.MaxSessions != null || option.PeriodCount != null || option.PeriodUnit != null)
                    throw ApiException.Invalid("FixedPackage requires a positive session count and total price.");
                break;
            case BillingModel.PeriodSubscription:
                if (option.MinSessions != null || option.MaxSessions != null || option.SessionCount != null || option.PeriodCount is not >= 1 || option.PeriodUnit == null || !Enum.IsDefined(option.PeriodUnit.Value) || (option.PeriodUnit == PeriodUnit.Week && option.PeriodCount > 52) || (option.PeriodUnit == PeriodUnit.Month && option.PeriodCount > 12) || (option.PeriodUnit == PeriodUnit.Year && option.PeriodCount != 1))
                    throw ApiException.Invalid("Subscription period must be between one week and one year.");
                break;
        }
        var terms = option.PaymentTerms ?? new(DueRule.Upfront);
        if (!Enum.IsDefined(terms.Rule) || (terms.Rule == DueRule.CustomOffsetDays ? terms.OffsetDays is null or < 0 or > 365 : terms.OffsetDays != null))
            throw ApiException.Invalid("CustomOffsetDays requires 0–365 days; other rules do not accept an offset.");
        if (option.Model == BillingModel.OneTime && terms.Rule != DueRule.Upfront)
            throw ApiException.Invalid("Plan purchases require upfront payment.");
        if (terms.Rule == DueRule.EndOfServicePeriod && option.Model != BillingModel.PeriodSubscription)
            throw ApiException.Invalid("EndOfServicePeriod requires a subscription with an explicit service period.");
    }
    public static decimal Amount(BillingOptionSnapshot option, int? selected)
    {
        Validate(option);
        if (option.Model == BillingModel.CustomPackage)
        {
            if (selected == null || selected < option.MinSessions || selected > option.MaxSessions)
                throw ApiException.Invalid("Selected session count is outside the published range.");
            return Multiply(option.Price, selected.Value);
        }
        if (selected != null)
            throw ApiException.Invalid("Only CustomPackage accepts a selected session count.");
        return option.Price;
    }
    private static decimal Multiply(decimal price, int count)
    {
        try
        {
            var amount = Round(price * count);
            if (amount > MaximumAmount)
                throw ApiException.Invalid("Package total exceeds monetary storage precision.");
            return amount;
        }
        catch (OverflowException) { throw ApiException.Invalid("Package total exceeds monetary storage precision."); }
    }
    public static string NormalizeTag(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw ApiException.Invalid("A tag cannot be empty.");
        var tag = value.Normalize(NormalizationForm.FormKC).Trim().ToLowerInvariant();
        if (tag.Length is < 1 or > 60 || tag.Any(c => !(char.IsLetterOrDigit(c) || c is '-' or ' ')))
            throw ApiException.Invalid("Tags use letters, numbers, spaces and hyphens, up to 60 characters.");
        return string.Join(' ', tag.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
