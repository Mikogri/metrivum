using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace TrainFlow.ClientDocumentation.Infrastructure;

public sealed class MeasurementRecord
{
    public Guid Id
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid AuthorId
    {
        get; set;
    }
    public string Source { get; set; } = "";
    public string Key { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Value
    {
        get; set;
    }
    public DateTimeOffset ObservedAt
    {
        get; set;
    }
    public string? Comment
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
}
public sealed class PrivateCoachNote
{
    public Guid Id
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid AuthorId
    {
        get; set;
    }
    public string Text { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class RelationshipDocument
{
    public Guid Id
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid AuthorId
    {
        get; set;
    }
    public string Source { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Description
    {
        get; set;
    }
    public string Category { get; set; } = "";
    public string Visibility { get; set; } = "CoachPrivate";
    public string? Text
    {
        get; set;
    }
    public Guid? MediaId
    {
        get; set;
    }
    public string? ContentType
    {
        get; set;
    }
    public DateTimeOffset ObservedAt
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class DocumentationDbContext(DbContextOptions<DocumentationDbContext> options) : DbContext(options)
{
    public DbSet<MeasurementRecord> Measurements => Set<MeasurementRecord>();
    public DbSet<PrivateCoachNote> Notes => Set<PrivateCoachNote>();
    public DbSet<RelationshipDocument> Documents => Set<RelationshipDocument>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("client_documentation");
        model.Entity<MeasurementRecord>(e =>
        {
            e.ToTable("measurements", t => t.HasCheckConstraint("ck_measurement_value", "\"Value\" >= 0"));
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.RelationshipId, x.Key, x.ObservedAt, x.Id });
            e.Property(x => x.Key).HasMaxLength(60);
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Source).HasMaxLength(20);
            e.Property(x => x.Value).HasPrecision(18, 6);
            e.Property(x => x.Comment).HasMaxLength(2000);
        });
        model.Entity<PrivateCoachNote>(e =>
        {
            e.ToTable("coach_notes");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.RelationshipId, x.CreatedAt, x.Id });
            e.Property(x => x.Text).HasMaxLength(20000);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<RelationshipDocument>(e =>
        {
            e.ToTable("documents", t => { t.HasCheckConstraint("ck_document_visibility", "\"Visibility\" IN ('CoachPrivate', 'SharedWithClient')"); t.HasCheckConstraint("ck_document_content", "(\"MediaId\" IS NOT NULL AND \"Text\" IS NULL) OR (\"MediaId\" IS NULL AND \"Text\" IS NOT NULL)"); });
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.RelationshipId, x.Visibility, x.ObservedAt, x.Id });
            e.HasIndex(x => x.MediaId).IsUnique();
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Category).HasMaxLength(60);
            e.Property(x => x.Visibility).HasMaxLength(30);
            e.Property(x => x.Source).HasMaxLength(20);
            e.Property(x => x.Text).HasMaxLength(50000);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
    }
}
public sealed class DocumentationDesignFactory : IDesignTimeDbContextFactory<DocumentationDbContext>
{
    public DocumentationDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<DocumentationDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured", o => o.MigrationsHistoryTable("__EFMigrationsHistory", "client_documentation")).Options);
}
