using System.Text.RegularExpressions;
using Metrivum.BuildingBlocks;

namespace Metrivum.Accounts.Domain;

public static partial class AccountRules
{
    public static void ValidateOnboarding(string username, string displayName, DateOnly birthDate, bool acceptedTerms,
        string locale, string timeZone, DateOnly today)
    {
        AccountIdentityPolicy.ValidateUsername(username);
        ValidateSettings(displayName, locale, timeZone);
        if (birthDate > today.AddYears(-18) || birthDate < today.AddYears(-120))
            throw ApiException.Invalid("A declared age of at least 18 years is required.");
        if (!acceptedTerms)
            throw ApiException.Invalid("Accept the current terms to complete onboarding.");
    }

    public static void ValidateSettings(string displayName, string locale, string timeZone)
    {
        _ = AccountIdentityPolicy.NormalizeDisplayName(displayName);
        if (locale is not ("en" or "pl"))
            throw ApiException.Invalid("Supported locales are en and pl.");
        if (string.IsNullOrWhiteSpace(timeZone) || timeZone.Length > 100 || !TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _))
            throw ApiException.Invalid("A valid time zone is required.");
    }

    public static void ValidatePhone(string? phone)
    {
        if (!string.IsNullOrEmpty(phone) && !Regex.IsMatch(phone, @"\A\+?[0-9][0-9 ()-]{5,30}[0-9]\z", RegexOptions.CultureInvariant))
            throw ApiException.Invalid("Phone must contain 7–32 phone-number characters.");
    }
}
