using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Domain;

namespace Metrivum.Accounts.Infrastructure;

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
            // The database repeats the structural identity rules, so data stays valid even if a write path
            // bypasses AccountIdentityPolicy. Reserved names, Unicode checks and "onboarded means named" stay in the
            // application: legacy and fixture rows mark profiles onboarded without a username.
            e.ToTable("profiles", t =>
            {
                t.HasCheckConstraint("CK_profiles_username_shape", "\"Username\" IS NULL OR \"Username\" ~ '^[A-Za-z0-9_]{3,32}$'");
                t.HasCheckConstraint("CK_profiles_username_normalized", "(\"Username\" IS NULL AND \"NormalizedUsername\" IS NULL) OR \"NormalizedUsername\" = upper(\"Username\")");
                t.HasCheckConstraint("CK_profiles_display_name", "char_length(\"DisplayName\") <= 100 AND \"DisplayName\" = btrim(\"DisplayName\")");
                t.HasCheckConstraint("CK_profiles_first_name", "\"FirstName\" IS NULL OR (char_length(\"FirstName\") BETWEEN 1 AND 50 AND \"FirstName\" = btrim(\"FirstName\"))");
                t.HasCheckConstraint("CK_profiles_last_name", "\"LastName\" IS NULL OR (char_length(\"LastName\") BETWEEN 1 AND 50 AND \"LastName\" = btrim(\"LastName\"))");
                t.HasCheckConstraint("CK_profiles_bio", "\"Bio\" IS NULL OR (char_length(\"Bio\") BETWEEN 1 AND 500 AND \"Bio\" = btrim(\"Bio\"))");
            });
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.NormalizedUsername).IsUnique();
            e.HasIndex(x => x.NormalizedUsername, "IX_profiles_ActiveUsernamePrefix")
                .HasOperators("varchar_pattern_ops").HasFilter("\"Active\" AND \"Onboarded\" AND \"NormalizedUsername\" IS NOT NULL");
            e.Property(x => x.Username).HasMaxLength(32);
            e.Property(x => x.NormalizedUsername).HasMaxLength(32);
            e.Property(x => x.DisplayName).HasMaxLength(100);
            e.Property(x => x.FirstName).HasMaxLength(50);
            e.Property(x => x.LastName).HasMaxLength(50);
            e.Property(x => x.Bio).HasMaxLength(500);
            e.Property(x => x.Locale).HasMaxLength(2);
            e.Property(x => x.TimeZone).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(32);
            e.Property(x => x.TermsVersion).HasMaxLength(32);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.Property(x => x.Currency).HasMaxLength(3).HasDefaultValue("EUR");
            e.Property(x => x.SystemValues).HasColumnType("jsonb").HasDefaultValueSql("'{}'::jsonb");
            e.Property(x => x.CoverStyle).HasColumnType("jsonb");
            e.Property(x => x.AvatarMediaId);
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
            e.ToTable("user_roles", t => t.HasCheckConstraint("CK_user_roles_role", "\"Role\" IN ('Coach', 'Client', 'CatalogAdmin', 'AccessAdmin', 'ExerciseEditor')"));
            e.HasKey(x => new { x.UserId, x.Role });
            e.Property(x => x.Role).HasMaxLength(32);
            e.HasOne<Profile>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
