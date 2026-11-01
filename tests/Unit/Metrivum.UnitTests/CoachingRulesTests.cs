using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Features;

namespace Metrivum.UnitTests;

public sealed class CoachingRulesTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("+48 123 456 789")]
    public void Optional_phone_accepts_empty_or_phone_characters(string? phone) => AccountRules.ValidatePhone(phone);

    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("123")]
    [InlineData("+48\n123456789")]
    public void Phone_rejects_non_phone_content(string phone) => Assert.Throws<ApiException>(() => AccountRules.ValidatePhone(phone));

    [Fact]
    public void A_stale_version_is_rejected_even_when_the_command_would_be_a_noop()
    {
        CoachingService.CheckVersion(4, 4);
        var error = Assert.Throws<ApiException>(() => CoachingService.CheckVersion(4, 3));
        Assert.Equal(412, error.Status);
        Assert.Equal("VERSION_CONFLICT", error.Code);
    }
}
