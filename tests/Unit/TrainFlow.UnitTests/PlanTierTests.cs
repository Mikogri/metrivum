using TrainFlow.Billing.Contracts;

namespace TrainFlow.UnitTests;

public sealed class PlanTierTests
{
    [Fact]
    public void Personal_and_workspace_plans_rank_on_separate_ladders()
    {
        var personal = PlanCatalog.All.Where(p => !p.IsWorkspace).ToArray();
        var workspace = PlanCatalog.All.Where(p => p.IsWorkspace).ToArray();
        Assert.Equal(Enumerable.Range(1, personal.Length), personal.Select(p => p.Tier));
        Assert.Equal(Enumerable.Range(1, workspace.Length), workspace.Select(p => p.Tier));
        Assert.All(personal, p => Assert.Equal(personal.Length, p.TopTier));
        Assert.All(workspace, p => Assert.Equal(workspace.Length, p.TopTier));
        // The most expensive plan of each kind is its top tier.
        Assert.Equal(personal.MaxBy(p => p.MonthlyPriceEur)!.Tier, personal.Length);
        Assert.Equal(workspace.MaxBy(p => p.MonthlyPriceEur)!.Tier, workspace.Length);
    }
}
