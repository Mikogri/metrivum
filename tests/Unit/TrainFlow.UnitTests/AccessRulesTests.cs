using TrainFlow.Access.Contracts;
using TrainFlow.Access.Domain;

namespace TrainFlow.UnitTests;

public class AccessRulesTests
{
    private static FeatureDefinition Feature(string key, params string[] dependencies) => new(key, "test", key, key, dependencies, []);

    [Fact]
    public void Duplicate_unknown_and_cyclic_dependencies_are_rejected()
    {
        Assert.Throws<InvalidOperationException>(() => new FeatureCatalog([Feature("a"), Feature("a")]));
        Assert.Throws<InvalidOperationException>(() => new FeatureCatalog([Feature("a", "missing")]));
        Assert.Throws<InvalidOperationException>(() => new FeatureCatalog([Feature("a", "b"), Feature("b", "a")]));
    }

    [Fact]
    public void Denial_flags_dependencies_and_unknown_keys_fail_closed()
    {
        var catalog = new FeatureCatalog([Feature("read"), Feature("write", "read")]);
        Assert.Equal("explicit_deny", catalog.Decide("write", ["read", "write"], ["write"], []).Reason);
        Assert.Equal("operationally_disabled", catalog.Decide("write", ["read", "write"], [], ["write"]).Reason);
        Assert.Equal("dependency_unavailable", catalog.Decide("write", ["write"], [], []).Reason);
        Assert.Equal("not_granted", catalog.Decide("read", [], [], []).Reason);
        Assert.False(catalog.Decide("unknown", ["unknown"], [], []).Available);
        Assert.True(catalog.Decide("write", ["read", "write"], [], []).Available);
    }
}
