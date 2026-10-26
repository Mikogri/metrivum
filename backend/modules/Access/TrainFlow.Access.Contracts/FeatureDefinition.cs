namespace TrainFlow.Access.Contracts;

public sealed record FeatureDefinition(string Key, string Module, string TitleKey, string DescriptionKey,
    string[] Dependencies, string[] Limits);
public sealed record FeatureDecision(string Key, bool Available, string Reason);
public sealed record LimitDecision(string Key, long? Maximum, long Used, DateTimeOffset? ResetAt = null);
public sealed record AccessSnapshot(string Version, IReadOnlyList<FeatureDecision> Features, IReadOnlyList<LimitDecision> Limits, string? PlanId = null);

public interface IFeatureAccessService
{
    Task RequireAsync(string key, CancellationToken cancellationToken);
    Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken);
}
