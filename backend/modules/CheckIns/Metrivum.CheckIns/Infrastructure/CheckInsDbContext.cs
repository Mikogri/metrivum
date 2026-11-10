using Metrivum.CheckIns.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.CheckIns.Infrastructure;

/// <summary>Maps CheckIns entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class CheckInsDbContext(DbContextOptions<CheckInsDbContext> options)
    : DbContext(options)
{
    public DbSet<CheckInSchedule> Schedules => Set<CheckInSchedule>();
    public DbSet<ScheduleTarget> Targets => Set<ScheduleTarget>();
    public DbSet<CheckInRequest> Requests => Set<CheckInRequest>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("checkins");
        var s = model.Entity<CheckInSchedule>();
        s.ToTable(
            "Schedules",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Schedule_Status",
                    "\"Status\" IN ('Active','Paused','Ended')"
                );
                t.HasCheckConstraint(
                    "CK_Schedule_Window",
                    "\"ResponseWindowHours\" BETWEEN 1 AND 8760"
                );
                t.HasCheckConstraint(
                    "CK_Schedule_Name",
                    "length(btrim(\"Name\")) BETWEEN 1 AND 200"
                );
            }
        );
        s.HasKey(x => x.Id);
        s.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
        });
        s.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        s.Property(x => x.Name).HasMaxLength(200);
        s.Property(x => x.Description).HasMaxLength(4000);
        s.Property(x => x.TimeZone).HasMaxLength(100);
        s.Property(x => x.RecurrenceJson).HasColumnType("jsonb");
        s.Property(x => x.LastFailure).HasMaxLength(1000);
        s.Property(x => x.Version).IsConcurrencyToken();
        s.HasIndex(x => new
        {
            x.Status,
            x.NextAvailableAtUtc,
            x.RetryAtUtc,
        });
        s.HasIndex(x => x.Status);
        s.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.Status,
            x.UpdatedAt,
            x.Id,
        });
        s.HasIndex(x => x.FormTemplateId);
        var t = model.Entity<ScheduleTarget>();
        t.ToTable("Targets");
        t.HasKey(x => new
        {
            x.ScheduleId,
            x.TargetId,
            x.IsGroup,
        });
        t.Property(x => x.RelationshipId)
            .HasComputedColumnSql(
                "CASE WHEN NOT \"IsGroup\" THEN \"TargetId\" ELSE NULL END",
                stored: true
            );
        t.Property(x => x.GroupId)
            .HasComputedColumnSql(
                "CASE WHEN \"IsGroup\" THEN \"TargetId\" ELSE NULL END",
                stored: true
            );
        t.HasOne<CheckInSchedule>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.ScheduleId,
                x.CoachId,
                x.WorkspaceId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        t.HasIndex(x => new
        {
            x.GroupId,
            x.CoachId,
            x.WorkspaceId,
        });
        t.HasIndex(x => new
        {
            x.RelationshipId,
            x.CoachId,
            x.WorkspaceId,
        });
        var r = model.Entity<CheckInRequest>();
        r.ToTable(
            "Requests",
            table =>
            {
                table.HasCheckConstraint(
                    "CK_Request_Status",
                    "\"Status\" IN ('Scheduled','Submitted','Reviewed','Cancelled')"
                );
                table.HasCheckConstraint("CK_Request_Dates", "\"DueAtUtc\" > \"AvailableAtUtc\"");
                table.HasCheckConstraint(
                    "CK_Request_Submission",
                    "(\"Status\" IN ('Submitted','Reviewed')) = (\"FormSubmissionId\" IS NOT NULL AND \"SubmittedAt\" IS NOT NULL)"
                );
                table.HasCheckConstraint(
                    "CK_Request_Review",
                    "(\"Status\" = 'Reviewed') = (\"ReviewedAt\" IS NOT NULL AND \"ReviewedBy\" IS NOT NULL)"
                );
                table.HasCheckConstraint(
                    "CK_Request_Cancel",
                    "(\"Status\" = 'Cancelled') = (\"CancelledAt\" IS NOT NULL AND \"CancelledBy\" IS NOT NULL)"
                );
            }
        );
        r.HasKey(x => x.Id);
        r.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.AvailableAtUtc,
        });
        r.HasIndex(x => new
            {
                x.ScheduleId,
                x.AvailableAtUtc,
                x.RelationshipId,
            })
            .IsUnique();
        r.HasIndex(x => x.FormSubmissionId).IsUnique();
        r.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        r.Property(x => x.Version).IsConcurrencyToken();
        r.Property(x => x.AssignmentSource).HasMaxLength(30);
        r.Property(x => x.AssignmentGroupsJson).HasColumnType("jsonb");
        r.Property(x => x.ScheduleName).HasMaxLength(200);
        r.Property(x => x.ClientReply).HasMaxLength(4000);
        r.Property(x => x.CoachPrivateNotes).HasMaxLength(4000);
        r.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.Status,
            x.DueAtUtc,
            x.Id,
        });
        r.HasIndex(x => new
        {
            x.ClientId,
            x.Status,
            x.DueAtUtc,
            x.Id,
        });
        r.HasIndex(x => new
        {
            x.RelationshipId,
            x.DueAtUtc,
            x.Id,
        });
        r.HasIndex(x => new
        {
            x.RelationshipId,
            x.CoachId,
            x.WorkspaceId,
        });
        r.HasIndex(x => x.FormVersionId);
        r.HasOne<CheckInSchedule>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.ScheduleId,
                x.CoachId,
                x.WorkspaceId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
            })
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Creates the CheckIns DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class CheckInsDesignFactory : IDesignTimeDbContextFactory<CheckInsDbContext>
{
    public CheckInsDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<CheckInsDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=localhost;Database=trainflow_design;Username=design_only",
                    x => x.MigrationsHistoryTable("__EFMigrationsHistory", "checkins")
                )
                .Options
        );
}
