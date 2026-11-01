namespace Metrivum.Accounts.Contracts;

public sealed record PublicCoachIdentity(Guid UserId, string Username, string DisplayName, string? Bio);

// Only active, onboarded adults are eligible; this view never exposes contact or client data.
public interface ICoachDiscoveryDirectory
{
    Task<bool> IsAdultAsync(Guid userId, CancellationToken ct);
    Task<Guid[]> EligibleCoachIdsAsync(IReadOnlyCollection<Guid> candidates, string? phrase, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, PublicCoachIdentity>> GetPublicAsync(IReadOnlyCollection<Guid> coachIds, CancellationToken ct);
}
