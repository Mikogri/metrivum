using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Data.Common;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ExerciseCatalog.Features;
using TrainFlow.ExerciseCatalog.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class CatalogPostgresTests
{
    [CatalogPostgresFact]
    public async Task Detail_loads_favorite_with_parent_without_multiplying_child_collections()
    {
        using var setup = Context();
        var user = Guid.NewGuid();
        var service = Service(setup, user);
        var firstTag = await service.CreateTagAsync($"Detail A {Guid.NewGuid():N}", default);
        var secondTag = await service.CreateTagAsync($"Detail B {Guid.NewGuid():N}", default);
        var created = await service.CreateAsync(new($"Detail {Guid.NewGuid():N}", "Description", "Instructions",
            TagIds: [firstTag.Id, secondTag.Id], PrimaryMuscleKeys: ["glutes", "quadriceps"],
            SecondaryMuscleKeys: ["hamstrings"], MovementPatternKeys: ["squat", "hinge"]), default);
        await service.SetFavoriteAsync(created.Id, true, default);
        var commands = new CatalogQueryLog();
        using var db = new ExerciseCatalogDbContext(new DbContextOptionsBuilder<ExerciseCatalogDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).AddInterceptors(commands).Options);
        var detail = await Service(db, user).GetAsync(created.Id, default);
        Assert.True(detail.IsFavorite);
        Assert.Equal(2, detail.Tags.Count);
        Assert.Equal(new[] { "glutes", "quadriceps" }, detail.PrimaryMuscleKeys);
        Assert.Equal(new[] { "hamstrings" }, detail.SecondaryMuscleKeys);
        Assert.Equal(new[] { "hinge", "squat" }, detail.MovementPatternKeys);
        Assert.Equal(4, commands.Count);
        Assert.False((await Service(db).GetAsync(created.Id, default)).IsFavorite);
    }

    private sealed class CatalogQueryLog : DbCommandInterceptor
    {
        public int Count
        {
            get; private set;
        }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }

    [CatalogPostgresFact]
    public async Task Parallel_creation_rejects_normalized_duplicates()
    {
        var name = $"Concurrent {Guid.NewGuid():N}";
        using var first = Context();
        using var second = Context();
        var attempts = await Task.WhenAll(TryCreate(Service(first), name), TryCreate(Service(second), $" {name.ToUpperInvariant()}  "));
        Assert.Single(attempts, x => x is null);
        Assert.Equal("EXERCISE_NAME_EXISTS", Assert.Single(attempts, x => x is not null)!.Code);
    }

    [CatalogPostgresFact]
    public async Task Update_requires_owner_and_version_and_keeps_history()
    {
        using var db = Context();
        var owner = Guid.NewGuid();
        var service = Service(db, owner);
        var created = await service.CreateAsync(new($"History {Guid.NewGuid():N}", "Before", "Original"), default);
        using var strangerDb = Context();
        var forbidden = await Assert.ThrowsAsync<ApiException>(() => Service(strangerDb).UpdateAsync(created.Id, new(1, "Stolen", ""), default));
        Assert.Equal(404, forbidden.Status);
        var edited = await service.UpdateAsync(created.Id, new(1, "After", "Updated"), default);
        Assert.Equal(2, edited.Version);
        Assert.Equal(created.Name, edited.Name);
        var stale = await Assert.ThrowsAsync<ApiException>(() => service.UpdateAsync(created.Id, new(1, "Lost update", ""), default));
        Assert.Equal("VERSION_CONFLICT", stale.Code);
        var history = await service.HistoryAsync(created.Id, default);
        Assert.Equal(new[] { "After", "Before" }, history.Select(x => x.Description));
    }

    [CatalogPostgresFact]
    public async Task Archive_preserves_snapshot_but_removes_browse_and_name_match()
    {
        using var db = Context();
        var service = Service(db);
        var name = $"Archive {Guid.NewGuid():N}";
        var created = await service.CreateAsync(new(name, "Snapshot description", "Instructions"), default);
        await service.ArchiveAsync(created.Id, 1, default);
        Assert.Empty((await service.ListAsync(new()
        {
            Search = name
        }, default)).Items);
        Assert.Empty(await service.MatchNamesAsync(new[] { name }, default));
        var snapshot = Assert.Single(await service.SnapshotAsync(new[] { created.Id, Guid.NewGuid() }, default)).Value;
        Assert.Equal("Snapshot description", snapshot.Description);
    }

    [CatalogPostgresFact]
    public async Task Favorites_are_private_and_repeated_put_is_idempotent()
    {
        using var db = Context();
        var service = Service(db);
        var name = $"Favorite {Guid.NewGuid():N}";
        var created = await service.CreateAsync(new(name), default);
        await service.SetFavoriteAsync(created.Id, true, default);
        await service.SetFavoriteAsync(created.Id, true, default);
        Assert.True((await service.GetAsync(created.Id, default)).IsFavorite);
        using var otherDb = Context();
        Assert.False((await Service(otherDb).GetAsync(created.Id, default)).IsFavorite);
        Assert.Empty((await Service(otherDb).ListAsync(new()
        {
            Search = name,
            FavoritesOnly = true
        }, default)).Items);
        await service.SetFavoriteAsync(created.Id, false, default);
        Assert.False((await service.GetAsync(created.Id, default)).IsFavorite);
    }

    [CatalogPostgresFact]
    public async Task Tag_merge_preserves_links_and_deduplicates_shared_links()
    {
        using var db = Context();
        var service = Service(db);
        var source = await service.CreateTagAsync($"Source {Guid.NewGuid():N}", default);
        var target = await service.CreateTagAsync($"Target {Guid.NewGuid():N}", default);
        var first = await service.CreateAsync(new($"Merge one {Guid.NewGuid():N}", TagIds: [source.Id]), default);
        var second = await service.CreateAsync(new($"Merge both {Guid.NewGuid():N}", TagIds: [source.Id, target.Id]), default);
        await service.MergeTagAsync(source.Id, target.Id, default);
        Assert.Equal(target.Id, Assert.Single((await service.GetAsync(first.Id, default)).Tags).Id);
        Assert.Equal(target.Id, Assert.Single((await service.GetAsync(second.Id, default)).Tags).Id);
        Assert.DoesNotContain(await service.ListTagsAsync(null, default), x => x.Id == source.Id);
    }

    [CatalogPostgresFact]
    public async Task Revoked_create_feature_prevents_database_write()
    {
        using var db = Context();
        var name = $"Blocked {Guid.NewGuid():N}";
        var service = new CatalogService(db, new Account(Guid.NewGuid()), new Features(false));
        var denied = await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(new(name), default));
        Assert.Equal("FEATURE_UNAVAILABLE", denied.Code);
        Assert.False(await db.Exercises.AnyAsync(x => x.Name == name));
    }

    [CatalogPostgresFact]
    public async Task Concurrent_description_edits_keep_exactly_one_new_revision()
    {
        var user = Guid.NewGuid();
        using var setup = Context();
        var created = await Service(setup, user).CreateAsync(new($"Race edit {Guid.NewGuid():N}", "Original"), default);
        using var first = Context();
        using var second = Context();
        await first.Exercises.SingleAsync(x => x.Id == created.Id);
        await second.Exercises.SingleAsync(x => x.Id == created.Id);
        async Task<ApiException?> Edit(CatalogService service, string description)
        {
            try
            {
                await service.UpdateAsync(created.Id, new(1, description, ""), default);
                return null;
            }
            catch (ApiException error) { return error; }
        }
        var results = await Task.WhenAll(Edit(Service(first, user), "First"), Edit(Service(second, user), "Second"));
        Assert.Single(results, x => x is null);
        Assert.Equal("VERSION_CONFLICT", Assert.Single(results, x => x is not null)!.Code);
        Assert.Equal(2, await setup.Revisions.CountAsync(x => x.ExerciseId == created.Id));
    }

    [CatalogPostgresFact]
    public async Task Browse_filters_and_paginates_in_stable_order()
    {
        using var db = Context();
        var service = Service(db);
        var prefix = $"Browse {Guid.NewGuid():N}";
        var tag = await service.CreateTagAsync($"Filter {Guid.NewGuid():N}", default);
        var first = await service.CreateAsync(new($"{prefix} A", TagIds: [tag.Id], PrimaryMuscleKeys: ["glutes"], MovementPatternKeys: ["squat"]), default);
        await service.CreateAsync(new($"{prefix} C"), default);
        var second = await service.CreateAsync(new($"{prefix} B", TagIds: [tag.Id], SecondaryMuscleKeys: ["glutes"], MovementPatternKeys: ["squat"]), default);
        var result = await service.ListAsync(new()
        {
            Search = prefix,
            TagId = tag.Id,
            MuscleKey = "glutes",
            MovementPatternKey = "squat",
            Page = 2,
            PageSize = 1
        }, default);
        Assert.Equal(2, result.Total);
        Assert.Equal(second.Id, Assert.Single(result.Items).Id);
        var descending = await service.ListAsync(new()
        {
            Search = prefix,
            TagId = tag.Id,
            Sort = "-name",
            Page = 2,
            PageSize = 1
        }, default);
        Assert.Equal(first.Id, Assert.Single(descending.Items).Id);
    }

    [CatalogPostgresFact]
    public async Task Search_matches_worked_muscles_and_lists_primary_muscles()
    {
        using var db = Context();
        var service = Service(db);
        var tag = await service.CreateTagAsync($"Muscle search {Guid.NewGuid():N}", default);
        var glutes = await db.Muscles.AsNoTracking().SingleAsync(x => x.Key == "glutes");
        var worked = await service.CreateAsync(new($"Hip thrust {Guid.NewGuid():N}", TagIds: [tag.Id], PrimaryMuscleKeys: ["glutes"]), default);
        await service.CreateAsync(new($"Curl {Guid.NewGuid():N}", TagIds: [tag.Id]), default);
        // PostgreSQL's C locale uppercases ASCII only; label matching must use the same Unicode normalization as input.
        foreach (var search in new[] { glutes.LabelEn.ToLowerInvariant(), glutes.LabelPl,
            glutes.LabelPl.ToUpperInvariant(), glutes.LabelPl.ToLowerInvariant(),
            glutes.LabelPl.Normalize(System.Text.NormalizationForm.FormD), "glut" })
        {
            var result = await service.ListAsync(new()
            {
                Search = search,
                TagId = tag.Id
            }, default);
            Assert.True(result.Items.Count == 1, $"Expected one muscle match for '{search}', got {result.Items.Count}.");
            var item = Assert.Single(result.Items);
            Assert.Equal(worked.Id, item.Id);
            Assert.Equal(["glutes"], item.PrimaryMuscleKeys);
        }
    }

    [CatalogPostgresFact]
    public async Task Dictionary_deactivation_preserves_existing_links_and_blocks_new_usage()
    {
        using var db = Context();
        var service = Service(db);
        var key = $"test-{Guid.NewGuid():N}";
        var entry = await service.SaveDictionaryAsync("muscles", key, new(0, "Test muscle", "Mięsień testowy"), default);
        var exercise = await service.CreateAsync(new($"Dictionary {Guid.NewGuid():N}", PrimaryMuscleKeys: [key]), default);
        await service.SaveDictionaryAsync("muscles", key, new(entry.Version, "Updated", "Zmieniony", false), default);
        Assert.Contains(key, (await service.GetAsync(exercise.Id, default)).PrimaryMuscleKeys);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(new($"Inactive {Guid.NewGuid():N}", PrimaryMuscleKeys: [key]), default));
        Assert.Equal(400, error.Status);
    }

    [CatalogPostgresFact]
    public async Task Catalog_admin_permission_is_required_before_dictionary_write()
    {
        using var db = Context();
        var service = new CatalogService(db, new Account(Guid.NewGuid(), false), new Features(true));
        var key = $"forbidden-{Guid.NewGuid():N}";
        var error = await Assert.ThrowsAsync<ApiException>(() => service.SaveDictionaryAsync("muscles", key, new(0, "No", "Nie"), default));
        Assert.Equal(403, error.Status);
        Assert.False(await db.Muscles.AnyAsync(x => x.Key == key));
    }

    private static ExerciseCatalogDbContext Context() => new(new DbContextOptionsBuilder<ExerciseCatalogDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).Options);
    private static CatalogService Service(ExerciseCatalogDbContext db, Guid? user = null) => new(db, new Account(user ?? Guid.NewGuid()), new Features(true));
    private static async Task<ApiException?> TryCreate(CatalogService service, string name)
    {
        try
        {
            await service.CreateAsync(new(name), default);
            return null;
        }
        catch (ApiException exception) { return exception; }
    }

    private sealed class Account(Guid user, bool admin = true) : IAccountContext
    {
        public Guid UserId => user;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach]);
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken) => Task.FromResult(new AccountIdentity(user, user));
        public Task RequireAdminAsync(string permission, CancellationToken cancellationToken) => admin && permission == "catalog.manage"
            ? Task.CompletedTask : Task.FromException(new ApiException(403, "ADMIN_PERMISSION_REQUIRED", "Catalog permission required."));
    }
    private sealed class Features(bool available) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken cancellationToken) => available ? Task.CompletedTask : Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Feature revoked."));
        public Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}

public sealed class CatalogPostgresFactAttribute : FactAttribute
{
    public CatalogPostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")))
            Skip = "Set TRAINFLOW_TEST_DATABASE to a migrated, disposable PostgreSQL database.";
    }
}
