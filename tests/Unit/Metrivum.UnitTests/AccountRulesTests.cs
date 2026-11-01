using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public class AccountRulesTests
{
    [Fact]
    public void Eighteenth_birthday_is_required()
    {
        Assert.Throws<ApiException>(() => AccountRules.ValidateOnboarding("coach", "Coach", new DateOnly(2008, 10, 6), true, "en", "UTC", new DateOnly(2026, 10, 5)));
        AccountRules.ValidateOnboarding("coach", "Coach", new DateOnly(2008, 10, 5), true, "en", "UTC", new DateOnly(2026, 10, 5));
    }

    [Theory]
    [InlineData("x", "en", "UTC")]
    [InlineData("valid", "de", "UTC")]
    [InlineData("valid", "en", "Not/AZone")]
    public void Invalid_profile_input_is_rejected(string username, string locale, string zone) =>
        Assert.Throws<ApiException>(() => AccountRules.ValidateOnboarding(username, "Coach", new DateOnly(1990, 1, 1), true, locale, zone, new DateOnly(2026, 10, 5)));
}
