using Metrivum.Training.Purchases;
using Metrivum.Training.Generation;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.Training.Domain;

namespace Metrivum.Training.Infrastructure;

/// <summary>Contains the configured training settings and bounds for Training; does not itself access the database.</summary>
public sealed class TrainingOptions
{
    public int MaximumDocuments { get; set; } = 1000;
    public int MaximumFolders { get; set; } = 1000;
    public int MaximumFolderDepth { get; set; } = 16;
    public int MaximumFormulaRules { get; set; } = 500;
    public int MaximumRevisionsPerDocument { get; set; } = 1000;
    public int MaximumImportBytes { get; set; } = 2_097_152;
    public int MaximumImportRows { get; set; } = 5000;
    public int MaximumActiveImports { get; set; } = 10;
    public int ImportLifetimeMinutes { get; set; } = 30;
    public DocumentLimits Document { get; set; } = new();
    public FormulaLimits Formula { get; set; } = new();
}

/// <summary>Represents persisted training folder state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingFolder
{
    public Guid Id
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public Guid? ParentId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public int Position
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted training plan state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingPlan
{
    public Guid Id
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public Guid? FolderId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public DocumentKind Kind
    {
        get; set;
    }
    public bool Archived
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public TrainingDocument Draft { get; set; } = new(1, []);
}
public sealed record RevisionSnapshot(int SchemaVersion, string Name, string Description, DocumentKind Kind, TrainingDocument Document,
    Dictionary<Guid, ExerciseSnapshot> Exercises, Dictionary<Guid, FormulaEvaluation> Formulas);
/// <summary>Represents persisted training revision state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingRevision
{
    public Guid Id
    {
        get; set;
    }
    public Guid PlanId
    {
        get; set;
    }
    public int Number
    {
        get; set;
    }
    public long DraftVersion
    {
        get; set;
    }
    public DateTimeOffset PublishedAt
    {
        get; set;
    }
    public RevisionSnapshot Snapshot { get; set; } = null!;
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
}
public sealed record FormulaDefinition(string Expression, Dictionary<string, Unit> Inputs, Unit OutputUnit);
/// <summary>Represents persisted training formula state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingFormula
{
    public Guid Id
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public int Version { get; set; } = 1;
    public bool Archived
    {
        get; set;
    }
}
/// <summary>Represents persisted training formula version state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingFormulaVersion
{
    public Guid FormulaId
    {
        get; set;
    }
    public int Version
    {
        get; set;
    }
    public FormulaDefinition Definition { get; set; } = null!;
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
/// <summary>Represents persisted training import state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class TrainingImport
{
    public Guid Id
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public DateTimeOffset ExpiresAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public CsvRow[] Rows { get; set; } = [];
    public Dictionary<int, Guid> Mapping { get; set; } = [];
    public Guid? CommittedPlanId
    {
        get; set;
    }
    public string? CommitKey
    {
        get; set;
    }
    public string? RequestHash
    {
        get; set;
    }
}

/// <summary>Maps Training entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class TrainingDbContext(DbContextOptions<TrainingDbContext> options) : DbContext(options)
{
    public DbSet<TrainingFolder> Folders => Set<TrainingFolder>();
    public DbSet<TrainingPlan> Plans => Set<TrainingPlan>();
    public DbSet<TrainingRevision> Revisions => Set<TrainingRevision>();
    public DbSet<TrainingFormula> Formulas => Set<TrainingFormula>();
    public DbSet<TrainingFormulaVersion> FormulaVersions => Set<TrainingFormulaVersion>();
    public DbSet<TrainingImport> Imports => Set<TrainingImport>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("training");
        model.Entity<TrainingPurchase>(e => {
            e.ToTable("purchases"); e.HasKey(x => x.OrderId); e.HasIndex(x => x.ApplicationId).IsUnique();
            e.HasIndex(x => new { x.BuyerId, x.CreatedAt, x.OrderId }); e.HasIndex(x => x.PlanId).IsUnique();
            e.Property(x => x.Name).HasMaxLength(200); e.Property(x => x.Snapshot).HasColumnType("jsonb");
            e.HasOne<TrainingPlan>().WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
        });
        Metrivum.Training.Delivery.DeliveryModel.Configure(model);
        model.ConfigureProgramGeneration();
        var folder = model.Entity<TrainingFolder>();
        folder.ToTable("folders", t => { t.HasCheckConstraint("ck_folder_not_self", "\"ParentId\" IS NULL OR \"ParentId\" <> \"Id\""); t.HasCheckConstraint("ck_folder_position", "\"Position\" >= 0"); });
        folder.HasKey(x => x.Id);
        folder.HasAlternateKey(x => new { x.Id, x.WorkspaceId });
        folder.Property(x => x.Name).HasMaxLength(200);
        folder.Property(x => x.Version).IsConcurrencyToken();
        folder.HasOne<TrainingFolder>().WithMany().HasForeignKey(x => new { x.ParentId, x.WorkspaceId }).HasPrincipalKey(x => new { x.Id, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        folder.HasIndex(x => new { x.WorkspaceId, x.ParentId, x.Position, x.Id });
        var plan = model.Entity<TrainingPlan>();
        plan.ToTable("plans");
        plan.HasKey(x => x.Id);
        plan.Property(x => x.Name).HasMaxLength(200);
        plan.Property(x => x.Description).HasMaxLength(4000);
        plan.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
        plan.Property(x => x.Version).IsConcurrencyToken();
        plan.HasOne<TrainingFolder>().WithMany().HasForeignKey(x => new { x.FolderId, x.WorkspaceId }).HasPrincipalKey(x => new { x.Id, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        plan.HasIndex(x => new { x.WorkspaceId, x.OwnerId, x.Archived, x.UpdatedAt, x.Id });
        Json(plan.Property(x => x.Draft));
        var metric = model.Entity<Metrivum.Training.Features.ClientExerciseMax>();
        metric.ToTable("client_exercise_maxes");
        metric.HasKey(x => x.Id);
        metric.Property(x => x.Alias).HasMaxLength(80);
        metric.Property(x => x.Version).IsConcurrencyToken();
        metric.HasIndex(x => new { x.ClientId, x.Alias }).IsUnique();

        var revision = model.Entity<TrainingRevision>();
        revision.ToTable("revisions");
        revision.HasKey(x => x.Id);
        revision.HasIndex(x => new { x.PlanId, x.Number }).IsUnique();
        revision.HasIndex(x => new { x.PlanId, x.IdempotencyKey }).IsUnique();
        revision.Property(x => x.IdempotencyKey).HasMaxLength(128);
        revision.Property(x => x.RequestHash).HasMaxLength(64);
        revision.HasOne<TrainingPlan>().WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
        Json(revision.Property(x => x.Snapshot));
        var formula = model.Entity<TrainingFormula>();
        formula.ToTable("formulas");
        formula.HasKey(x => x.Id);
        formula.Property(x => x.Name).HasMaxLength(200);
        formula.Property(x => x.Version).IsConcurrencyToken();
        formula.HasIndex(x => new { x.WorkspaceId, x.OwnerId, x.Name, x.Id });
        var version = model.Entity<TrainingFormulaVersion>();
        version.ToTable("formula_versions");
        version.HasKey(x => new { x.FormulaId, x.Version });
        version.HasOne<TrainingFormula>().WithMany().HasForeignKey(x => x.FormulaId).OnDelete(DeleteBehavior.Restrict);
        Json(version.Property(x => x.Definition));
        var import = model.Entity<TrainingImport>();
        import.ToTable("imports");
        import.HasKey(x => x.Id);
        import.Property(x => x.Version).IsConcurrencyToken();
        import.Property(x => x.CommitKey).HasMaxLength(128);
        import.Property(x => x.RequestHash).HasMaxLength(64);
        import.HasIndex(x => new { x.OwnerId, x.CommitKey }).IsUnique();
        import.HasIndex(x => new { x.WorkspaceId, x.ExpiresAt });
        Json(import.Property(x => x.Rows));
        Json(import.Property(x => x.Mapping));
    }
    private static void Json<T>(PropertyBuilder<T> property) where T : class
    {
        property.HasConversion(v => TrainingJson.Serialize(v), v => TrainingJson.Deserialize<T>(v)).HasColumnType("jsonb");
        property.Metadata.SetValueComparer(new ValueComparer<T>((a, b) => TrainingJson.Serialize(a) == TrainingJson.Serialize(b), v => TrainingJson.Serialize(v).GetHashCode(), v => TrainingJson.Deserialize<T>(TrainingJson.Serialize(v))));
    }
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        if (ChangeTracker.Entries<TrainingRevision>().Any(e => e.State is EntityState.Modified or EntityState.Deleted) || ChangeTracker.Entries<TrainingFormulaVersion>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Published revisions and formula versions are immutable.");
        return base.SaveChangesAsync(cancellationToken);
    }
}

// One CSV record represents an exercise occurrence; typed sets preserve advanced prescriptions.
public sealed record CsvRow(int FormatVersion, string ProgramName, string ProgramDescription, Guid BlockId, string BlockName, string BlockDescription,
    Guid CycleId, string CycleName, string CycleDescription, int CycleDays, Guid DayId, int DayNumber, Guid WorkoutId, string WorkoutName, string WorkoutDescription,
    Guid InstanceId, string ExerciseName, string Comment, TrainingSet[] Sets, ExerciseGroup[] Groups,
    string RowKind = "exercise", ExerciseSnapshot? Exercise = null, Dictionary<Guid, FormulaEvaluation>? FormulaSnapshots = null);
