using TrainFlow.Access.Contracts;

namespace TrainFlow.Access.Domain;

public sealed class FeatureCatalog
{
    public IReadOnlyDictionary<string, FeatureDefinition> Definitions
    {
        get;
    }

    public FeatureCatalog(IEnumerable<FeatureDefinition> definitions)
    {
        var all = definitions.ToArray();
        if (all.Select(x => x.Key).Distinct(StringComparer.Ordinal).Count() != all.Length)
            throw new InvalidOperationException("Duplicate feature definitions.");
        Definitions = all.ToDictionary(x => x.Key, StringComparer.Ordinal);
        foreach (var key in Definitions.Keys)
            ValidateGraph(key, new HashSet<string>(StringComparer.Ordinal), []);
    }

    private void ValidateGraph(string key, HashSet<string> visiting, HashSet<string> visited)
    {
        if (visited.Contains(key))
            return;
        if (!Definitions.TryGetValue(key, out var definition))
            throw new InvalidOperationException($"Unknown feature dependency: {key}.");
        if (!visiting.Add(key))
            throw new InvalidOperationException($"Cyclic feature dependency: {key}.");
        foreach (var dependency in definition.Dependencies)
            ValidateGraph(dependency, visiting, visited);
        visiting.Remove(key);
        visited.Add(key);
    }

    public FeatureDecision Decide(string key, IReadOnlyCollection<string> grants, IReadOnlyCollection<string> denies, IReadOnlyCollection<string> disabled)
    {
        // Keep the established exercise permission and its new public name as one policy.
        var canonical = PlanFeaturePolicy.Canonical(key);
        var definitionKey = key == "exercises.custom.create" ? "exercises.create" : key;
        if (!Definitions.TryGetValue(definitionKey, out var definition))
            return new(key, false, "unknown_feature");
        if (denies.Any(x => PlanFeaturePolicy.Canonical(x) == canonical))
            return new(key, false, "explicit_deny");
        if (disabled.Any(x => PlanFeaturePolicy.Canonical(x) == canonical))
            return new(key, false, "operationally_disabled");
        if (!grants.Any(x => PlanFeaturePolicy.Canonical(x) == canonical))
            return new(key, false, "not_granted");
        if (definition.Dependencies.Any(x => !Decide(x, grants, denies, disabled).Available))
            return new(key, false, "dependency_unavailable");
        return new(key, true, "available");
    }
}
