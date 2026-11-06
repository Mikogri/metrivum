using Microsoft.EntityFrameworkCore;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Offers.Contracts;

namespace Metrivum.Coaching.Features;

public sealed record DiscoveryProfileDto(bool Published, IReadOnlyList<string> Specializations, IReadOnlyList<string> Languages, IReadOnlyList<string> Modes, string? Location, long Version);
public sealed record DiscoveryProfileRequest(bool Published, IReadOnlyList<string>? Specializations, IReadOnlyList<string>? Languages, IReadOnlyList<string>? Modes, string? Location, long Version);
public sealed record DiscoveredCoachDto(Guid CoachId, string Username, string DisplayName, string? Bio, IReadOnlyList<string> Specializations, IReadOnlyList<string> Languages, IReadOnlyList<string> Modes, string? Location, bool Featured, DiscoveryOfferSummary? Offer, IReadOnlyList<PublicSpecializationDto>? SpecializationSelections = null);
public sealed record CoachDiscoveryPage(IReadOnlyList<DiscoveredCoachDto> Items, int Page, int PageSize, long Total);

public sealed class CoachDiscoveryService(CoachingDbContext db, IAccountContext accounts, ICoachDiscoveryDirectory directory,
    IPlatformPlans plans, IDiscoveryOffers offers, IFeatureAccessService access, TimeProvider clock, IAbuseProtection? abuse = null)
{
    public async Task<DiscoveryProfileDto> OwnAsync(CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        var row = await db.DiscoveryProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.CoachId == coach, ct);
        return row == null ? new(false, [], [], [], null, 0) : Dto(row);
    }

    public async Task<DiscoveryProfileDto> SaveAsync(DiscoveryProfileRequest request, CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        // Withdrawal remains available even if a feature is disabled or the account no longer qualifies.
        if (request.Published)
        {
            await access.RequireAsync("discovery.coach-profile.publish", ct);
            if (!await directory.IsAdultAsync(coach, ct))
                throw new ApiException(403, "ADULT_REQUIRED", "Discovery is available to adults aged 18 or over.");
        }
        var specializations = Values(request.Specializations, 20, 40);
        var languages = Values(request.Languages, 10, 40);
        var modes = Values(request.Modes, 3, 20);
        if (modes.Any(x => x is not ("Online" or "Offline" or "Hybrid")))
            throw ApiException.Invalid("Choose Online, Offline or Hybrid coaching.");
        var location = request.Location?.Trim();
        if (location?.Length > 160) throw ApiException.Invalid("Public location can contain at most 160 characters.");
        var row = await db.DiscoveryProfiles.SingleOrDefaultAsync(x => x.CoachId == coach, ct);
        if ((row?.Version ?? 0) != request.Version)
            throw new ApiException(412, "VERSION_CONFLICT", "Discovery settings changed. Reload and retry.");
        var wasPublished = row?.Published ?? false;
        if (row == null) db.DiscoveryProfiles.Add(row = new() { CoachId = coach });
        else row.Version++;
        row.Published = request.Published;
        row.Specializations = specializations;
        row.Languages = languages;
        row.Modes = modes;
        row.Location = string.IsNullOrWhiteSpace(location) ? null : location;
        row.UpdatedAt = clock.GetUtcNow();
        db.DiscoveryPublicationChanges.Add(new() { CoachId = coach, PreviousPublished = wasPublished, Published = row.Published, Version = row.Version, ChangedAt = row.UpdatedAt });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException exception) when (exception is DbUpdateConcurrencyException || exception.InnerException is Npgsql.PostgresException { SqlState: "23505", ConstraintName: "PK_DiscoveryProfiles" })
        { throw new ApiException(412, "VERSION_CONFLICT", "Discovery settings changed. Reload and retry."); }
        return Dto(row);
    }

    public async Task<CoachDiscoveryPage> SearchAsync(int page, int pageSize, string? search, string? specialization,
        string? mode, string? language, string? location, bool hasOffers, string? offerCategory, CancellationToken ct, string? specializations = null)
    {
        var roles = await accounts.GetRolesAsync(ct);
        if (abuse is not null) await abuse.RequireAsync(accounts.UserId, AbusePolicies.Search, cancellationToken: ct);
        if (!roles.Any(x => x is AccountRole.Coach or AccountRole.Client) || !await directory.IsAdultAsync(accounts.UserId, ct))
            throw new ApiException(403, "ADULT_REQUIRED", "Discovery is available to adult coaches and clients.");
        await access.RequireAsync("discovery.coaches.search", ct);
        if (page < 1 || page > 10000 || pageSize is < 1 or > 50 || new[] { search, specialization, mode, language, location, offerCategory }.Any(x => x?.Length > 160))
            throw ApiException.Invalid("Use a valid page, page size (1–50), and filters up to 160 characters.");
        var selected = string.IsNullOrWhiteSpace(specializations) ? Array.Empty<string>() : specializations.Split(',').Select(x => x.Trim()).ToArray();
        if (selected.Length > 27 || selected.Any(x => x.Length is < 1 or > 80) || selected.Distinct().Count() != selected.Length)
            throw ApiException.Invalid("Choose distinct specialization codes from the official list.");
        var term = search?.Trim().ToLowerInvariant();
        var dictionary = selected.Length > 0 || !string.IsNullOrEmpty(term)
            ? await db.Specializations.AsNoTracking().Where(x => x.Active && db.SpecializationCategories.Any(c => c.Code == x.CategoryCode && c.Active))
                .Select(x => new { x.Code, x.Name }).ToArrayAsync(ct) : [];
        if (selected.Any(code => !dictionary.Any(x => x.Code == code)))
            throw ApiException.Invalid("Choose active specializations from the official list.");
        var textCodes = string.IsNullOrEmpty(term) ? [] : dictionary.Where(x => x.Name.ToLowerInvariant().Contains(term)
            || x.Code.Contains(term) || x.Code.Replace('_', ' ').Contains(term)).Select(x => x.Code).ToArray();
        var primaryCodes = selected.Length > 0 ? selected : textCodes;
        var links = db.CoachSpecializations.Where(x => x.Specialization.Active && db.SpecializationCategories.Any(c => c.Code == x.Specialization.CategoryCode && c.Active));
        var query = db.DiscoveryProfiles.AsNoTracking().Where(x => x.Published);
        if (selected.Length > 0) query = query.Where(x => links.Any(s => s.CoachId == x.CoachId && selected.Contains(s.SpecializationCode)));
        if (!string.IsNullOrWhiteSpace(specialization))
        {
            var specialty = specialization.Trim().ToLowerInvariant();
            query = query.Where(x => x.Specializations.Any(value => value.ToLower() == specialty) || links.Any(s => s.CoachId == x.CoachId && s.SpecializationCode == specialty));
        }
        if (!string.IsNullOrWhiteSpace(language))
        {
            var languageTerm = language.Trim().ToLowerInvariant();
            query = query.Where(x => x.Languages.Any(value => value.ToLower() == languageTerm));
        }
        if (!string.IsNullOrWhiteSpace(mode))
            query = query.Where(x => x.Modes.Contains(mode) || (mode != "Hybrid" && x.Modes.Contains("Hybrid")));
        if (!string.IsNullOrWhiteSpace(location))
        {
            var locationTerm = location.Trim().ToLowerInvariant();
            query = query.Where(x => x.Location != null && x.Location.ToLower().Contains(locationTerm));
        }
        var candidates = await query.Select(x => x.CoachId).ToArrayAsync(ct);
        if (candidates.Length == 0) return new([], page, pageSize, 0);
        var eligible = await directory.EligibleCoachIdsAsync(candidates, null, ct);
        if (eligible.Length == 0) return new([], page, pageSize, 0);
        query = query.Where(x => eligible.Contains(x.CoachId));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var names = await directory.EligibleCoachIdsAsync(eligible, term, ct);
            query = query.Where(x => names.Contains(x.CoachId) || x.Specializations.Any(s => s.ToLower().Contains(term!)) || links.Any(s => s.CoachId == x.CoachId && textCodes.Contains(s.SpecializationCode)));
        }
        if (hasOffers || !string.IsNullOrWhiteSpace(offerCategory))
        {
            var withOffers = await offers.CoachIdsWithOffersAsync(eligible, string.IsNullOrWhiteSpace(offerCategory) ? null : offerCategory.Trim(), ct);
            query = query.Where(x => withOffers.Contains(x.CoachId));
        }
        // All filtering precedes ranking/pagination. Paid tiers share one priority; the immutable ID breaks ties.
        var total = await query.LongCountAsync(ct);
        if (total == 0) return new([], page, pageSize, 0);
        var priority = (await plans.GetPriorityCoachIdsAsync(eligible, ct)).ToArray();
        var rows = await query.OrderByDescending(x => links.Count(s => s.CoachId == x.CoachId && selected.Contains(s.SpecializationCode)))
            .ThenByDescending(x => links.Count(s => s.CoachId == x.CoachId && textCodes.Contains(s.SpecializationCode)))
            .ThenByDescending(x => priority.Contains(x.CoachId))
            .ThenByDescending(x => links.Count(s => s.CoachId == x.CoachId && s.IsPrimary && primaryCodes.Contains(s.SpecializationCode))).ThenBy(x => x.CoachId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var ids = rows.Select(x => x.CoachId).ToArray();
        if (ids.Length == 0) return new([], page, pageSize, total);
        var selections = await links.AsNoTracking().Where(x => ids.Contains(x.CoachId)).OrderBy(x => x.Specialization.CategoryCode).ThenBy(x => x.Specialization.SortOrder)
            .Select(x => new { x.CoachId, Item = new PublicSpecializationDto(x.SpecializationCode, x.Specialization.Name, x.Specialization.CategoryCode, x.IsPrimary) }).ToArrayAsync(ct);
        var identities = await directory.GetPublicAsync(ids, ct);
        var previews = (await offers.GetSummariesAsync(ids, ct)).ToDictionary(x => x.CoachId);
        var byCoach = selections.ToLookup(x => x.CoachId, x => x.Item);
        var items = rows.Where(x => identities.ContainsKey(x.CoachId)).Select(x =>
        {
            var person = identities[x.CoachId];
            return new DiscoveredCoachDto(x.CoachId, person.Username, person.DisplayName, person.Bio, x.Specializations, x.Languages, x.Modes, x.Location, priority.Contains(x.CoachId), previews.GetValueOrDefault(x.CoachId), byCoach[x.CoachId].ToArray());
        }).ToArray();
        return new(items, page, pageSize, total);
    }

    private static List<string> Values(IReadOnlyList<string>? values, int maximum, int length)
    {
        var result = (values ?? []).Select(x => x?.Trim() ?? "").Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (result.Count > maximum || result.Any(x => x.Length > length)) throw ApiException.Invalid($"Add at most {maximum} values of up to {length} characters.");
        return result;
    }
    private static DiscoveryProfileDto Dto(CoachDiscoveryProfile row) => new(row.Published, row.Specializations, row.Languages, row.Modes, row.Location, row.Version);
}
