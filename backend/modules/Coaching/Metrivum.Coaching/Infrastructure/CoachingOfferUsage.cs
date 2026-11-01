using Microsoft.EntityFrameworkCore;
using Metrivum.Coaching.Domain;
using Metrivum.Offers.Contracts;

namespace Metrivum.Coaching.Infrastructure;

/// <summary>Tells the offer library which offers clients were on, and which still have open applications or invitations.</summary>
public sealed class CoachingOfferUsage(CoachingDbContext db) : IOfferUsage
{
    public async Task<IReadOnlyDictionary<Guid, OfferUsage>> GetAsync(IReadOnlyCollection<Guid> offerIds, IReadOnlyDictionary<Guid, Guid> offerByRevision, CancellationToken ct)
    {
        var ids = offerIds.ToArray();
        var revisionIds = offerByRevision.Keys.ToArray();
        var applications = await db.Applications.AsNoTracking()
            .Where(x => ids.Contains(x.OfferId) && (x.Status == ApplicationStatus.Accepted || x.Status == ApplicationStatus.InProgress || x.Status == ApplicationStatus.Submitted))
            .Select(x => new { x.OfferId, x.Status }).Distinct().ToArrayAsync(ct);
        var served = await db.Services.AsNoTracking().Where(x => revisionIds.Contains(x.OfferRevisionId)).Select(x => x.OfferRevisionId).Distinct().ToArrayAsync(ct);
        // An accepted invitation without an application yet still lets the person apply.
        var invited = await db.Invitations.AsNoTracking()
            .Where(x => revisionIds.Contains(x.OfferRevisionId) && (x.Status == InvitationStatus.Pending || x.Status == InvitationStatus.Accepted && !db.Applications.Any(a => a.InvitationId == x.Id)))
            .Select(x => x.OfferRevisionId).Distinct().ToArrayAsync(ct);
        var had = applications.Where(x => x.Status == ApplicationStatus.Accepted).Select(x => x.OfferId).Concat(served.Select(x => offerByRevision[x])).ToHashSet();
        var open = applications.Where(x => x.Status != ApplicationStatus.Accepted).Select(x => x.OfferId).Concat(invited.Select(x => offerByRevision[x])).ToHashSet();
        return ids.Where(x => had.Contains(x) || open.Contains(x)).ToDictionary(x => x, x => new OfferUsage(had.Contains(x), open.Contains(x)));
    }
}
