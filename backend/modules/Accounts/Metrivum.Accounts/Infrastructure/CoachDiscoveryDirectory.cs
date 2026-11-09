using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Domain;

namespace Metrivum.Accounts.Infrastructure;

/// <summary>Reads coach account information exposed to discovery through the Accounts contract.</summary>
internal sealed class CoachDiscoveryDirectory(AccountsDbContext db, TimeProvider clock) : ICoachDiscoveryDirectory
{
    private DateOnly AdultBirthDate => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddYears(-18);
    private IQueryable<Profile> Adults => db.Profiles.AsNoTracking().Where(x => x.Active && x.Onboarded && x.BirthDate != null && x.BirthDate <= AdultBirthDate && x.Username != null);
    public Task<bool> IsAdultAsync(Guid userId, CancellationToken ct) => Adults.AnyAsync(x => x.Id == userId, ct);
    private IQueryable<Profile> Coaches(IReadOnlyCollection<Guid> candidates) => Adults.Where(x => candidates.Contains(x.Id) && db.Roles.Any(r => r.UserId == x.Id && r.Role == "Coach"));

    public Task<Guid[]> EligibleCoachIdsAsync(IReadOnlyCollection<Guid> candidates, string? phrase, CancellationToken ct)
    {
        var query = Coaches(candidates);
        if (!string.IsNullOrWhiteSpace(phrase))
        {
            var term = phrase.Trim().ToLowerInvariant();
            query = query.Where(x => x.DisplayName.ToLower().Contains(term) || x.Username!.ToLower().Contains(term) || (x.Bio != null && x.Bio.ToLower().Contains(term)));
        }
        return query.Select(x => x.Id).ToArrayAsync(ct);
    }

    public async Task<IReadOnlyDictionary<Guid, PublicCoachIdentity>> GetPublicAsync(IReadOnlyCollection<Guid> coachIds, CancellationToken ct) =>
        await Coaches(coachIds).Select(x => new PublicCoachIdentity(x.Id, x.Username!, x.DisplayName, x.Bio)).ToDictionaryAsync(x => x.UserId, ct);
}
