using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Media.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Coaching.Features;

public sealed record PortfolioItemDto(
    Guid Id,
    PortfolioKind Kind,
    string Title,
    string? Description,
    string ContentType,
    long Size,
    DateTimeOffset CreatedAt
);

/// <summary>A coach's public profile extras: headline, experience, competencies, client counts and portfolio.</summary>
public sealed record CoachShowcaseDto(
    Guid CoachId,
    string? Headline,
    int? YearsExperience,
    IReadOnlyList<string> Competencies,
    int ActiveClients,
    int ClientsCoached,
    IReadOnlyList<PortfolioItemDto> Portfolio,
    long Version,
    bool HasCover = false,
    IReadOnlyList<PublicSpecializationDto>? SpecializationSelections = null
);

public sealed record CoverRequest(Guid MediaId);

public sealed record ShowcaseRequest(
    string? Headline,
    int? YearsExperience,
    IReadOnlyList<string>? Competencies,
    long Version
);

public sealed record PortfolioUploadRequest(string Name, string ContentType, long Size);

public sealed record PortfolioItemRequest(
    Guid MediaId,
    PortfolioKind Kind,
    string Title,
    string? Description
);

/// <summary>Reads and updates authorized coach showcase content and portfolio references.</summary>
public sealed class CoachShowcaseService(
    CoachingDbContext db,
    IAccountContext accounts,
    IAccountDirectory directory,
    IPortfolioMedia media,
    IPlatformPlans plans,
    TimeProvider clock
)
{
    private const int MaxItems = 30;

    public async Task<CoachShowcaseDto> GetAsync(Guid coachId, CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        await RequireCoachAccountAsync(coachId, ct);
        var showcase = await db
            .Showcases.AsNoTracking()
            .SingleOrDefaultAsync(x => x.CoachId == coachId, ct);
        var clients = db.Relationships.AsNoTracking().Where(x => x.CoachId == coachId);
        var counts = await clients
            .GroupBy(_ => 1)
            .Select(group => new
            {
                Active = group
                    .Where(x => x.Status == RelationshipStatus.Active)
                    .Select(x => x.ClientId)
                    .Distinct()
                    .Count(),
                Total = group.Select(x => x.ClientId).Distinct().Count(),
            })
            .SingleOrDefaultAsync(ct);
        var items = await db
            .PortfolioItems.AsNoTracking()
            .Where(x => x.CoachId == coachId)
            .OrderByDescending(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .Select(x => new PortfolioItemDto(
                x.Id,
                x.Kind,
                x.Title,
                x.Description,
                x.ContentType,
                x.Size,
                x.CreatedAt
            ))
            .ToArrayAsync(ct);
        // A cover chosen on Pro stays stored, but shows only while the plan is active.
        var cover = showcase?.CoverMediaId != null && await plans.HasProAsync(coachId, ct);
        var specializations = await db
            .CoachSpecializations.AsNoTracking()
            .Where(x =>
                x.CoachId == coachId
                && x.Specialization.Active
                && db.SpecializationCategories.Any(c =>
                    c.Code == x.Specialization.CategoryCode && c.Active
                )
            )
            .OrderBy(x => x.Specialization.CategoryCode)
            .ThenBy(x => x.Specialization.SortOrder)
            .Select(x => new PublicSpecializationDto(
                x.SpecializationCode,
                x.Specialization.Name,
                x.Specialization.CategoryCode,
                x.IsPrimary
            ))
            .ToArrayAsync(ct);
        return new(
            coachId,
            showcase?.Headline,
            showcase?.YearsExperience,
            showcase?.Competencies ?? [],
            counts?.Active ?? 0,
            counts?.Total ?? 0,
            items,
            showcase?.Version ?? 0,
            cover,
            specializations
        );
    }

    public async Task<CoachShowcaseDto> UpdateAsync(ShowcaseRequest request, CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        var headline = string.IsNullOrWhiteSpace(request.Headline) ? null : request.Headline.Trim();
        if (headline?.Length > 160)
            throw ApiException.Invalid("The headline can be at most 160 characters.");
        if (request.YearsExperience is < 0 or > 80)
            throw ApiException.Invalid("Years of experience must be between 0 and 80.");
        var competencies = (request.Competencies ?? [])
            .Select(x => x?.Trim() ?? "")
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (competencies.Count > 20 || competencies.Any(x => x.Length > 40))
            throw ApiException.Invalid("Add at most 20 competencies of up to 40 characters each.");
        var showcase = await db.Showcases.SingleOrDefaultAsync(x => x.CoachId == coach, ct);
        if ((showcase?.Version ?? 0) != request.Version)
            throw new ApiException(
                412,
                "VERSION_CONFLICT",
                "The profile changed. Reload and retry."
            );
        if (showcase is null)
        {
            showcase = new CoachShowcase { CoachId = coach };
            db.Showcases.Add(showcase);
        }
        else
        {
            showcase.Version++;
        }
        showcase.Headline = headline;
        showcase.YearsExperience = request.YearsExperience;
        showcase.Competencies = competencies;
        showcase.UpdatedAt = clock.GetUtcNow();
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            throw new ApiException(
                412,
                "VERSION_CONFLICT",
                "The profile changed. Reload and retry."
            );
        }
        return await GetAsync(coach, ct);
    }

    public async Task<DocumentUpload> StartUploadAsync(
        PortfolioUploadRequest request,
        CancellationToken ct
    )
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        if (await db.PortfolioItems.CountAsync(x => x.CoachId == coach, ct) >= MaxItems)
            throw ApiException.Conflict(
                $"A portfolio holds at most {MaxItems} files. Remove one first."
            );
        return await media.CreatePortfolioUploadAsync(
            coach,
            request.Name,
            request.ContentType,
            request.Size,
            ct
        );
    }

    public async Task<PortfolioItemDto> AddAsync(PortfolioItemRequest request, CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        var title = request.Title?.Trim() ?? "";
        var description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();
        if (
            title.Length is < 1 or > 120
            || description?.Length > 1000
            || !Enum.IsDefined(request.Kind)
        )
            throw ApiException.Invalid(
                "Give the file a title of up to 120 characters, a kind, and at most 1000 characters of description."
            );
        if (await db.PortfolioItems.CountAsync(x => x.CoachId == coach, ct) >= MaxItems)
            throw ApiException.Conflict(
                $"A portfolio holds at most {MaxItems} files. Remove one first."
            );
        if (await db.PortfolioItems.AnyAsync(x => x.MediaId == request.MediaId, ct))
            throw ApiException.Conflict("This file is already in the portfolio.");
        var file = await media.AttachPortfolioAsync(coach, request.MediaId, ct);
        var item = new CoachPortfolioItem
        {
            CoachId = coach,
            Kind = request.Kind,
            Title = title,
            Description = description,
            MediaId = file.Id,
            ContentType = file.ContentType,
            Size = file.Size,
            CreatedAt = clock.GetUtcNow(),
        };
        db.PortfolioItems.Add(item);
        await db.SaveChangesAsync(ct);
        return new(
            item.Id,
            item.Kind,
            item.Title,
            item.Description,
            item.ContentType,
            item.Size,
            item.CreatedAt
        );
    }

    public async Task RemoveAsync(Guid itemId, CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        var item =
            await db.PortfolioItems.SingleOrDefaultAsync(
                x => x.Id == itemId && x.CoachId == coach,
                ct
            ) ?? throw ApiException.NotFound();
        db.PortfolioItems.Remove(item);
        await db.SaveChangesAsync(ct);
        await media.ReleasePortfolioAsync(coach, item.MediaId, ct);
    }

    public async Task<DocumentReadUrl> ReadAsync(Guid coachId, Guid itemId, CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        await RequireCoachAccountAsync(coachId, ct);
        var item =
            await db
                .PortfolioItems.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == itemId && x.CoachId == coachId, ct)
            ?? throw ApiException.NotFound();
        return await media.ReadPortfolioAsync(coachId, item.MediaId, accounts.UserId, ct);
    }

    public async Task<DocumentUpload> StartCoverUploadAsync(
        PortfolioUploadRequest request,
        CancellationToken ct
    )
    {
        var coach = await RequireProCoachAsync(ct);
        if (request.ContentType is not ("image/png" or "image/jpeg" or "image/webp"))
            throw ApiException.Invalid("A cover must be a PNG, JPEG or WebP image.");
        return await media.CreatePortfolioUploadAsync(
            coach,
            request.Name,
            request.ContentType,
            request.Size,
            ct
        );
    }

    public async Task<CoachShowcaseDto> SetCoverAsync(CoverRequest request, CancellationToken ct)
    {
        var coach = await RequireProCoachAsync(ct);
        if (await db.PortfolioItems.AnyAsync(x => x.MediaId == request.MediaId, ct))
            throw ApiException.Conflict("This file is a portfolio item.");
        var file = await media.AttachPortfolioAsync(coach, request.MediaId, ct);
        if (!file.ContentType.StartsWith("image/", StringComparison.Ordinal))
            throw ApiException.Invalid("A cover must be an image.");
        var showcase = await db.Showcases.SingleOrDefaultAsync(x => x.CoachId == coach, ct);
        if (showcase is null)
        {
            showcase = new CoachShowcase { CoachId = coach };
            db.Showcases.Add(showcase);
        }
        else
        {
            showcase.Version++;
        }
        var previous = showcase.CoverMediaId;
        showcase.CoverMediaId = file.Id;
        showcase.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        if (previous is { } old && old != file.Id)
            await media.ReleasePortfolioAsync(coach, old, ct);
        return await GetAsync(coach, ct);
    }

    public async Task<CoachShowcaseDto> RemoveCoverAsync(CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        var showcase = await db.Showcases.SingleOrDefaultAsync(x => x.CoachId == coach, ct);
        if (showcase?.CoverMediaId is { } old)
        {
            showcase.CoverMediaId = null;
            showcase.Version++;
            showcase.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await media.ReleasePortfolioAsync(coach, old, ct);
        }
        return await GetAsync(coach, ct);
    }

    public async Task<DocumentReadUrl> ReadCoverAsync(Guid coachId, CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        await RequireCoachAccountAsync(coachId, ct);
        var cover = await db
            .Showcases.AsNoTracking()
            .Where(x => x.CoachId == coachId)
            .Select(x => x.CoverMediaId)
            .SingleOrDefaultAsync(ct);
        if (cover is null || !await plans.HasProAsync(coachId, ct))
            throw ApiException.NotFound();
        return await media.ReadPortfolioAsync(coachId, cover.Value, accounts.UserId, ct);
    }

    private async Task<Guid> RequireProCoachAsync(CancellationToken ct)
    {
        var coach = (await accounts.RequireCoachAsync(ct)).UserId;
        if (!await plans.HasProAsync(coach, ct))
            throw new ApiException(403, "PLAN_REQUIRED", "A custom cover needs the Pro plan.");
        return coach;
    }

    /// <summary>Only active coach accounts have a showcase; anyone else answers 404.</summary>
    private async Task RequireCoachAccountAsync(Guid coachId, CancellationToken ct)
    {
        var found = await directory.GetAccountsAsync([coachId], ct);
        if (!found.TryGetValue(coachId, out var entry) || !entry.Roles.Contains(AccountRole.Coach))
            throw ApiException.NotFound();
    }
}
