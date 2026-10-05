using TrainFlow.Accounts.Domain;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.UnitTests;

public sealed class AccountAccessEdgeTests
{
    [Theory]
    [InlineData("coach\n")]
    [InlineData("abc\r\n")]
    public void Username_rejects_trailing_line_breaks(string username)
        => Assert.Throws<ApiException>(() => AccountRules.ValidateOnboarding(username, "Coach", new DateOnly(1990, 1, 1), true, "en", "UTC", new DateOnly(2026, 10, 5)));

    [Fact]
    public void Display_name_rejects_null_characters_before_postgres_write()
        => Assert.Throws<ApiException>(() => AccountRules.ValidateSettings("Coach\0Name", "en", "UTC"));

    [Fact]
    public void Display_name_rejects_invalid_unicode_before_postgres_write()
        => Assert.Throws<ApiException>(() => AccountRules.ValidateSettings(new string((char)0xD800, 1), "en", "UTC"));
}
