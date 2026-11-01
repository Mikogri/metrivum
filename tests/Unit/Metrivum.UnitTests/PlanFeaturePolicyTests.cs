using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.Billing.Contracts;

namespace Metrivum.UnitTests;

public sealed class PlanFeaturePolicyTests
{
    [Fact]
    public void Exercise_permission_aliases_share_grants_denials_and_operational_flags()
    {
        var catalog = new FeatureCatalog([
            new("exercises.browse", "Exercises", "", "", [], []),
            new("exercises.create", "Exercises", "", "", ["exercises.browse"], []),
            new("exercises.custom.create", "Access", "", "", [], [])]);
        string[] grants = ["exercises.browse", "exercises.create"];
        Assert.True(catalog.Decide("exercises.custom.create", grants, [], []).Available);
        Assert.Equal("explicit_deny", catalog.Decide("exercises.create", grants, ["exercises.custom.create"], []).Reason);
        Assert.Equal("operationally_disabled", catalog.Decide("exercises.custom.create", grants, [], ["exercises.create"]).Reason);
        Assert.Equal("dependency_unavailable", catalog.Decide("exercises.custom.create", ["exercises.custom.create"], [], []).Reason);
    }

    [Theory]
    [InlineData("Free", false)] [InlineData("Starter", false)] [InlineData("Pro", true)] [InlineData("Team", true)] [InlineData("Studio", true)]
    public void Existing_and_canonical_exercise_permissions_have_the_same_paid_policy(string id, bool expected)
    {
        var plan = PlanCatalog.Get(id);
        var now = DateTimeOffset.UtcNow;
        var entitlement = new PlanEntitlements(id, Guid.NewGuid(), now, now.AddMonths(1), plan.PremiumFeatures, plan.Limits);
        Assert.Equal(expected, PlanFeaturePolicy.Allows(entitlement, "exercises.create"));
        Assert.Equal(expected, PlanFeaturePolicy.Allows(entitlement, "exercises.custom.create"));
    }
}
