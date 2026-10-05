using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ExerciseCatalog.Contracts;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Features;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class TrainingPostgresTests
{
    [TrainingPostgresFact]
    public async Task Draft_conflicts_and_immutable_publication_preserve_original()
    {
        await using var db = Context();
        var service = Service(db);
        var created = await service.CreateAsync(new("Original", "", DocumentKind.Program, null, new(1, [])), default);
        var revision = await service.PublishAsync(created.Id, created.Version, "publish-1", default);
        var updated = await service.SaveAsync(created.Id, new("Changed", "", null, new(1, [])), created.Version, default);
        Assert.Equal("Original", (await service.RevisionAsync(created.Id, revision.Number, default)).Snapshot.Name);
        var conflict = await Assert.ThrowsAsync<ApiException>(() => service.SaveAsync(created.Id, new("Overwrite", "", null, new(1, [])), created.Version, default));
        Assert.Equal("VERSION_CONFLICT", conflict.Code);
        Assert.Equal("Changed", (await service.GetAsync(updated.Id, default)).Name);
    }

    [TrainingPostgresFact]
    public async Task Private_document_is_hidden_from_another_coach()
    {
        await using var db = Context();
        var created = await Service(db).CreateAsync(new("Private", "", DocumentKind.Program, null, new(1, [])), default);
        await using var stranger = Context();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Service(stranger).GetAsync(created.Id, default))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Service(stranger).RevisionAsync(created.Id, 1, default))).Status);
    }

    [TrainingPostgresFact]
    public async Task Revoked_advanced_feature_cannot_be_injected_in_whole_document()
    {
        await using var db = Context();
        var service = Service(db, deny: "training.sets.advanced");
        var exercise = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(Guid.NewGuid(), SetKind.Amrap, new())]);
        var doc = new TrainingDocument(1, [new(Guid.NewGuid(), "B", "", [new(Guid.NewGuid(), "C", "", 3, [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "W", "", [exercise], [])])])])]);
        var denied = await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(new("Advanced", "", DocumentKind.Program, null, doc), default));
        Assert.Equal("FEATURE_UNAVAILABLE", denied.Code);
    }

    [TrainingPostgresFact]
    public async Task Folder_cannot_be_deleted_with_contents_or_moved_under_descendant()
    {
        await using var db = Context();
        var service = Service(db);
        var parent = await service.CreateFolderAsync(new("Parent", null, 0), default);
        var child = await service.CreateFolderAsync(new("Child", parent.Id, 0), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.DeleteFolderAsync(parent.Id, parent.Version, default))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpdateFolderAsync(parent.Id, new("Parent", child.Id, 0), parent.Version, default))).Status);
    }

    [TrainingPostgresFact]
    public async Task Concurrent_quota_checks_allow_only_one_program()
    {
        var user = Guid.NewGuid();
        await using var a = Context();
        await using var b = Context();
        var one = Service(a, user, maximumDocuments: 1);
        var two = Service(b, user, maximumDocuments: 1);
        async Task<bool> Try(TrainingService service)
        {
            try
            {
                await service.CreateAsync(new("One", "", DocumentKind.Program, null, new(1, [])), default);
                return true;
            }
            catch (ApiException e) when (e.Code == "LIMIT_EXCEEDED") { return false; }
        }
        Assert.Single(await Task.WhenAll(Try(one), Try(two)), x => x);
    }

    [TrainingPostgresFact]
    public async Task Revoked_advanced_access_allows_removal_but_rejects_rebinding_to_another_exercise()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var original = Content(SetKind.Amrap);
        var workout = original.Blocks[0].Cycles[0].Days[0].Workouts[0];
        workout.Exercises[0].Sets[0] = workout.Exercises[0].Sets[0] with
        {
            Prescription = new(Rpe: 8)
        };
        var created = await Service(db, owner).CreateAsync(new("Advanced", "", DocumentKind.Program, null, original), default);
        var moved = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(original));
        var exercises = moved.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises;
        exercises[0] = exercises[0] with
        {
            ExerciseId = Guid.NewGuid()
        };
        await using var blockedDb = Context();
        Assert.Equal("FEATURE_UNAVAILABLE", (await Assert.ThrowsAsync<ApiException>(() => Service(blockedDb, owner, "training.sets.advanced").SaveAsync(created.Id, new("Moved", "", null, moved), 1, default))).Code);
        await using var removeDb = Context();
        var removed = original with
        {
            Blocks = []
        };
        Assert.Empty((await Service(removeDb, owner, "training.sets.advanced").SaveAsync(created.Id, new("Removed", "", null, removed), 1, default)).Document.Blocks);
    }

    [TrainingPostgresFact]
    public async Task Published_formula_and_exercise_snapshot_is_independent_of_later_formula_versions()
    {
        await using var db = Context();
        var service = Service(db);
        var formula = await service.CreateFormulaAsync(new("Eighty percent", new("base * .8", new()
        {
            ["base"] = Unit.Kg
        }, Unit.Kg)), default);
        var content = Content(formula: new(formula.Id, 1, null, new()
        {
            ["base"] = new(100, Unit.Kg)
        }));
        var plan = await service.CreateAsync(new("Formula plan", "", DocumentKind.Program, null, content), default);
        var published = await service.PublishAsync(plan.Id, 1, "formula-publication", default);
        await service.UpdateFormulaAsync(formula.Id, new("Ninety percent", new("base * .9", new()
        {
            ["base"] = Unit.Kg
        }, Unit.Kg)), 1, default);
        var stable = await service.RevisionAsync(plan.Id, published.Number, default);
        Assert.Equal(80m, Assert.Single(stable.Snapshot.Formulas).Value.Result.Value);
        Assert.Equal("Ćwiczenie", Assert.Single(stable.Snapshot.Exercises).Value.Description);
        Assert.Equal("base * .8", Assert.Single(stable.Snapshot.Formulas).Value.Expression);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString((await service.ExportAsync(plan.Id, 1, "pdf", "program", null, ",", default)).Content));
    }

    [TrainingPostgresFact]
    public async Task Publish_idempotency_key_is_bound_to_user_operation_and_payload()
    {
        await using var db = Context();
        var service = Service(db);
        var a = await service.CreateAsync(new("A", "", DocumentKind.Program, null, new(1, [])), default);
        var b = await service.CreateAsync(new("B", "", DocumentKind.Program, null, new(1, [])), default);
        var first = await service.PublishAsync(a.Id, 1, "publication", default);
        Assert.Equal(first.Id, (await service.PublishAsync(a.Id, 1, "publication", default)).Id);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => service.PublishAsync(b.Id, 1, "publication", default))).Code);
    }

    [TrainingPostgresFact]
    public async Task Csv_requires_mapping_and_commit_is_atomic_and_idempotent()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var service = Service(db, owner);
        var document = Content();
        var exercise = DocumentRules.Workouts(document).Single().Exercises.Single();
        var csv = TrainingCsv.Export(new(1, "Import", "Description", DocumentKind.Program, document, new()
        {
            [exercise.ExerciseId] = new(exercise.ExerciseId, 1, "Unmatched", "", "")
        }, []), ";");
        var preview = await service.PreviewImportAsync(csv, ";", default);
        await Assert.ThrowsAsync<ApiException>(() => service.CommitImportAsync(preview.Id, new("Imported", DocumentKind.Program, null), 1, "import-key", default));
        Assert.False(await db.Plans.AnyAsync(x => x.OwnerId == owner));
        var mapped = await service.MapImportAsync(preview.Id, new(new()
        {
            [0] = exercise.ExerciseId
        }), preview.Version, default);
        var committed = await service.CommitImportAsync(preview.Id, new("Imported", DocumentKind.Program, null), mapped.Version, "import-key", default);
        await using var retryDb = Context();
        var retry = await Service(retryDb, owner).CommitImportAsync(preview.Id, new("Imported", DocumentKind.Program, null), mapped.Version, "import-key", default);
        Assert.Equal(committed.Id, retry.Id);
        Assert.Equal(1, await db.Plans.CountAsync(x => x.OwnerId == owner));
        Assert.NotEqual(exercise.Id, DocumentRules.Workouts(committed.Document).Single().Exercises.Single().Id);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => service.CommitImportAsync(preview.Id, new("Different", DocumentKind.Program, null), mapped.Version, "import-key", default))).Code);
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => service.CommitImportAsync(preview.Id, new("Imported", DocumentKind.Program, null), mapped.Version, "different-key", default))).Code);
    }

    [TrainingPostgresFact]
    public async Task Csv_preview_is_private_and_expires()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var now = DateTimeOffset.UtcNow;
        var service = Service(db, owner, clock: new FixedClock(now));
        var csv = TrainingCsv.Export(new(1, "Import", "", DocumentKind.Program, new(1, []), [], []), ",");
        var preview = await service.PreviewImportAsync(csv, ",", default);
        await using var otherDb = Context();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Service(otherDb).GetImportAsync(preview.Id, 1, 100, default))).Status);
        await using var expiredDb = Context();
        Assert.Equal("IMPORT_EXPIRED", (await Assert.ThrowsAsync<ApiException>(() => Service(expiredDb, owner, clock: new FixedClock(now.AddHours(1))).CommitImportAsync(preview.Id, new("Late", DocumentKind.Program, null), 1, "late", default))).Code);
    }

    [TrainingPostgresFact]
    public async Task Csv_advanced_content_is_checked_again_at_commit()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var service = Service(db, owner);
        var document = Content(SetKind.Amrap);
        var exercise = DocumentRules.Workouts(document).Single().Exercises.Single();
        var csv = TrainingCsv.Export(new(1, "Import", "", DocumentKind.Program, document, new()
        {
            [exercise.ExerciseId] = new(exercise.ExerciseId, 1, "Mapped", "", "")
        }, []), ",");
        var preview = await service.PreviewImportAsync(csv, ",", default);
        var mapped = await service.MapImportAsync(preview.Id, new(new()
        {
            [0] = exercise.ExerciseId
        }), 1, default);
        await using var revokedDb = Context();
        var denied = await Assert.ThrowsAsync<ApiException>(() => Service(revokedDb, owner, "training.sets.advanced").CommitImportAsync(preview.Id, new("Bypass", DocumentKind.Program, null), mapped.Version, "blocked", default));
        Assert.Equal("FEATURE_UNAVAILABLE", denied.Code);
        Assert.False(await db.Plans.AnyAsync(x => x.OwnerId == owner));
    }

    [TrainingPostgresFact]
    public async Task Revoked_custom_formula_access_blocks_rebinding_and_copy_but_keeps_read_and_unchanged_draft()
    {
        var owner = Guid.NewGuid();
        await using var db = Context();
        var service = Service(db, owner);
        var formula = await service.CreateFormulaAsync(new("Load", new("base * .8", new()
        {
            ["base"] = Unit.Kg
        }, Unit.Kg)), default);
        var document = Content(formula: new(formula.Id, 1, null, new()
        {
            ["base"] = new(100, Unit.Kg)
        }));
        var plan = await service.CreateAsync(new("Original", "", DocumentKind.Program, null, document), default);
        await service.PublishAsync(plan.Id, 1, "published", default);
        await using var revokedDb = Context();
        var revoked = Service(revokedDb, owner, "training.formulas.custom");
        Assert.Equal(80m, Assert.Single((await revoked.RevisionAsync(plan.Id, 1, default)).Snapshot.Formulas).Value.Result.Value);
        var unchanged = await revoked.SaveAsync(plan.Id, new("Renamed", "", null, document), 1, default);
        await Assert.ThrowsAsync<ApiException>(() => revoked.CopyAsync(plan.Id, new("Copied", DocumentKind.Program, null), default));
        await Assert.ThrowsAsync<ApiException>(() => revoked.UpdateFormulaAsync(formula.Id, new("Changed", new("base * .9", new() { ["base"] = Unit.Kg }, Unit.Kg)), 1, default));
        var moved = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(document));
        var sets = DocumentRules.Workouts(moved).Single().Exercises.Single().Sets;
        sets[0] = sets[0] with
        {
            Id = Guid.NewGuid()
        };
        Assert.Equal("FEATURE_UNAVAILABLE", (await Assert.ThrowsAsync<ApiException>(() => revoked.SaveAsync(plan.Id, new("Rebound", "", null, moved), unchanged.Version, default))).Code);
    }

    private static TrainingDocument Content(SetKind kind = SetKind.Standard, FormulaUse? formula = null)
    {
        var exercise = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(Guid.NewGuid(), kind, new(LoadFormula: formula))]);
        return new(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "Cycle", "", 9, [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "Workout", "", [exercise], [])])])])]);
    }

    private static TrainingDbContext Context() => new(new DbContextOptionsBuilder<TrainingDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).Options);
    private static TrainingService Service(TrainingDbContext db, Guid? user = null, string? deny = null, int maximumDocuments = 1000, TimeProvider? clock = null) => new(db, new Account(user ?? Guid.NewGuid()), new Features(deny), new Catalog(), Options.Create(new TrainingOptions { MaximumDocuments = maximumDocuments }), clock ?? TimeProvider.System);
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId => user;
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task RequireAdminAsync(string permission, CancellationToken ct) => Task.CompletedTask;
    }
    private sealed class Features(string? deny) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => key == deny ? Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Revoked.")) : Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Catalog : IExerciseCatalog
    {
        public Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(IEnumerable<Guid> ids, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, ExerciseSnapshot>>(ids.Distinct().ToDictionary(id => id, id => new ExerciseSnapshot(id, 1, "Squat", "Ćwiczenie", "Instructions")));
        public Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(IEnumerable<string> names, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<string, ExerciseSnapshot>>(new Dictionary<string, ExerciseSnapshot>());
    }
}

public sealed class TrainingPostgresFactAttribute : FactAttribute
{
    public TrainingPostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")))
            Skip = "Set TRAINFLOW_TEST_DATABASE to a migrated, disposable PostgreSQL database.";
    }
}
