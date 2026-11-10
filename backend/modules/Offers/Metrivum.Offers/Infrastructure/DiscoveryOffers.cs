using Metrivum.Offers.Contracts;
using Metrivum.Offers.Domain;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Offers.Infrastructure;

/// <summary>Projects published discoverable offers for coach discovery through Offers contracts.</summary>
internal sealed class DiscoveryOffers(OffersDbContext db) : IDiscoveryOffers
{
    public Task<Guid[]> CoachIdsWithOffersAsync(
        IReadOnlyCollection<Guid> coachIds,
        string? category,
        CancellationToken ct
    ) =>
        (
            from offer in db.Offers.AsNoTracking()
            join revision in db.Revisions.AsNoTracking()
                on offer.CurrentPublishedRevisionId equals revision.Id
            where
                coachIds.Contains(offer.CoachId)
                && offer.Status == OfferStatus.Active
                && offer.CurrentPublishedRevisionId != null
                && (category == null || revision.Category == category)
            select offer.CoachId
        )
            .Distinct()
            .ToArrayAsync(ct);

    public async Task<IReadOnlyList<DiscoveryOfferSummary>> GetSummariesAsync(
        IReadOnlyCollection<Guid> coachIds,
        CancellationToken ct
    ) =>
        await (
            from offer in db.Offers.AsNoTracking()
            join revision in db.Revisions.AsNoTracking()
                on offer.CurrentPublishedRevisionId equals revision.Id
            where
                coachIds.Contains(offer.CoachId)
                && offer.Status == OfferStatus.Active
                && offer.CurrentPublishedRevisionId != null
            // A card previews one current offer; the existing public offers page lists every option.
            where
                !db.Offers.Any(other =>
                    other.CoachId == offer.CoachId
                    && other.Status == OfferStatus.Active
                    && other.CurrentPublishedRevisionId != null
                    && other.Id.CompareTo(offer.Id) < 0
                )
            select new DiscoveryOfferSummary(
                offer.Id,
                offer.CoachId,
                revision.Name,
                revision.Currency,
                db.RevisionOptions.Where(option => option.RevisionId == revision.Id)
                    .Select(option => option.Price)
                    .Min(),
                revision.CoachingMode,
                revision.Category
            )
        ).ToArrayAsync(ct);
}
