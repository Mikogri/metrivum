using System.Security.Claims;
using TrainFlow.Billing.Features;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.UnitTests;

public sealed class TeamSecurityTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1800000000);

    [Fact]
    public void RefreshedTokenIsNotRecentAuthentication()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new("iat", Now.ToUnixTimeSeconds().ToString())], "test"));
        Assert.Equal("REAUTHENTICATION_REQUIRED", Assert.Throws<ApiException>(() => TeamSecurity.RequireRecentAuthentication(user, Now)).Code);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(600, true)]
    [InlineData(601, false)]
    [InlineData(-60, false)]
    public void AuthenticationMustBeRecentAndNotInFuture(int secondsAgo, bool allowed)
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new("auth_time", Now.AddSeconds(-secondsAgo).ToUnixTimeSeconds().ToString())], "test"));
        if (allowed)
            TeamSecurity.RequireRecentAuthentication(user, Now);
        else
            Assert.Throws<ApiException>(() => TeamSecurity.RequireRecentAuthentication(user, Now));
    }

    [Fact]
    public void ExpandedJwtAmrObjectIsAccepted()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new("amr", "{\"method\":\"password\",\"timestamp\":1800000000}")], "test"));
        TeamSecurity.RequireRecentAuthentication(user, Now);
    }

    [Fact]
    public void SupabasePasswordAuthenticationTimestampIsAccepted()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new("amr", "[{\"method\":\"password\",\"timestamp\":1800000000}]")], "test"));
        TeamSecurity.RequireRecentAuthentication(user, Now);
    }
}
