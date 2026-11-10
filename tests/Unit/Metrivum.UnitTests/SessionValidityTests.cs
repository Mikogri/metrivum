using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Domain;

namespace Metrivum.UnitTests;

public sealed class SessionValidityTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(36501)]
    public void Rejects_invalid_validity_days(int days)
    {
        var json = JsonSerializer.Serialize(
            new
            {
                Id = Guid.NewGuid(),
                Name = "Session",
                Model = "PerSession",
                Price = 10,
                ValidityDays = days,
            }
        );
        var option = JsonSerializer.Deserialize<BillingOptionSnapshot>(json)!;
        Assert.Throws<ApiException>(() => OfferRules.Validate(option));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(30)]
    [InlineData(36500)]
    public void Accepts_optional_validity_for_sessions(int? days)
    {
        var option = new BillingOptionSnapshot(
            Guid.NewGuid(),
            "Session",
            BillingModel.PerSession,
            10,
            ValidityDays: days
        );
        OfferRules.Validate(option);
        Assert.Equal(
            days,
            JsonSerializer
                .Deserialize<BillingOptionSnapshot>(JsonSerializer.Serialize(option))!
                .ValidityDays
        );
    }

    [Fact]
    public void Subscription_uses_its_period_instead_of_session_validity()
    {
        var option = new BillingOptionSnapshot(
            Guid.NewGuid(),
            "Subscription",
            BillingModel.PeriodSubscription,
            10,
            PeriodCount: 1,
            PeriodUnit: PeriodUnit.Month
        );
        OfferRules.Validate(option);
        Assert.Throws<ApiException>(() => OfferRules.Validate(option with { ValidityDays = 30 }));
    }
}
