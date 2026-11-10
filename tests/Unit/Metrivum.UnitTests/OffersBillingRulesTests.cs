using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Domain;

namespace Metrivum.UnitTests;

public sealed class OffersBillingRulesTests
{
    [Theory]
    [InlineData(0.01, 0.5, 0.01, 0)]
    [InlineData(10.01, 0.15, 1.5, 8.51)]
    [InlineData(0, 0.25, 0, 0)]
    public void Fee_rounds_away_from_zero_and_net_preserves_gross(
        decimal gross,
        decimal rate,
        decimal fee,
        decimal net
    )
    {
        var split = BillingRules.Split(gross, rate);
        Assert.Equal(fee, split.Fee);
        Assert.Equal(net, split.Net);
        Assert.Equal(gross, split.Fee + split.Net);
    }

    [Fact]
    public void Four_models_validate_exact_shape_and_server_computes_custom_total()
    {
        var per = new BillingOptionSnapshot(
            Guid.NewGuid(),
            "Session",
            BillingModel.PerSession,
            19.99m
        );
        Assert.Equal(19.99m, OfferRules.Amount(per, null));
        var custom = per with
        {
            Model = BillingModel.CustomPackage,
            MinSessions = 2,
            MaxSessions = 10,
        };
        Assert.Equal(59.97m, OfferRules.Amount(custom, 3));
        var fixedPackage = per with { Model = BillingModel.FixedPackage, SessionCount = 5 };
        Assert.Equal(19.99m, OfferRules.Amount(fixedPackage, null));
        var subscription = per with
        {
            Model = BillingModel.PeriodSubscription,
            PeriodCount = 12,
            PeriodUnit = PeriodUnit.Month,
        };
        Assert.Equal(19.99m, OfferRules.Amount(subscription, null));
        foreach (
            var invalid in new[]
            {
                custom with
                {
                    MinSessions = 0,
                },
                custom with
                {
                    MaxSessions = 1,
                },
                fixedPackage with
                {
                    SessionCount = 0,
                },
                per with
                {
                    SessionCount = 1,
                },
                subscription with
                {
                    PeriodCount = 13,
                },
                subscription with
                {
                    PeriodCount = 0,
                },
                subscription with
                {
                    PeriodUnit = PeriodUnit.Year,
                    PeriodCount = 2,
                },
                per with
                {
                    Price = -1,
                },
                per with
                {
                    Price = 1.005m,
                },
                per with
                {
                    PaymentTerms = new(DueRule.OnStart, 1),
                },
                per with
                {
                    PaymentTerms = new(DueRule.CustomOffsetDays),
                },
            }
        )
            Assert.Throws<ApiException>(() => OfferRules.Validate(invalid));
        Assert.Throws<ApiException>(() => OfferRules.Amount(custom, 11));
        Assert.Throws<ApiException>(() => OfferRules.Amount(per, 1));
        Assert.Throws<ApiException>(() =>
            OfferRules.Validate(per with { PaymentTerms = new(DueRule.EndOfServicePeriod) })
        );
        Assert.Equal(0, OfferRules.Amount(per with { Price = 0 }, null));
        Assert.Equal(
            99999999999999999999999999.99m,
            OfferRules.Amount(per with { Price = OfferRules.MaximumAmount }, null)
        );
    }

    [Fact]
    public void Monthly_periods_use_original_anchor_and_typed_timing()
    {
        var anchor = new DateTimeOffset(2027, 1, 31, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(28, BillingRules.PeriodAt(anchor, 1, PeriodUnit.Month, 1).Day);
        Assert.Equal(31, BillingRules.PeriodAt(anchor, 1, PeriodUnit.Month, 2).Day);
        Assert.Equal(anchor.AddDays(7), BillingRules.PeriodAt(anchor, 1, PeriodUnit.Week, 1));
        Assert.Equal(anchor.AddYears(1), BillingRules.PeriodAt(anchor, 1, PeriodUnit.Year, 1));
        Assert.Equal(anchor, BillingRules.DueAt(new(DueRule.Upfront), anchor, null));
        Assert.Equal(
            anchor.AddDays(3),
            BillingRules.DueAt(new(DueRule.CustomOffsetDays, 3), anchor, null)
        );
        Assert.Equal(
            new DateTimeOffset(2027, 2, 1, 0, 0, 0, TimeSpan.Zero),
            BillingRules.DueAt(new(DueRule.EndOfCalendarMonth), anchor, null)
        );
    }

    [Fact]
    public async Task Simulator_returns_same_settlement_across_provider_instances_and_accepts_opaque_tokens_only()
    {
        var charge = new ProviderCharge("retry", 999999.99m, "EUR", "sim_success_test");
        var a = await new SimulatedPaymentProvider().ChargeAsync(charge, default);
        var b = await new SimulatedPaymentProvider().ChargeAsync(charge, default);
        Assert.True(a.Succeeded);
        Assert.Equal(a, b);
        Assert.False(
            (
                await new SimulatedPaymentProvider().ChargeAsync(
                    charge with
                    {
                        PaymentToken = "sim_decline_test",
                    },
                    default
                )
            ).Succeeded
        );
        Assert.False(
            (
                await new SimulatedPaymentProvider().ChargeAsync(
                    charge with
                    {
                        Amount = 0,
                    },
                    default
                )
            ).Succeeded
        );
        Assert.Equal("online strength", OfferRules.NormalizeTag("  ONLINE  Strength  "));
    }
}
