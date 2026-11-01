using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Metrivum.Forms.Domain;

namespace Metrivum.Forms.Infrastructure;

public sealed class FormsDbContext(DbContextOptions<FormsDbContext> options) : DbContext(options)
{
    public DbSet<FormTemplate> Templates => Set<FormTemplate>();
    public DbSet<FormVersion> Versions => Set<FormVersion>();
    public DbSet<FormSubmission> Submissions => Set<FormSubmission>();
    public DbSet<FormOperation> Operations => Set<FormOperation>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("forms");
        model.Entity<FormTemplate>(e =>
        {
            e.ToTable("templates");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CoachId, x.Purpose, x.Archived, x.UpdatedAt });
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Draft).HasColumnType("jsonb");
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasOne<FormVersion>().WithMany().HasForeignKey(x => x.CurrentPublishedVersionId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<FormVersion>(e =>
        {
            e.ToTable("versions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TemplateId, x.Number }).IsUnique();
            e.HasIndex(x => new { x.TemplateId, x.DraftVersion }).IsUnique();
            e.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.Definition).HasColumnType("jsonb");
            e.HasOne<FormTemplate>().WithMany().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<FormSubmission>(e =>
        {
            e.ToTable("submissions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.SourceKey).IsUnique();
            e.Property(x => x.SourceKey).HasMaxLength(200);
            e.Property(x => x.Answers).HasColumnType("jsonb");
            e.HasOne<FormVersion>().WithMany().HasForeignKey(x => x.FormVersionId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<FormOperation>(e => { e.ToTable("operations"); e.HasKey(x => new { x.SourceTemplateId, x.Key }); e.Property(x => x.Key).HasMaxLength(100); e.HasOne<FormTemplate>().WithMany().HasForeignKey(x => x.SourceTemplateId).OnDelete(DeleteBehavior.Restrict); e.HasOne<FormTemplate>().WithMany().HasForeignKey(x => x.ResultTemplateId).OnDelete(DeleteBehavior.Restrict); });
    }
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        if (ChangeTracker.Entries().Any(x => (x.Entity is FormVersion or FormSubmission) && (x.State is EntityState.Modified or EntityState.Deleted)))
            throw new InvalidOperationException("Published form versions and submissions are immutable.");
        return base.SaveChangesAsync(cancellationToken);
    }
}
public sealed class FormsDesignFactory : IDesignTimeDbContextFactory<FormsDbContext>
{
    public FormsDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<FormsDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured", o => o.MigrationsHistoryTable("__EFMigrationsHistory", "forms")).Options);
}
