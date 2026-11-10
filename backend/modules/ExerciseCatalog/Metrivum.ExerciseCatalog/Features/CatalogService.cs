using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.ExerciseCatalog.Domain;
using Metrivum.ExerciseCatalog.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Metrivum.ExerciseCatalog.Features;

/// <summary>Reads the exercise catalog and changes authorized exercises, tags and dictionaries while retaining revision and version checks.</summary>
public sealed partial class CatalogService(
    ExerciseCatalogDbContext db,
    IAccountContext account,
    IFeatureAccessService access,
    IAbuseProtection? abuse = null
) : IExerciseCatalog
{
    public Task<CatalogPage> ListAsync(CatalogQuery request, CancellationToken ct) =>
        ListInternalAsync(request, null, ct);

    public async Task<CatalogPage> ListForMcpAsync(
        CatalogQuery request,
        string[]? equipment,
        CancellationToken ct
    )
    {
        Guid[]? eligible = null;
        if (equipment is not null)
        {
            if (equipment.Length > 50)
                throw ApiException.Invalid("At most 50 equipment keys are allowed.");
            foreach (var key in equipment)
                ValidateKey(key);
            var available = equipment.ToHashSet(StringComparer.Ordinal);
            eligible = (await GeneratorPoolAsync(ct))
                .Exercises.Where(x =>
                    x.EquipmentAnyOf.Any(branch => branch.AllOf.All(available.Contains))
                )
                .Select(x => x.Id)
                .ToArray();
        }
        return await ListInternalAsync(request, eligible, ct);
    }

    private async Task<CatalogPage> ListInternalAsync(
        CatalogQuery request,
        Guid[]? eligible,
        CancellationToken ct
    )
    {
        await access.RequireAsync("exercises.browse", ct);
        if (abuse is not null)
            await abuse.RequireAsync(account.UserId, AbusePolicies.Search, cancellationToken: ct);
        if (request.FavoritesOnly)
            await access.RequireAsync("exercises.favorites", ct);
        ValidatePage(request.Page, request.PageSize);
        var query = db.Exercises.AsNoTracking().Where(x => !x.IsArchived);
        if (eligible is not null)
            query = query.Where(x => eligible.Contains(x.Id));
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // Matches the exercise name or any muscle it works (English/Polish label or key).
            var search = NormalizedName(request.Search, 200);
            // Normalize the reference dictionary in .NET: PostgreSQL's C locale cannot uppercase Polish letters.
            var muscles = await db
                .Muscles.AsNoTracking()
                .Select(m => new
                {
                    m.Key,
                    m.LabelEn,
                    m.LabelPl,
                })
                .ToArrayAsync(ct);
            // Each keyword must match; word order is irrelevant. Filtering stays in SQL before pagination.
            foreach (
                var term in search.Split(' ', StringSplitOptions.RemoveEmptyEntries).Distinct()
            )
            {
                var termKey = term.ToLowerInvariant().Replace(' ', '-');
                var matchingMuscles = muscles
                    .Where(m =>
                        m.Key.Contains(termKey, StringComparison.Ordinal)
                        || CatalogText.Normalize(m.LabelEn).Contains(term, StringComparison.Ordinal)
                        || CatalogText.Normalize(m.LabelPl).Contains(term, StringComparison.Ordinal)
                    )
                    .Select(m => m.Key)
                    .ToArray();
                query = query.Where(x =>
                    x.NormalizedName.Contains(term)
                    || x.Muscles.Any(m => matchingMuscles.Contains(m.MuscleKey))
                );
            }
        }
        if (request.TagId is { } tag)
            query = query.Where(x => x.Tags.Any(t => t.TagId == tag));
        if (request.MuscleKey is { } muscle)
        {
            ValidateKey(muscle);
            query = query.Where(x => x.Muscles.Any(m => m.MuscleKey == muscle));
        }
        if (request.MovementPatternKey is { } pattern)
        {
            ValidateKey(pattern);
            query = query.Where(x => x.MovementPatterns.Any(p => p.PatternKey == pattern));
        }
        var user = account.UserId;
        if (request.FavoritesOnly)
            query = query.Where(x =>
                db.Favorites.Any(f => f.UserId == user && f.ExerciseId == x.Id)
            );
        var ordered = request.Sort switch
        {
            "name" => query.OrderBy(x => x.NormalizedName).ThenBy(x => x.Id),
            "-name" => query.OrderByDescending(x => x.NormalizedName).ThenBy(x => x.Id),
            "createdAt" => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
            "-createdAt" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be name, -name, createdAt or -createdAt."),
        };
        var total = await query.CountAsync(ct);
        var items = await ordered
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new ExerciseListItemDto(
                x.Id,
                x.Name,
                x.Description,
                x.Version,
                db.Favorites.Any(f => f.UserId == user && f.ExerciseId == x.Id),
                x.CreatedAt,
                x.Muscles.Where(m => m.IsPrimary)
                    .OrderBy(m => m.MuscleKey)
                    .Select(m => m.MuscleKey)
                    .ToArray()
            ))
            .ToArrayAsync(ct);
        return new(items, total, request.Page, request.PageSize);
    }

    public async Task<ExerciseDto> GetAsync(Guid id, CancellationToken ct)
    {
        await access.RequireAsync("exercises.browse", ct);
        return await ReadAsync(id, ct);
    }

    public async Task<ExerciseDto> CreateAsync(CreateExerciseRequest request, CancellationToken ct)
    {
        await access.RequireAsync("exercises.create", ct);
        var name = RequiredName(request.Name, 200);
        var description = Text(request.Description, 10000, "description");
        var instructions = Text(request.Instructions, 20000, "instructions");
        var demo = DemonstrationUrl(request.DemonstrationUrl);
        var tagIds = request.TagIds ?? [];
        var primary = request.PrimaryMuscleKeys ?? [];
        var secondary = request.SecondaryMuscleKeys ?? [];
        var patterns = request.MovementPatternKeys ?? [];
        if (tagIds.Length > 30 || primary.Length + secondary.Length > 30 || patterns.Length > 20)
            throw ApiException.Invalid(
                "At most 30 tags, 30 muscles and 20 movement patterns are allowed."
            );
        if (
            tagIds.Distinct().Count() != tagIds.Length
            || primary.Concat(secondary).Distinct().Count() != primary.Length + secondary.Length
            || patterns.Distinct().Count() != patterns.Length
        )
            throw ApiException.Invalid(
                "Tags, muscles and movement patterns must not contain duplicates; primary and secondary muscles must not overlap."
            );
        foreach (var key in primary.Concat(secondary).Concat(patterns))
            ValidateKey(key);
        var muscles = primary.Concat(secondary).ToArray();
        if (
            await db.Muscles.CountAsync(x => muscles.Contains(x.Key) && x.IsActive, ct)
                != muscles.Length
            || await db.MovementPatterns.CountAsync(x => patterns.Contains(x.Key) && x.IsActive, ct)
                != patterns.Length
        )
            throw ApiException.Invalid(
                "All muscle and movement pattern keys must exist and be active."
            );

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Shared row locks prevent a tag merge from losing a concurrently added exercise link.
        var tags =
            tagIds.Length == 0
                ? []
                : await db
                    .Tags.FromSqlInterpolated(
                        $"SELECT * FROM exercise_catalog.tags WHERE id = ANY({tagIds}) ORDER BY id FOR SHARE"
                    )
                    .AsNoTracking()
                    .ToListAsync(ct);
        if (tags.Count != tagIds.Length)
            throw ApiException.Invalid("All tags must exist.");
        if (tags.Any(x => x.MergedIntoId != null))
            throw new ApiException(
                409,
                "TAG_MERGED",
                "A selected tag was merged. Refresh the tag list."
            );
        var now = DateTimeOffset.UtcNow;
        var exercise = new Exercise
        {
            Id = Guid.NewGuid(),
            AuthorId = account.UserId,
            Name = name,
            NormalizedName = CatalogText.Normalize(name),
            Description = description,
            Instructions = instructions,
            DemonstrationUrl = demo,
            CreatedAt = now,
            UpdatedAt = now,
            Tags = tagIds.Select(x => new ExerciseTag { TagId = x }).ToList(),
            Muscles = primary
                .Select(x => new ExerciseMuscle { MuscleKey = x, IsPrimary = true })
                .Concat(secondary.Select(x => new ExerciseMuscle { MuscleKey = x }))
                .ToList(),
            MovementPatterns = patterns
                .Select(x => new ExerciseMovementPattern { PatternKey = x })
                .ToList(),
        };
        db.Exercises.Add(exercise);
        AddRevision(exercise);
        await SaveAsync(ct);
        await transaction.CommitAsync(ct);
        return await ReadAsync(exercise.Id, ct);
    }

    public async Task<ExerciseDto> UpdateAsync(
        Guid id,
        UpdateExerciseRequest request,
        CancellationToken ct
    )
    {
        await access.RequireAsync("exercises.browse", ct);
        var editor = await IsCatalogEditorAsync(ct);
        if (!editor)
            await access.RequireAsync("exercises.create", ct);
        var exercise =
            await db.Exercises.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound();
        if (!editor && exercise.AuthorId != account.UserId)
            throw ApiException.NotFound();
        CheckVersion(exercise.Version, request.ExpectedVersion);
        if (exercise.IsArchived)
            throw new ApiException(
                409,
                "EXERCISE_ARCHIVED",
                "Archived exercises cannot be edited."
            );
        exercise.Description = Text(request.Description, 10000, "description");
        exercise.Instructions = Text(request.Instructions, 20000, "instructions");
        exercise.Version++;
        exercise.UpdatedAt = DateTimeOffset.UtcNow;
        AddRevision(exercise);
        await SaveAsync(ct);
        return await ReadAsync(id, ct);
    }

    public async Task ArchiveAsync(Guid id, int expectedVersion, CancellationToken ct)
    {
        await access.RequireAsync("exercises.create", ct);
        var exercise = await OwnedAsync(id, expectedVersion, ct);
        if (exercise.IsArchived)
            return;
        exercise.IsArchived = true;
        exercise.Version++;
        exercise.UpdatedAt = DateTimeOffset.UtcNow;
        AddRevision(exercise);
        await SaveAsync(ct);
    }

    public async Task<IReadOnlyList<ExerciseRevisionDto>> HistoryAsync(
        Guid id,
        CancellationToken ct,
        int page = 1,
        int pageSize = 50
    )
    {
        await access.RequireAsync("exercises.browse", ct);
        ValidatePage(page, pageSize);
        if (!await db.Exercises.AnyAsync(x => x.Id == id, ct))
            throw ApiException.NotFound();
        return await db
            .Revisions.AsNoTracking()
            .Where(x => x.ExerciseId == id)
            .OrderByDescending(x => x.Version)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new ExerciseRevisionDto(
                x.Version,
                x.Description,
                x.Instructions,
                x.IsArchived,
                x.CreatedAt
            ))
            .ToArrayAsync(ct);
    }

    public async Task SetFavoriteAsync(Guid id, bool favorite, CancellationToken ct)
    {
        await access.RequireAsync("exercises.favorites", ct);
        if (!await db.Exercises.AnyAsync(x => x.Id == id && (!favorite || !x.IsArchived), ct))
            throw ApiException.NotFound();
        var user = account.UserId;
        if (favorite)
        {
            var now = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO exercise_catalog.favorites (user_id, exercise_id, created_at) VALUES ({user}, {id}, {now}) ON CONFLICT (user_id, exercise_id) DO NOTHING",
                ct
            );
        }
        else
            await db
                .Favorites.Where(x => x.UserId == user && x.ExerciseId == id)
                .ExecuteDeleteAsync(ct);
    }

    public async Task<TagDto> CreateTagAsync(string name, CancellationToken ct)
    {
        await access.RequireAsync("exercises.create", ct);
        var tag = new ExerciseTagDefinition
        {
            Id = Guid.NewGuid(),
            Name = RequiredName(name, 80),
            NormalizedName = NormalizedName(name, 80),
        };
        db.Tags.Add(tag);
        await SaveAsync(ct);
        return new(tag.Id, tag.Name);
    }

    public async Task<IReadOnlyList<TagDto>> ListTagsAsync(string? search, CancellationToken ct)
    {
        await access.RequireAsync("exercises.browse", ct);
        var query = db.Tags.AsNoTracking().Where(x => x.MergedIntoId == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalized = NormalizedName(search, 80);
            query = query.Where(x => x.NormalizedName.Contains(normalized));
        }
        return await query
            .OrderBy(x => x.NormalizedName)
            .ThenBy(x => x.Id)
            .Take(100)
            .Select(x => new TagDto(x.Id, x.Name))
            .ToArrayAsync(ct);
    }

    public async Task MergeTagAsync(Guid sourceId, Guid targetId, CancellationToken ct)
    {
        await account.RequireAdminAsync("catalog.manage", ct);
        if (sourceId == targetId)
            throw ApiException.Invalid("Source and target tags must differ.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var ids = new[] { sourceId, targetId };
        var tags = await db
            .Tags.FromSqlInterpolated(
                $"SELECT * FROM exercise_catalog.tags WHERE id = ANY({ids}) ORDER BY id FOR UPDATE"
            )
            .ToListAsync(ct);
        var source = tags.SingleOrDefault(x => x.Id == sourceId) ?? throw ApiException.NotFound();
        var target = tags.SingleOrDefault(x => x.Id == targetId) ?? throw ApiException.NotFound();
        if (source.MergedIntoId != null || target.MergedIntoId != null)
            throw new ApiException(
                409,
                "TAG_MERGED",
                "Refresh tags before merging an already merged tag."
            );
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO exercise_catalog.exercise_tags (exercise_id, tag_id) SELECT exercise_id, {targetId} FROM exercise_catalog.exercise_tags WHERE tag_id = {sourceId} ON CONFLICT (exercise_id, tag_id) DO NOTHING",
            ct
        );
        await db.ExerciseTags.Where(x => x.TagId == sourceId).ExecuteDeleteAsync(ct);
        source.MergedIntoId = targetId;
        await SaveAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<DictionariesDto> ListDictionariesAsync(CancellationToken ct)
    {
        await access.RequireAsync("exercises.browse", ct);
        return new(
            await db
                .Muscles.AsNoTracking()
                .OrderBy(x => x.Key)
                .Select(x => new DictionaryEntryDto(
                    x.Key,
                    x.LabelEn,
                    x.LabelPl,
                    x.IsActive,
                    x.Version
                ))
                .ToArrayAsync(ct),
            await db
                .MovementPatterns.AsNoTracking()
                .OrderBy(x => x.Key)
                .Select(x => new DictionaryEntryDto(
                    x.Key,
                    x.LabelEn,
                    x.LabelPl,
                    x.IsActive,
                    x.Version
                ))
                .ToArrayAsync(ct)
        );
    }

    public async Task<DictionaryEntryDto> SaveDictionaryAsync(
        string kind,
        string key,
        DictionaryRequest request,
        CancellationToken ct
    )
    {
        await account.RequireAdminAsync("catalog.manage", ct);
        ValidateKey(key);
        var en = RequiredName(request.LabelEn, 120);
        var pl = RequiredName(request.LabelPl, 120);
        if (kind == "muscles")
        {
            var item = await db.Muscles.SingleOrDefaultAsync(x => x.Key == key, ct);
            if (item is null)
            {
                CheckVersion(0, request.ExpectedVersion);
                item = new Muscle { Key = key };
                db.Muscles.Add(item);
            }
            else
            {
                CheckVersion(item.Version, request.ExpectedVersion);
                item.Version++;
            }
            item.LabelEn = en;
            item.LabelPl = pl;
            item.IsActive = request.IsActive;
            await SaveAsync(ct);
            return new(item.Key, item.LabelEn, item.LabelPl, item.IsActive, item.Version);
        }
        if (kind == "movement-patterns")
        {
            var item = await db.MovementPatterns.SingleOrDefaultAsync(x => x.Key == key, ct);
            if (item is null)
            {
                CheckVersion(0, request.ExpectedVersion);
                item = new MovementPattern { Key = key };
                db.MovementPatterns.Add(item);
            }
            else
            {
                CheckVersion(item.Version, request.ExpectedVersion);
                item.Version++;
            }
            item.LabelEn = en;
            item.LabelPl = pl;
            item.IsActive = request.IsActive;
            await SaveAsync(ct);
            return new(item.Key, item.LabelEn, item.LabelPl, item.IsActive, item.Version);
        }
        throw ApiException.Invalid("Dictionary kind must be muscles or movement-patterns.");
    }

    public async Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(
        IEnumerable<Guid> ids,
        CancellationToken cancellationToken
    )
    {
        await access.RequireAsync("exercises.browse", cancellationToken);
        var requested = ids.Distinct().Take(1001).ToArray();
        if (requested.Length > 1000)
            throw ApiException.Invalid("At most 1000 exercise snapshots may be requested.");
        return await db
            .Exercises.AsNoTracking()
            .Where(x => requested.Contains(x.Id))
            .Select(x => new ExerciseSnapshot(
                x.Id,
                x.Version,
                x.Name,
                x.Description,
                x.Instructions
            ))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
    }

    public async Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(
        IEnumerable<string> names,
        CancellationToken cancellationToken
    )
    {
        await access.RequireAsync("exercises.browse", cancellationToken);
        var requested = names.Distinct(StringComparer.Ordinal).Take(1001).ToArray();
        if (requested.Length > 1000)
            throw ApiException.Invalid("At most 1000 exercise names may be matched.");
        var normalized = requested.ToDictionary(
            x => x,
            x => NormalizedName(x, 200),
            StringComparer.Ordinal
        );
        var keys = normalized.Values.Distinct().ToArray();
        var matches = await db
            .Exercises.AsNoTracking()
            .Where(x => !x.IsArchived && keys.Contains(x.NormalizedName))
            .Select(x => new
            {
                x.NormalizedName,
                Snapshot = new ExerciseSnapshot(
                    x.Id,
                    x.Version,
                    x.Name,
                    x.Description,
                    x.Instructions
                ),
            })
            .ToDictionaryAsync(x => x.NormalizedName, x => x.Snapshot, cancellationToken);
        return normalized
            .Where(x => matches.ContainsKey(x.Value))
            .ToDictionary(x => x.Key, x => matches[x.Value], StringComparer.Ordinal);
    }

    private async Task<ExerciseDto> ReadAsync(Guid id, CancellationToken ct)
    {
        var result =
            await db
                .Exercises.AsNoTracking()
                .AsSplitQuery()
                .Include(x => x.Tags)
                    .ThenInclude(x => x.Tag)
                .Include(x => x.Muscles)
                .Include(x => x.MovementPatterns)
                .Where(x => x.Id == id)
                .Select(x => new
                {
                    Exercise = x,
                    Favorite = db.Favorites.Any(f =>
                        f.UserId == account.UserId && f.ExerciseId == x.Id
                    ),
                })
                .SingleOrDefaultAsync(ct)
            ?? throw ApiException.NotFound();
        var exercise = result.Exercise;
        return new(
            exercise.Id,
            exercise.Name,
            exercise.Description,
            exercise.Instructions,
            exercise.DemonstrationUrl,
            exercise.Version,
            exercise.IsArchived,
            result.Favorite,
            exercise.AuthorId == account.UserId,
            exercise.CreatedAt,
            exercise.UpdatedAt,
            exercise
                .Tags.OrderBy(x => x.Tag.NormalizedName)
                .ThenBy(x => x.TagId)
                .Select(x => new TagDto(x.TagId, x.Tag.Name))
                .ToArray(),
            exercise.Muscles.Where(x => x.IsPrimary).Select(x => x.MuscleKey).Order().ToArray(),
            exercise.Muscles.Where(x => !x.IsPrimary).Select(x => x.MuscleKey).Order().ToArray(),
            exercise.MovementPatterns.Select(x => x.PatternKey).Order().ToArray(),
            !exercise.IsArchived
                && (
                    await IsCatalogEditorAsync(ct)
                    || exercise.AuthorId == account.UserId
                        && (await access.GetAsync(ct)).Features.Any(x =>
                            x.Key == "exercises.create" && x.Available
                        )
                )
        );
    }

    private async Task<bool> IsCatalogEditorAsync(CancellationToken ct)
    {
        try
        {
            await account.RequireAdminAsync("catalog.exercises.edit", ct);
            return true;
        }
        catch (ApiException exception) when (exception.Code == "ADMIN_PERMISSION_REQUIRED")
        {
            return false;
        }
    }

    private async Task<Exercise> OwnedAsync(Guid id, int expectedVersion, CancellationToken ct)
    {
        var exercise =
            await db.Exercises.SingleOrDefaultAsync(
                x => x.Id == id && x.AuthorId == account.UserId,
                ct
            ) ?? throw ApiException.NotFound();
        CheckVersion(exercise.Version, expectedVersion);
        return exercise;
    }

    private void AddRevision(Exercise exercise) =>
        db.Revisions.Add(
            new ExerciseRevision
            {
                ExerciseId = exercise.Id,
                Version = exercise.Version,
                Description = exercise.Description,
                Instructions = exercise.Instructions,
                IsArchived = exercise.IsArchived,
                CreatedAt = exercise.UpdatedAt,
                ChangedBy = account.UserId,
            }
        );

    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw VersionConflict();
        }
        catch (DbUpdateException exception)
            when (exception.InnerException
                    is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
            )
        {
            throw pg.ConstraintName switch
            {
                "ux_exercise_normalized_name" => new ApiException(
                    409,
                    "EXERCISE_NAME_EXISTS",
                    "An exercise with this normalized name already exists, including archived exercises."
                ),
                "ux_exercise_tag_normalized_name" => new ApiException(
                    409,
                    "TAG_NAME_EXISTS",
                    "A tag with this normalized name already exists, including merged tags."
                ),
                _ => VersionConflict(),
            };
        }
    }

    private static void CheckVersion(int actual, int expected)
    {
        if (actual != expected)
            throw VersionConflict();
    }

    private static ApiException VersionConflict() =>
        new(
            409,
            "VERSION_CONFLICT",
            "The resource changed. Refresh and retry with its current version."
        );

    private static string RequiredName(string? value, int maximum)
    {
        if (value is null || value.Length > maximum * 4)
            throw ApiException.Invalid($"A name of at most {maximum} characters is required.");
        string clean;
        try
        {
            clean = CatalogText.Clean(value);
        }
        catch (ArgumentException)
        {
            throw ApiException.Invalid("Text must contain valid Unicode.");
        }
        if (clean.Length == 0 || clean.Length > maximum || clean.Any(char.IsControl))
            throw ApiException.Invalid(
                $"A name of 1–{maximum} characters without control characters is required."
            );
        return clean;
    }

    private static string NormalizedName(string? value, int maximum) =>
        CatalogText.Normalize(RequiredName(value, maximum));

    private static string Text(string? value, int maximum, string field)
    {
        if (value is null || value.Length > maximum || value.Contains('\0'))
            throw ApiException.Invalid(
                $"{field} must be a string of at most {maximum} characters without null characters."
            );
        try
        {
            _ = value.IsNormalized();
        }
        catch (ArgumentException)
        {
            throw ApiException.Invalid($"{field} must contain valid Unicode.");
        }
        return value.Trim();
    }

    private static void ValidateKey(string? value)
    {
        if (value is null || !CatalogText.IsDictionaryKey(value))
            throw ApiException.Invalid(
                "Dictionary keys must be lowercase ASCII words separated by hyphens, up to 80 characters."
            );
    }

    private static void ValidatePage(int page, int size)
    {
        if (page < 1 || page > 10000 || size is < 1 or > 100)
            throw ApiException.Invalid("Page must be 1–10000 and pageSize must be 1–100.");
    }

    private static string? DemonstrationUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (
            value.Length > 2048
            || !Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || uri.UserInfo.Length != 0
        )
            throw ApiException.Invalid(
                "DemonstrationUrl must be an absolute HTTPS URL without credentials, up to 2048 characters."
            );
        return uri.AbsoluteUri;
    }
}
