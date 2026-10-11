using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Forms.Contracts;
using TrainFlow.Offers.Contracts;
using TrainFlow.Offers.Domain;
using TrainFlow.Offers.Infrastructure;

namespace TrainFlow.Offers.Features;

public sealed record OfferRequest(string Name, string Description, string Category, CoachingMode CoachingMode,
    Guid ApplicationFormVersionId, IReadOnlyList<string> Tags, IReadOnlyList<BillingOptionSnapshot> BillingOptions, Guid? TeamId = null, OfferPurpose Purpose = OfferPurpose.CoachingService);
public sealed record OfferDto(Guid Id, Guid CoachId, string Name, string Description, string Category, CoachingMode CoachingMode,
    Guid ApplicationFormVersionId, IReadOnlyList<string> Tags, IReadOnlyList<BillingOptionSnapshot> BillingOptions, OfferStatus Status,
    Guid? CurrentPublishedRevisionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, long Version, Guid? TeamId = null, string? TeamName = null, OfferPurpose Purpose = OfferPurpose.CoachingService);
public sealed record OfferListDto(IReadOnlyList<OfferDto> Items, int Page, int PageSize, int Total);
public sealed record PublicOfferListDto(IReadOnlyList<OfferRevisionDto> Items, int Page, int PageSize, int Total);
public sealed record OfferCategoryDto(string Key, string Name, bool Active);

public sealed class OffersService(OffersDbContext db, IAccountContext accounts, IFeatureAccessService access,
    IAccountProfileFields profiles, IFormLibrary forms, TimeProvider clock, ModuleTransaction transaction, ITeamContext? teams = null) : IOfferLibrary
{
    public async Task<OfferListDto> ListAsync(int page, int pageSize, OfferStatus? status, string? search, string sort, CancellationToken ct, Guid? teamId = null)
    {
        await Manage(ct);
        Query(page, pageSize, search, sort);
        if (status != null && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Unknown offer status.");
        var team = teamId == null ? null : await RequireTeam(teamId.Value, false, ct);
        var administrative = team?.Role is "Owner" or "Admin";
        var q = db.Offers.AsNoTracking().Where(x => x.TeamId == teamId && (x.CoachId == accounts.UserId || administrative));
        if (status != null)
            q = q.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            q = q.Where(x => x.Name.ToLower().Contains(term));
        }
        var total = await q.CountAsync(ct);
        var ordered = sort == "name" ? q.OrderBy(x => x.Name).ThenBy(x => x.Id) : q.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id);
        var items = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(await DraftDtos(items, ct), page, pageSize, total);
    }
    public async Task<OfferDto> DetailAsync(Guid id, CancellationToken ct) => (await DraftDtos([await Owned(id, ct)], ct))[0];
    public Task<OfferDto> CreateAsync(OfferRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Manage(token);
        var team = request.TeamId == null ? null : await RequireTeam(request.TeamId.Value, true, token);
        await Validate(request, token);
        var offer = new Offer { Id = Guid.NewGuid(), CoachId = accounts.UserId, TeamId = team?.TeamId, TeamName = team?.Name, Status = OfferStatus.Draft, CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
        Apply(offer, request);
        db.Offers.Add(offer);
        await db.SaveChangesAsync(token);
        await SetChildren(offer.Id, request, token);
        await db.SaveChangesAsync(token);
        return await DetailAsync(offer.Id, token);
    }, ct);
    public Task<OfferDto> UpdateAsync(Guid id, OfferRequest request, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(id, token);
        var offer = await Owned(id, token);
        Check(offer, expected);
        if (request.TeamId != offer.TeamId)
            throw ApiException.Invalid("Offer ownership scope cannot be changed. Create a new scoped offer.");
        if (offer.TeamId != null)
            await RequireTeam(offer.TeamId.Value, true, token);
        if (offer.Status == OfferStatus.Archived)
            throw ApiException.Conflict("Archived offers cannot be edited.");
        await Validate(request, token, offer.CoachId);
        Apply(offer, request);
        Touch(offer);
        await SetChildren(id, request, token);
        await db.SaveChangesAsync(token);
        return await DetailAsync(id, token);
    }, ct);
    public Task<OfferDto> PublishAsync(Guid id, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(id, token);
        var offer = await Owned(id, token);
        if (offer.TeamId != null)
            await RequireTeam(offer.TeamId.Value, true, token);
        var retry = await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.OfferId == id && x.DraftVersion == expected, token);
        if (retry != null && offer.Version == expected + 1 && offer.CurrentPublishedRevisionId == retry.Id)
            return await DetailAsync(id, token);
        Check(offer, expected);
        if (offer.Status == OfferStatus.Archived)
            throw ApiException.Conflict("Archived offers cannot be published.");
        var draft = await DetailAsync(id, token);
        await Validate(new(draft.Name, draft.Description, draft.Category, draft.CoachingMode, draft.ApplicationFormVersionId, draft.Tags, draft.BillingOptions, draft.TeamId, draft.Purpose), token, offer.CoachId);
        var revision = new OfferRevision
        {
            Id = Guid.NewGuid(),
            OfferId = id,
            CoachId = offer.CoachId,
            TeamId = offer.TeamId,
            TeamName = offer.TeamName,
            Number = (await db.Revisions.Where(x => x.OfferId == id).Select(x => (int?)x.Number).MaxAsync(token) ?? 0) + 1,
            DraftVersion = expected,
            Name = offer.Name,
            Description = offer.Description,
            Category = offer.Category,
            CoachingMode = offer.CoachingMode,
            Purpose = offer.Purpose,
            ApplicationFormVersionId = offer.ApplicationFormVersionId,
            Tags = JsonSerializer.Serialize(draft.Tags),
            Currency = await profiles.GetCurrencyAsync(offer.CoachId, token),
            PublishedAt = clock.GetUtcNow()
        };
        db.Revisions.Add(revision);
        db.RevisionOptions.AddRange(draft.BillingOptions.Select(x => RevisionOption(revision.Id, x)));
        await db.SaveChangesAsync(token);
        offer.CurrentPublishedRevisionId = revision.Id;
        offer.Status = OfferStatus.Active;
        Touch(offer);
        await db.SaveChangesAsync(token);
        return await DetailAsync(id, token);
    }, ct);
    public Task<OfferDto> ChangeStatusAsync(Guid id, OfferStatus target, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock(id, token);
        var offer = await Owned(id, token);
        if (offer.TeamId != null)
            await RequireTeam(offer.TeamId.Value, true, token);
        if (offer.Status == target && offer.Version == expected + 1)
            return await DetailAsync(id, token);
        Check(offer, expected);
        if (offer.Status == OfferStatus.Archived && target != OfferStatus.Archived)
            throw ApiException.Conflict("Archived offers cannot be reused.");
        if (target is not (OfferStatus.Active or OfferStatus.Inactive or OfferStatus.Archived))
            throw ApiException.Invalid("Unsupported offer transition.");
        if (target == OfferStatus.Active)
        {
            if (offer.CurrentPublishedRevisionId == null)
                throw ApiException.Conflict("Publish the offer before activation.");
            await forms.RequireUsableVersionAsync((await GetRevisionAsync(offer.CurrentPublishedRevisionId.Value, token)).ApplicationFormVersionId, offer.CoachId, FormPurpose.Application, token);
        }
        if (offer.Status != target)
        {
            offer.Status = target;
            Touch(offer);
            await db.SaveChangesAsync(token);
        }
        return await DetailAsync(id, token);
    }, ct);
    public async Task<IReadOnlyList<OfferCategoryDto>> CategoriesAsync(CancellationToken ct)
    {
        await access.RequireAsync("offers.view-public", ct);
        return await db.Categories.AsNoTracking().Where(x => x.Active).OrderBy(x => x.Name)
            .Select(x => new OfferCategoryDto(x.Key, x.Name, x.Active)).ToArrayAsync(ct);
    }
    public async Task<IReadOnlyList<string>> TagsAsync(string? search, CancellationToken ct)
    {
        await Manage(ct);
        if (search?.Length > 60)
            throw ApiException.Invalid("Tag search is too long.");
        var q = db.Tags.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            q = q.Where(x => x.Name.Contains(term));
        }
        return await q.OrderBy(x => x.Name).Take(30).Select(x => x.Name).ToArrayAsync(ct);
    }
    public async Task<PublicOfferListDto> PublicListAsync(Guid coachId, int page, int pageSize, string? search, string? category, string sort, CancellationToken ct)
    {
        await access.RequireAsync("offers.view-public", ct);
        Query(page, pageSize, search, sort);
        if (category?.Length > 60)
            throw ApiException.Invalid("Invalid category.");
        var q = from r in db.Revisions.AsNoTracking() join o in db.Offers.AsNoTracking() on r.Id equals o.CurrentPublishedRevisionId where o.CoachId == coachId && o.Status == OfferStatus.Active select r;
        if (category != null)
            q = q.Where(x => x.Category == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            q = q.Where(x => x.Name.ToLower().Contains(term));
        }
        var total = await q.CountAsync(ct);
        var ordered = sort == "name" ? q.OrderBy(x => x.Name).ThenBy(x => x.Id) : q.OrderByDescending(x => x.PublishedAt).ThenBy(x => x.Id);
        var rows = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(await RevisionDtos(rows, ct), page, pageSize, total);
    }
    public async Task<OfferRevisionDto> PublicDetailAsync(Guid coachId, Guid id, CancellationToken ct)
    {
        await access.RequireAsync("offers.view-public", ct);
        var value = await GetCurrentAsync(id, ct);
        if (value.CoachId != coachId)
            throw ApiException.NotFound();
        return value;
    }
    public async Task<OfferRevisionDto> GetCurrentAsync(Guid offerId, CancellationToken ct)
    {
        var offer = await db.Offers.AsNoTracking().SingleOrDefaultAsync(x => x.Id == offerId && x.Status == OfferStatus.Active, ct) ?? throw ApiException.NotFound();
        if (offer.TeamId != null)
        {
            var seller = teams == null ? null : await teams.GetForUserAsync(offer.CoachId, ct);
            if (seller?.TeamId != offer.TeamId || !seller.IsActive)
                throw ApiException.Conflict("This Team offer is not currently available.");
        }
        var revision = await GetRevisionAsync(offer.CurrentPublishedRevisionId ?? throw ApiException.Conflict("Offer has no published revision."), ct);
        await forms.RequireUsableVersionAsync(revision.ApplicationFormVersionId, revision.CoachId, FormPurpose.Application, ct);
        return revision;
    }
    public async Task<OfferRevisionDto> GetRevisionAsync(Guid revisionId, CancellationToken ct) => (await RevisionDtos([await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == revisionId, ct) ?? throw ApiException.NotFound()], ct))[0];
    public async Task<OfferQuote> QuoteAsync(Guid revisionId, Guid billingOptionId, int? selectedSessionCount, CancellationToken ct)
    {
        var revision = await GetRevisionAsync(revisionId, ct);
        var option = revision.BillingOptions.SingleOrDefault(x => x.Id == billingOptionId) ?? throw ApiException.Invalid("Billing option does not belong to this revision.");
        return new(revision.OfferId, revision.Id, revision.CoachId, revision.Name, revision.ApplicationFormVersionId, option, selectedSessionCount, OfferRules.Amount(option, selectedSessionCount), revision.Currency, revision.TeamId, revision.Purpose);
    }
    private async Task Validate(OfferRequest r, CancellationToken ct, Guid? formOwner = null)
    {
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 200 || r.Description == null || r.Description.Length > 4000 || string.IsNullOrWhiteSpace(r.Category) || r.Category.Length > 60 || !Enum.IsDefined(r.CoachingMode) || r.Tags == null || r.Tags.Count > 30 || r.BillingOptions == null || r.BillingOptions.Count is < 1 or > 20 || r.BillingOptions.Any(x => x == null) || r.BillingOptions.Select(x => x.Id).Distinct().Count() != r.BillingOptions.Count)
            throw ApiException.Invalid("Invalid offer definition.");
        if (!await db.Categories.AnyAsync(x => x.Key == r.Category && x.Active, ct))
            throw ApiException.Invalid("Unknown or inactive offer category.");
        if (!Enum.IsDefined(r.Purpose) || r.BillingOptions.Any(x => (x.Model == BillingModel.OneTime) != (r.Purpose == OfferPurpose.TrainingPlan)))
            throw ApiException.Invalid("Plan sales require one-time pricing; coaching offers require session or subscription pricing.");
        foreach (var option in r.BillingOptions)
            OfferRules.Validate(option);
        foreach (var tag in r.Tags)
            OfferRules.NormalizeTag(tag);
        await forms.RequireUsableVersionAsync(r.ApplicationFormVersionId, formOwner ?? accounts.UserId, FormPurpose.Application, ct);
    }
    private async Task SetChildren(Guid id, OfferRequest r, CancellationToken ct)
    {
        db.Options.RemoveRange(await db.Options.Where(x => x.OfferId == id).ToArrayAsync(ct));
        db.TagLinks.RemoveRange(await db.TagLinks.Where(x => x.OfferId == id).ToArrayAsync(ct));
        await db.SaveChangesAsync(ct);
        foreach (var option in r.BillingOptions)
        {
            if (await db.Options.AnyAsync(x => x.Id == option.Id && x.OfferId != id, ct))
                throw ApiException.Invalid("Billing option belongs to another offer.");
            db.Options.Add(new()
            {
                Id = option.Id,
                OfferId = id,
                Name = option.Name.Trim(),
                Model = option.Model,
                Price = option.Price,
                MinSessions = option.MinSessions,
                MaxSessions = option.MaxSessions,
                SessionCount = option.SessionCount,
                PeriodCount = option.PeriodCount,
                PeriodUnit = option.PeriodUnit,
                DueRule = option.PaymentTerms?.Rule ?? DueRule.Upfront,
                ValidityDays = option.ValidityDays,
                OffsetDays = option.PaymentTerms?.OffsetDays
            });
        }
        // Shared normalized tag rows need a stable lock across offers/coaches.
        foreach (var name in r.Tags.Select(OfferRules.NormalizeTag).Distinct().Order(StringComparer.Ordinal))
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"offer-tag:" + name}, 0))", ct);
            var tag = await db.Tags.SingleOrDefaultAsync(x => x.Name == name, ct);
            if (tag == null)
            {
                tag = new()
                {
                    Id = Guid.NewGuid(),
                    Name = name
                };
                db.Tags.Add(tag);
                await db.SaveChangesAsync(ct);
            }
            db.TagLinks.Add(new()
            {
                OfferId = id,
                TagId = tag.Id
            });
        }
    }
    private async Task<OfferDto[]> DraftDtos(Offer[] rows, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var options = await db.Options.AsNoTracking().Where(x => ids.Contains(x.OfferId)).OrderBy(x => x.Name).ThenBy(x => x.Id).ToArrayAsync(ct);
        var tags = await (from l in db.TagLinks.AsNoTracking() join t in db.Tags.AsNoTracking() on l.TagId equals t.Id where ids.Contains(l.OfferId) orderby t.Name select new { l.OfferId, t.Name }).ToArrayAsync(ct);
        return rows.Select(x => new OfferDto(x.Id, x.CoachId, x.Name, x.Description, x.Category, x.CoachingMode, x.ApplicationFormVersionId, tags.Where(t => t.OfferId == x.Id).Select(t => t.Name).ToArray(), options.Where(o => o.OfferId == x.Id).Select(OptionDto).ToArray(), x.Status, x.CurrentPublishedRevisionId, x.CreatedAt, x.UpdatedAt, x.Version, x.TeamId, x.TeamName, x.Purpose)).ToArray();
    }
    private async Task<OfferRevisionDto[]> RevisionDtos(OfferRevision[] rows, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var options = await db.RevisionOptions.AsNoTracking().Where(x => ids.Contains(x.RevisionId)).OrderBy(x => x.Name).ThenBy(x => x.Id).ToArrayAsync(ct);
        return rows.Select(x => new OfferRevisionDto(x.Id, x.OfferId, x.CoachId, x.Number, x.Name, x.Description, x.Category, x.CoachingMode, JsonSerializer.Deserialize<string[]>(x.Tags)!, x.ApplicationFormVersionId, x.Currency, options.Where(o => o.RevisionId == x.Id).Select(OptionDto).ToArray(), x.PublishedAt, x.TeamId, x.TeamName, x.Purpose)).ToArray();
    }
    private static BillingOptionSnapshot OptionDto(OfferBillingOption x) => new(x.Id, x.Name, x.Model, x.Price, x.MinSessions, x.MaxSessions, x.SessionCount, x.PeriodCount, x.PeriodUnit, new(x.DueRule, x.OffsetDays), x.ValidityDays);
    private static BillingOptionSnapshot OptionDto(RevisionBillingOption x) => new(x.Id, x.Name, x.Model, x.Price, x.MinSessions, x.MaxSessions, x.SessionCount, x.PeriodCount, x.PeriodUnit, new(x.DueRule, x.OffsetDays), x.ValidityDays);
    private static RevisionBillingOption RevisionOption(Guid revision, BillingOptionSnapshot x) => new() { RevisionId = revision, Id = x.Id, Name = x.Name, Model = x.Model, Price = x.Price, MinSessions = x.MinSessions, MaxSessions = x.MaxSessions, SessionCount = x.SessionCount, PeriodCount = x.PeriodCount, PeriodUnit = x.PeriodUnit, DueRule = x.PaymentTerms?.Rule ?? DueRule.Upfront, OffsetDays = x.PaymentTerms?.OffsetDays, ValidityDays = x.ValidityDays };
    private static void Apply(Offer o, OfferRequest r)
    {
        o.Name = r.Name.Trim();
        o.Description = r.Description;
        o.Category = r.Category;
        o.CoachingMode = r.CoachingMode;
        o.Purpose = r.Purpose;
        o.ApplicationFormVersionId = r.ApplicationFormVersionId;
    }
    private async Task<Offer> Owned(Guid id, CancellationToken ct)
    {
        await Manage(ct);
        var o = await db.Offers.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.NotFound();
        if (o.TeamId == null && o.CoachId != accounts.UserId)
            throw ApiException.NotFound();
        if (o.TeamId != null)
        {
            var team = await RequireTeam(o.TeamId.Value, false, ct);
            if (o.CoachId != accounts.UserId && team.Role is not ("Owner" or "Admin"))
                throw ApiException.NotFound();
        }
        await db.Entry(o).ReloadAsync(ct);
        return o;
    }
    private async Task<TeamAccess> RequireTeam(Guid teamId, bool write, CancellationToken ct)
    {
        var team = teams == null ? throw ApiException.NotFound() : await teams.RequireAsync(teamId, accounts.UserId, false, ct);
        if (write)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + teamId}, 0))", ct);
            team = await teams.RequireAsync(teamId, accounts.UserId, false, ct);
            if (!team.IsActive)
                throw ApiException.Conflict("An active Team is required to change Team offers.");
            if (team.Status == "DissolutionScheduled")
                throw ApiException.Conflict("This Team is scheduled to dissolve and cannot create new offer commitments.");
        }
        return team;
    }
    private async Task Manage(CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("offers.manage", ct);
    }
    private Task Lock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"offer:" + id}, 0))", ct);
    private static void Check(Offer o, long expected)
    {
        if (o.Version != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "The offer changed. Reload and retry.");
    }
    private void Touch(Offer o)
    {
        o.Version++;
        o.UpdatedAt = clock.GetUtcNow();
    }
    private static void Query(int page, int pageSize, string? search, string sort)
    {
        if (page is < 1 or > 100000 || pageSize is < 1 or > 100 || search?.Length > 200 || sort is not ("updated" or "name"))
            throw ApiException.Invalid("Invalid offer list query.");
    }
}
