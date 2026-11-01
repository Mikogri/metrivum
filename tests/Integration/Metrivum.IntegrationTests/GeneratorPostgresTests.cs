using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.ExerciseCatalog.Features;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Generation;
using Metrivum.Training.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class GeneratorPostgresTests : IDisposable
{
    [TrainingPostgresFact]
    public async Task Generated_draft_is_normal_editable_publishable_plan_and_metadata_is_private()
    {
        await using var db = Context();
        var owner = Guid.NewGuid();
        var service = Service(db, owner);
        var preview = await service.PreviewGenerationAsync(Input(), default);
        Assert.True(preview.Feasible);
        var request = new SaveGeneratedDraftRequest("Generator fixture", "", null, preview.State!);
        var draft = await service.SaveGeneratedDraftAsync(request, "generated-draft", default);
        Assert.Equal(DocumentKind.Program, draft.Kind);
        Assert.Equal(TrainingJson.Serialize(preview.Document), TrainingJson.Serialize(draft.Document));
        var restored = await service.GetGenerationAsync(draft.Id, default);
        Assert.Equal(preview.State!.Selections.OrderBy(x => x.Key), restored!.Selections.OrderBy(x => x.Key));
        Assert.Equal(TrainingJson.Serialize(preview.State.Input), TrainingJson.Serialize(restored.Input));
        Assert.Equal(TrainingJson.Serialize(preview.Document), TrainingJson.Serialize(ProgramGenerator.Restore(restored,
            new(ReviewedGeneratorCatalog.Version, ReviewedGeneratorCatalog.Exercises)).Document));
        Assert.Empty(await db.Revisions.Where(x => x.PlanId == draft.Id).ToArrayAsync());
        var retry = await service.SaveGeneratedDraftAsync(request, "generated-draft", default);
        Assert.Equal(draft.Id, retry.Id);
        Assert.Equal(1, await db.Set<ProgramGenerationRecord>().CountAsync(x => x.OwnerId == owner));
        var updated = await service.SaveAsync(draft.Id, new("Reviewed fixture", "Coach edited", null, draft.Document), draft.Version, default);
        var published = await service.PublishAsync(draft.Id, updated.Version, "explicit-publish", default);
        Assert.Equal("Reviewed fixture", published.Snapshot.Name);
        Assert.NotEmpty(published.Snapshot.Exercises);
        await using var otherDb = Context();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Service(otherDb, Guid.NewGuid()).GetGenerationAsync(draft.Id, default))).Status);
    }

    [TrainingPostgresFact]
    public async Task Save_retries_are_atomic_and_key_reuse_for_changed_input_conflicts()
    {
        var owner = Guid.NewGuid();
        await using var first = Context();
        await using var second = Context();
        var one = Service(first, owner);
        var two = Service(second, owner);
        var preview = await one.PreviewGenerationAsync(Input(), default);
        var request = new SaveGeneratedDraftRequest("Concurrent generator", "", null, preview.State!);
        var results = await Task.WhenAll(one.SaveGeneratedDraftAsync(request, "same-action", default), two.SaveGeneratedDraftAsync(request, "same-action", default));
        Assert.Equal(results[0].Id, results[1].Id);
        Assert.Equal(1, await first.Plans.CountAsync(x => x.OwnerId == owner));
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => one.SaveGeneratedDraftAsync(request with { Name = "Different request" }, "same-action", default))).Code);
    }

    [TrainingPostgresFact]
    public async Task Stale_or_infeasible_generation_never_creates_a_program()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var service = Service(db, owner);
        var preview = await service.PreviewGenerationAsync(Input(), default);
        var stale = preview.State! with
        {
            MetadataVersion = "stale"
        };
        Assert.Equal("GENERATOR_CONSTRAINTS", (await Assert.ThrowsAsync<ApiException>(() => service.SaveGeneratedDraftAsync(new("Invalid", "", null, stale), "bad-generation", default))).Code);
        Assert.False(await db.Plans.AnyAsync(x => x.OwnerId == owner));
        Assert.False(await db.Set<ProgramGenerationRecord>().AnyAsync(x => x.OwnerId == owner));
    }

    [TrainingPostgresFact]
    public async Task Generator_feature_denial_prevents_preview_and_save()
    {
        await using var db = Context();
        var owner = Guid.NewGuid();
        var allowed = Service(db, owner);
        var state = (await allowed.PreviewGenerationAsync(Input(), default)).State!;
        var denied = Service(db, owner, true);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => denied.PreviewGenerationAsync(Input(), default))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => denied.SaveGeneratedDraftAsync(new("Denied", "", null, state), "denied", default))).Status);
        Assert.False(await db.Plans.AnyAsync(x => x.OwnerId == owner));
    }

    private static GenerationRequest Input() => new(GenerationMode.Strength, GenerationLevel.Beginner, 60, 10, [1, 4, 8], 2, 42,
        ["dumbbells", "incline-bench"], [], [], [], []);
    private readonly Dictionary<TrainingDbContext, ServiceProvider> providers = [];
    private TrainingDbContext Context()
    {
        var services = new ServiceCollection();
        services.AddSingleton(_ => NpgsqlDataSource.Create(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!));
        services.AddModuleDatabase<TrainingDbContext>("training");
        var provider = services.BuildServiceProvider();
        var db = provider.GetRequiredService<TrainingDbContext>();
        providers.Add(db, provider);
        return db;
    }
    public void Dispose()
    {
        foreach (var provider in providers.Values) provider.Dispose();
    }
    private TrainingService Service(TrainingDbContext db, Guid owner, bool deny = false) => new(db, new Account(owner), new Features(deny), new Catalog(), Options.Create(new TrainingOptions()), TimeProvider.System, new NoTrainingRelationships(), providers[db].GetRequiredService<ModuleTransaction>(), []);
    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId => user;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach]);
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task RequireAdminAsync(string permission, CancellationToken ct) => Task.CompletedTask;
    }
    private sealed class Features(bool deny) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => deny && key == "training.generator.use" ? Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Denied.")) : Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Catalog : IExerciseCatalog
    {
        public Task<GeneratorCatalog> GeneratorPoolAsync(CancellationToken ct) => Task.FromResult(new GeneratorCatalog(ReviewedGeneratorCatalog.Version, ReviewedGeneratorCatalog.Exercises));
        public Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(IEnumerable<Guid> ids, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, ExerciseSnapshot>>(ids.Distinct().ToDictionary(id => id, id => new ExerciseSnapshot(id, 1, ReviewedGeneratorCatalog.Exercises.Single(x => x.Id == id).Name, "", "")));
        public Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(IEnumerable<string> names, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<string, ExerciseSnapshot>>(new Dictionary<string, ExerciseSnapshot>());
    }
}
