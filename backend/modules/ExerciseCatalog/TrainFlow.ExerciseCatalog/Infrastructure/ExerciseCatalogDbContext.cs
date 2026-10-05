using Microsoft.EntityFrameworkCore;
using TrainFlow.ExerciseCatalog.Domain;

namespace TrainFlow.ExerciseCatalog.Infrastructure;

public sealed class ExerciseCatalogDbContext(DbContextOptions<ExerciseCatalogDbContext> options) : DbContext(options)
{
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<ExerciseRevision> Revisions => Set<ExerciseRevision>();
    public DbSet<ExerciseTagDefinition> Tags => Set<ExerciseTagDefinition>();
    public DbSet<ExerciseTag> ExerciseTags => Set<ExerciseTag>();
    public DbSet<Muscle> Muscles => Set<Muscle>();
    public DbSet<MovementPattern> MovementPatterns => Set<MovementPattern>();
    public DbSet<ExerciseFavorite> Favorites => Set<ExerciseFavorite>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("exercise_catalog");
        model.Entity<Exercise>(entity =>
        {
            entity.ToTable("exercises", table => table.HasCheckConstraint("ck_exercise_version", "version > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.NormalizedName).HasMaxLength(200);
            entity.Property(x => x.Description).HasMaxLength(10000);
            entity.Property(x => x.Instructions).HasMaxLength(20000);
            entity.Property(x => x.DemonstrationUrl).HasMaxLength(2048);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasIndex(x => x.NormalizedName).IsUnique().HasDatabaseName("ux_exercise_normalized_name");
            entity.HasIndex(x => new { x.IsArchived, x.NormalizedName, x.Id });
            entity.HasIndex(x => new { x.IsArchived, x.CreatedAt, x.Id });
            entity.HasIndex(x => x.AuthorId);
            entity.HasMany(x => x.Tags).WithOne().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Muscles).WithOne().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.MovementPatterns).WithOne().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<ExerciseRevision>(entity =>
        {
            entity.ToTable("exercise_revisions");
            entity.HasKey(x => new { x.ExerciseId, x.Version });
            entity.Property(x => x.Description).HasMaxLength(10000);
            entity.Property(x => x.Instructions).HasMaxLength(20000);
            entity.HasOne<Exercise>().WithMany().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<ExerciseTagDefinition>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.NormalizedName).HasMaxLength(80);
            entity.HasIndex(x => x.NormalizedName).IsUnique().HasDatabaseName("ux_exercise_tag_normalized_name");
            entity.HasOne<ExerciseTagDefinition>().WithMany().HasForeignKey(x => x.MergedIntoId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ExerciseTag>(entity =>
        {
            entity.ToTable("exercise_tags");
            entity.HasKey(x => new { x.ExerciseId, x.TagId });
            entity.HasOne(x => x.Tag).WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.TagId, x.ExerciseId });
        });
        model.Entity<Muscle>(entity =>
        {
            entity.ToTable("muscles");
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Key).HasMaxLength(80);
            entity.Property(x => x.LabelEn).HasMaxLength(120);
            entity.Property(x => x.LabelPl).HasMaxLength(120);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasData(
                new Muscle { Key = "quadriceps", LabelEn = "Quadriceps", LabelPl = "Mięśnie czworogłowe uda" },
                new Muscle { Key = "hamstrings", LabelEn = "Hamstrings", LabelPl = "Mięśnie kulszowo-goleniowe" },
                new Muscle { Key = "glutes", LabelEn = "Glutes", LabelPl = "Mięśnie pośladkowe" },
                new Muscle { Key = "chest", LabelEn = "Chest", LabelPl = "Mięśnie klatki piersiowej" },
                new Muscle { Key = "back", LabelEn = "Back", LabelPl = "Mięśnie grzbietu" },
                new Muscle { Key = "shoulders", LabelEn = "Shoulders", LabelPl = "Mięśnie naramienne" },
                new Muscle { Key = "biceps", LabelEn = "Biceps", LabelPl = "Mięśnie dwugłowe ramienia" },
                new Muscle { Key = "triceps", LabelEn = "Triceps", LabelPl = "Mięśnie trójgłowe ramienia" },
                new Muscle { Key = "core", LabelEn = "Core", LabelPl = "Mięśnie tułowia" },
                new Muscle { Key = "calves", LabelEn = "Calves", LabelPl = "Mięśnie łydek" });
        });
        model.Entity<MovementPattern>(entity =>
        {
            entity.ToTable("movement_patterns");
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Key).HasMaxLength(80);
            entity.Property(x => x.LabelEn).HasMaxLength(120);
            entity.Property(x => x.LabelPl).HasMaxLength(120);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasData(
                new MovementPattern { Key = "squat", LabelEn = "Squat", LabelPl = "Przysiad" },
                new MovementPattern { Key = "hinge", LabelEn = "Hip hinge", LabelPl = "Zgięcie w biodrach" },
                new MovementPattern { Key = "lunge", LabelEn = "Lunge", LabelPl = "Wykrok" },
                new MovementPattern { Key = "horizontal-push", LabelEn = "Horizontal push", LabelPl = "Wypychanie poziome" },
                new MovementPattern { Key = "vertical-push", LabelEn = "Vertical push", LabelPl = "Wypychanie pionowe" },
                new MovementPattern { Key = "horizontal-pull", LabelEn = "Horizontal pull", LabelPl = "Przyciąganie poziome" },
                new MovementPattern { Key = "vertical-pull", LabelEn = "Vertical pull", LabelPl = "Przyciąganie pionowe" },
                new MovementPattern { Key = "carry", LabelEn = "Carry", LabelPl = "Noszenie" },
                new MovementPattern { Key = "rotation", LabelEn = "Rotation", LabelPl = "Rotacja" });
        });
        model.Entity<ExerciseMuscle>(entity =>
        {
            entity.ToTable("exercise_muscles");
            entity.HasKey(x => new { x.ExerciseId, x.MuscleKey });
            entity.HasOne(x => x.Muscle).WithMany().HasForeignKey(x => x.MuscleKey).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.MuscleKey, x.ExerciseId });
        });
        model.Entity<ExerciseMovementPattern>(entity =>
        {
            entity.ToTable("exercise_movement_patterns");
            entity.HasKey(x => new { x.ExerciseId, x.PatternKey });
            entity.HasOne(x => x.Pattern).WithMany().HasForeignKey(x => x.PatternKey).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.PatternKey, x.ExerciseId });
        });
        model.Entity<ExerciseFavorite>(entity =>
        {
            entity.ToTable("favorites");
            entity.HasKey(x => new { x.UserId, x.ExerciseId });
            entity.HasOne<Exercise>().WithMany().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        foreach (var entity in model.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                property.SetColumnName(string.Concat(property.Name.Select((c, i) => i > 0 && char.IsUpper(c) ? "_" + char.ToLowerInvariant(c) : char.ToLowerInvariant(c).ToString())));
    }
}
