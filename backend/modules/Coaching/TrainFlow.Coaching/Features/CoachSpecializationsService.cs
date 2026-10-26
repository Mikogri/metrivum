using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Infrastructure;

namespace TrainFlow.Coaching.Features;

public sealed record SpecializationDto(string Code, string Name, int SortOrder);
public sealed record SpecializationCategoryDto(string Code, string Name, int SortOrder, IReadOnlyList<SpecializationDto> Specializations);
public sealed record CoachSpecializationsDto(IReadOnlyList<string> SelectedCodes, IReadOnlyList<string> PrimaryCodes, long Version);
public sealed record CoachSpecializationsRequest(IReadOnlyList<string> SelectedCodes, IReadOnlyList<string> PrimaryCodes, long Version);
public sealed record PublicSpecializationDto(string Code, string Name, string CategoryCode, bool IsPrimary);

public sealed class CoachSpecializationsService(CoachingDbContext db, IAccountContext accounts, ModuleTransaction transaction, TimeProvider clock)
{
    public async Task<IReadOnlyList<SpecializationCategoryDto>> TaxonomyAsync(CancellationToken ct)
    {
        return await db.SpecializationCategories.AsNoTracking().Where(x => x.Active).OrderBy(x => x.SortOrder).ThenBy(x => x.Code)
            .Select(x => new SpecializationCategoryDto(x.Code, x.Name, x.SortOrder,
                db.Specializations.Where(i => i.Active && i.CategoryCode == x.Code).OrderBy(i => i.SortOrder).ThenBy(i => i.Code)
                    .Select(i => new SpecializationDto(i.Code, i.Name, i.SortOrder)).ToArray())).ToArrayAsync(ct);
    }
    public async Task<CoachSpecializationsDto> OwnAsync(CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        return await ReadAsync(coach, ct);
    }
    private async Task<CoachSpecializationsDto> ReadAsync(Guid coach, CancellationToken ct)
    {
        var version = await db.CoachSpecializationProfiles.AsNoTracking().Where(x => x.CoachId == coach).Select(x => (long?)x.Version).SingleOrDefaultAsync(ct) ?? 0;
        var rows = await db.CoachSpecializations.AsNoTracking().Where(x => x.CoachId == coach).OrderBy(x => x.SpecializationCode).ToArrayAsync(ct);
        return new(rows.Select(x => x.SpecializationCode).ToArray(), rows.Where(x => x.IsPrimary).Select(x => x.SpecializationCode).ToArray(), version);
    }
    public static void Validate(CoachSpecializationsRequest request)
    {
        if (request.SelectedCodes is null || request.PrimaryCodes is null || request.Version < 0 || request.SelectedCodes.Count > 5 || request.PrimaryCodes.Count > 3 ||
            request.SelectedCodes.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 80) || request.PrimaryCodes.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 80) ||
            request.SelectedCodes.Distinct(StringComparer.Ordinal).Count() != request.SelectedCodes.Count ||
            request.PrimaryCodes.Distinct(StringComparer.Ordinal).Count() != request.PrimaryCodes.Count || request.PrimaryCodes.Except(request.SelectedCodes, StringComparer.Ordinal).Any())
            throw ApiException.Invalid("Choose up to 5 distinct specializations and up to 3 primary specializations from your selection.");
    }
    public async Task<CoachSpecializationsDto> SaveAsync(CoachSpecializationsRequest request, CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        Validate(request);
        try
        {
            return await transaction.RunAsync(async token =>
            {
                var profile = await db.CoachSpecializationProfiles.SingleOrDefaultAsync(x => x.CoachId == coach, token);
                if ((profile?.Version ?? 0) != request.Version) throw Conflict();
                var selected = request.SelectedCodes.ToArray();
                var valid = await db.Specializations.CountAsync(x => selected.Contains(x.Code) && x.Active && db.SpecializationCategories.Any(c => c.Code == x.CategoryCode && c.Active), token);
                if (valid != selected.Length) throw ApiException.Invalid("Choose active specializations from the official list.");
                if (profile is null) db.CoachSpecializationProfiles.Add(profile = new() { CoachId = coach });
                else profile.Version++;
                profile.UpdatedAt = clock.GetUtcNow();
                var previous = await db.CoachSpecializations.Where(x => x.CoachId == coach).ToArrayAsync(token);
                db.CoachSpecializations.RemoveRange(previous.Where(x => !selected.Contains(x.SpecializationCode)));
                foreach (var code in selected)
                {
                    var link = previous.SingleOrDefault(x => x.SpecializationCode == code);
                    if (link is null) db.CoachSpecializations.Add(link = new() { CoachId = coach, SpecializationCode = code });
                    link.IsPrimary = request.PrimaryCodes.Contains(code);
                }
                db.CoachSpecializationChanges.Add(new() { CoachId = coach, Version = profile.Version, SelectedCodes = selected.Order().ToList(), PrimaryCodes = request.PrimaryCodes.Order().ToList(), ChangedAt = profile.UpdatedAt });
                await db.SaveChangesAsync(token);
                return new CoachSpecializationsDto(selected.Order().ToArray(), request.PrimaryCodes.Order().ToArray(), profile.Version);
            }, ct);
        }
        catch (DbUpdateException ex) when (ex is DbUpdateConcurrencyException || ex.InnerException is Npgsql.PostgresException { SqlState: "23505" }) { throw Conflict(); }
    }
    private static ApiException Conflict() => new(412, "VERSION_CONFLICT", "Specializations changed. Reload and retry.");
}
