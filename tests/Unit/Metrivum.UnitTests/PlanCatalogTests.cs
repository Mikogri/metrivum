using Metrivum.Billing.Contracts;

namespace Metrivum.UnitTests;

public sealed class PlanCatalogTests
{
    [Theory]
    [InlineData("Free", 0, 1, 3, 3, 2L, 0)]
    [InlineData("Starter", 9, 1, 8, 15, 5L, 0)]
    [InlineData("Pro", 24, 1, 60, 500, null, 7200)]
    [InlineData("Team", 69, 3, 200, 2000, null, 30000)]
    [InlineData("Studio", 159, 10, 600, 5000, null, 90000)]
    public void Canonical_monthly_prices_and_allowances(string id, int price, int seats, int clients, int runs, long? local, long gpu)
    {
        var plan = PlanCatalog.Get(id);
        Assert.Equal(price, plan.MonthlyPriceEur);
        Assert.Equal(seats, plan.Limits["organization.coach_seats"]);
        Assert.Equal(clients, plan.Limits["coaching.active_clients"]);
        Assert.Equal(runs, plan.Limits["training.generator.runs_per_period"]);
        Assert.Equal(local, plan.Limits["video.local_analyses_per_period"]);
        Assert.Equal(gpu, plan.Limits["video.cloud_gpu_seconds_per_period"]);
        Assert.Equal(60, plan.Limits["video.max_duration_seconds"]);
        Assert.Equal(50 * 1024 * 1024, plan.Limits["video.max_upload_bytes"]);
        Assert.Equal(0.10m, PlanCatalog.ServiceCommissionRate);
        Assert.Equal("EUR", PlanCatalog.Currency);
    }

    [Fact]
    public void Pro_has_all_individual_tools_and_workspace_tiers_share_priority()
    {
        var pro = PlanCatalog.Get("Pro");
        Assert.Contains("discovery.ranking.priority", pro.PremiumFeatures);
        Assert.DoesNotContain("organization.workspace.manage", pro.PremiumFeatures);
        foreach (var id in new[] { "Team", "Studio" })
            Assert.True(pro.PremiumFeatures.IsSubsetOf(PlanCatalog.Get(id).PremiumFeatures));
        Assert.Empty(PlanCatalog.Get("Starter").PremiumFeatures);
    }

    [Fact]
    public void Free_allowances_reset_at_calendar_month_in_utc()
    {
        var first = PlanCatalog.FreePeriod(DateTimeOffset.Parse("2026-03-01T01:00:00+02:00"));
        Assert.Equal(DateTimeOffset.Parse("2026-02-01T00:00:00Z"), first.Start);
        Assert.Equal(DateTimeOffset.Parse("2026-03-01T00:00:00Z"), first.End);
        Assert.Equal(first, PlanCatalog.FreePeriod(DateTimeOffset.Parse("2026-02-10T12:00:00Z")));
        Assert.NotEqual(first.Start, PlanCatalog.FreePeriod(first.End).Start);
    }
}
