namespace Metrivum.Offers.Contracts;

public sealed record DiscoveryOfferSummary(
    Guid OfferId,
    Guid CoachId,
    string Name,
    string Currency,
    decimal MinimumPrice,
    CoachingMode Mode,
    string Category
);

public interface IDiscoveryOffers
{
    Task<Guid[]> CoachIdsWithOffersAsync(
        IReadOnlyCollection<Guid> coachIds,
        string? category,
        CancellationToken ct
    );
    Task<IReadOnlyList<DiscoveryOfferSummary>> GetSummariesAsync(
        IReadOnlyCollection<Guid> coachIds,
        CancellationToken ct
    );
}
