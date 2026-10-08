using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Domain;

namespace TrainFlow.Accounts.Infrastructure;

public sealed class AccountsDbContext(DbContextOptions<AccountsDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<UserRole> Roles => Set<UserRole>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("accounts");
        model.Entity<Profile>(e =>
        {
            e.ToTable("profiles");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.NormalizedUsername).IsUnique();
            e.Property(x => x.Username).HasMaxLength(32);
            e.Property(x => x.NormalizedUsername).HasMaxLength(32);
            e.Property(x => x.DisplayName).HasMaxLength(100);
            e.Property(x => x.Locale).HasMaxLength(2);
            e.Property(x => x.TimeZone).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(32);
            e.Property(x => x.TermsVersion).HasMaxLength(32);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.Property(x => x.Currency).HasMaxLength(3).HasDefaultValue("EUR");
            e.Property(x => x.SystemValues).HasColumnType("jsonb").HasDefaultValueSql("'{}'::jsonb");
        });
        model.Entity<Workspace>(e =>
        {
            e.ToTable("workspaces");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.OwnerId).IsUnique();
            e.HasOne<Profile>().WithOne().HasForeignKey<Workspace>(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<UserRole>(e =>
        {
            e.ToTable("user_roles");
            e.HasKey(x => new { x.UserId, x.Role });
            e.Property(x => x.Role).HasMaxLength(32);
            e.HasOne<Profile>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
