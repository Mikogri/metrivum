using Microsoft.EntityFrameworkCore;
using TrainFlow.ExerciseCatalog.Domain;
using TrainFlow.ExerciseCatalog.Infrastructure;
using TrainFlow.ExerciseCatalog.Infrastructure.Migrations;

namespace TrainFlow.IntegrationTests;

public sealed class AnatomyImportTests
{
    [CatalogPostgresFact]
    public async Task Repeated_import_preserves_existing_labels_states_versions_and_exercise_relationships()
    {
        using var db = new ExerciseCatalogDbContext(new DbContextOptionsBuilder<ExerciseCatalogDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"), options =>
                options.MigrationsHistoryTable("__EFMigrationsHistory", "exercise_catalog")).Options);
        await db.Database.MigrateAsync();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var muscle = await db.Muscles.SingleAsync(x => x.Key == "quadriceps");
        muscle.LabelEn = "Preserved coach label";
        muscle.IsActive = false;
        muscle.Version = 17;
        var exercise = new Exercise { Id = Guid.NewGuid(), AuthorId = Guid.NewGuid(), Name = "Anatomy preservation", NormalizedName = Guid.NewGuid().ToString(), CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            Muscles = [new ExerciseMuscle { MuscleKey = "quadriceps", IsPrimary = true }] };
        db.Exercises.Add(exercise);
        await db.SaveChangesAsync();
        var before = await db.Muscles.AsNoTracking().OrderBy(x => x.Key).Select(x => new { x.Key, x.LabelEn, x.LabelPl, x.IsActive, x.Version }).ToArrayAsync();
        var links = await db.Set<ExerciseMuscle>().AsNoTracking().OrderBy(x => x.ExerciseId).ThenBy(x => x.MuscleKey)
            .Select(x => new { x.ExerciseId, x.MuscleKey, x.IsPrimary }).ToArrayAsync();
        await db.Database.ExecuteSqlRawAsync(ImportBodyParts3DMuscles.SeedSql);
        await db.Database.ExecuteSqlRawAsync(ImportBodyParts3DMuscles.SeedSql);
        Assert.Equal(before, await db.Muscles.AsNoTracking().OrderBy(x => x.Key).Select(x => new { x.Key, x.LabelEn, x.LabelPl, x.IsActive, x.Version }).ToArrayAsync());
        Assert.Equal(links, await db.Set<ExerciseMuscle>().AsNoTracking().OrderBy(x => x.ExerciseId).ThenBy(x => x.MuscleKey).Select(x => new { x.ExerciseId, x.MuscleKey, x.IsPrimary }).ToArrayAsync());
        Assert.Equal(99, await db.Muscles.CountAsync(x => x.Key.StartsWith("anatomy-fma")));
        await transaction.RollbackAsync();
    }
}
