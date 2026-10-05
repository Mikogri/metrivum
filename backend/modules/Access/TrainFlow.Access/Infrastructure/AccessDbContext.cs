using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Domain;

namespace TrainFlow.Access.Infrastructure;

public sealed class AccessDbContext(DbContextOptions<AccessDbContext> options) : DbContext(options)
{
    public DbSet<AccessConfiguration> Configurations => Set<AccessConfiguration>();
    public DbSet<AccessAssignment> Assignments => Set<AccessAssignment>();
    public DbSet<FeatureOverride> Overrides => Set<FeatureOverride>();
    public DbSet<FeatureFlag> Flags => Set<FeatureFlag>();
    public DbSet<AccessAudit> Audit => Set<AccessAudit>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("access");
        model.Entity<AccessConfiguration>(e =>
        {
            e.ToTable("configurations");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(64);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<AccessAssignment>(e =>
        {
            e.ToTable("assignments");
            e.HasKey(x => x.UserId);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasOne<AccessConfiguration>().WithMany().HasForeignKey(x => x.ConfigurationId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<FeatureOverride>(e =>
        {
            e.ToTable("overrides");
            e.HasKey(x => new { x.UserId, x.Key });
            e.Property(x => x.Key).HasMaxLength(100);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<FeatureFlag>(e =>
        {
            e.ToTable("flags");
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(100);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<AccessAudit>(e =>
        {
            e.ToTable("audit");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.At, x.Id });
            e.Property(x => x.Operation).HasMaxLength(64);
            e.Property(x => x.Subject).HasMaxLength(100);
            e.Property(x => x.Change).HasColumnType("jsonb");
        });
    }
}
