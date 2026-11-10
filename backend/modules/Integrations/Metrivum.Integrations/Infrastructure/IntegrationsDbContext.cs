using Metrivum.Integrations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Integrations.Infrastructure;

/// <summary>Maps Integrations entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class IntegrationsDbContext(DbContextOptions<IntegrationsDbContext> options)
    : DbContext(options)
{
    public DbSet<IntegrationConnection> Connections => Set<IntegrationConnection>();
    public DbSet<PendingAction> PendingActions => Set<PendingAction>();
    public DbSet<CommandReceipt> CommandReceipts => Set<CommandReceipt>();
    public DbSet<ProgrammingPreferences> ProgrammingPreferences => Set<ProgrammingPreferences>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("integrations");
        b.Entity<IntegrationConnection>(e =>
        {
            e.ToTable(
                "Connections",
                t => t.HasCheckConstraint("CK_Connection_Version", "\"Version\" > 0")
            );
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.Id, x.UserId });
            e.HasIndex(x => new { x.UserId, x.ClientId }).IsUnique();
            e.Property(x => x.ClientId).HasMaxLength(200);
            e.Property(x => x.ClientName).HasMaxLength(200);
            e.Property(x => x.AuthorizationId).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        b.Entity<PendingAction>(e =>
        {
            e.ToTable(
                "PendingActions",
                t =>
                {
                    t.HasCheckConstraint(
                        "CK_Action_Type",
                        "\"Type\" IN ('SendMessage','AssignProgram')"
                    );
                    t.HasCheckConstraint(
                        "CK_Action_Status",
                        "\"Status\" IN ('Pending','Approved','Executed','Rejected','Expired')"
                    );
                    t.HasCheckConstraint("CK_Action_Expiry", "\"ExpiresAt\" > \"CreatedAt\"");
                    t.HasCheckConstraint(
                        "CK_Action_Approval",
                        "(\"Status\" NOT IN ('Approved','Executed')) OR (\"ApprovedAt\" IS NOT NULL AND \"ApprovedBy\" = \"UserId\")"
                    );
                    t.HasCheckConstraint(
                        "CK_Action_Execution",
                        "(\"Status\" <> 'Executed') OR (\"ExecutedAt\" IS NOT NULL AND ((\"Type\" = 'SendMessage' AND \"MessageId\" IS NOT NULL AND \"AssignmentId\" IS NULL) OR (\"Type\" = 'AssignProgram' AND \"AssignmentId\" IS NOT NULL AND \"MessageId\" IS NULL)))"
                    );
                }
            );
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ConnectionId, x.IdempotencyKey }).IsUnique();
            e.HasIndex(x => new
            {
                x.UserId,
                x.Status,
                x.CreatedAt,
            });
            e.HasOne<IntegrationConnection>()
                .WithMany()
                .HasForeignKey(x => new { x.ConnectionId, x.UserId })
                .HasPrincipalKey(x => new { x.Id, x.UserId })
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.PayloadJson).HasColumnType("jsonb");
            e.Property(x => x.PayloadHash).HasMaxLength(64);
            e.Property(x => x.Type).HasMaxLength(30);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.CorrelationId).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        b.Entity<CommandReceipt>(e =>
        {
            e.ToTable("CommandReceipts");
            e.HasKey(x => new
            {
                x.ConnectionId,
                x.Tool,
                x.IdempotencyKey,
            });
            e.HasOne<IntegrationConnection>()
                .WithMany()
                .HasForeignKey(x => x.ConnectionId)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Tool).HasMaxLength(100);
            e.Property(x => x.PayloadHash).HasMaxLength(64);
            e.Property(x => x.ResultJson).HasColumnType("jsonb");
        });
        b.Entity<ProgrammingPreferences>(e =>
        {
            e.ToTable("ProgrammingPreferences");
            e.HasKey(x => x.UserId);
            e.Property(x => x.Note).HasMaxLength(8000);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
    }
}

/// <summary>Creates the Integrations DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class IntegrationsDesignFactory : IDesignTimeDbContextFactory<IntegrationsDbContext>
{
    public IntegrationsDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<IntegrationsDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=localhost;Database=trainflow_design;Username=design_only",
                    x => x.MigrationsHistoryTable("__EFMigrationsHistory", "integrations")
                )
                .Options
        );
}
