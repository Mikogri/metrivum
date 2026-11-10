using Microsoft.EntityFrameworkCore;

namespace Metrivum.VideoAnalysis.Infrastructure;

/// <summary>Represents persisted analysis job state in VideoAnalysis; mapped and saved by the owning module's EF services.</summary>
public sealed class AnalysisJob
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid? MediaId { get; set; }
    public string ExecutionLocation { get; set; } = "server";
    public Guid? TeamId { get; set; }
    public string? CloudBudgetOperation { get; set; }
    public long? CloudBudgetSeconds { get; set; }
    public Guid? LocalAnalysisId { get; set; }
    public string? SourceVideo { get; set; }
    public Guid? WorkoutExecutionId { get; set; }
    public Guid? SetId { get; set; }

    /// <summary>The coach lets the client of the linked workout see this analysis next to that set.</summary>
    public bool SharedWithClient { get; set; }
    public string Name { get; set; } = "";
    public string? Note { get; set; }
    public string[] Tags { get; set; } = [];
    public string Configuration { get; set; } = "{}";
    public string Status { get; set; } = "Queued";
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string? Result { get; set; }
    public string? FailureCode { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset AvailableAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public Guid? LeaseToken { get; set; }
    public long Version { get; set; } = 1;
}

/// <summary>A read-only link to one completed analysis; at most one active (not revoked) per analysis.</summary>
public sealed class AnalysisShare
{
    public Guid Id { get; set; }
    public Guid AnalysisId { get; set; }
    public Guid OwnerId { get; set; }
    public string Token { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>People who open the link may keep it in their own library (a reference, never a copy).</summary>
    public bool AllowSave { get; set; }
}

/// <summary>A shared analysis someone kept in their library: only a pointer to the owner's analysis and link.</summary>
public sealed class SavedShare
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ShareId { get; set; }
    public Guid AnalysisId { get; set; }
    public DateTimeOffset SavedAt { get; set; }
}

/// <summary>Maps VideoAnalysis entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class VideoAnalysisDbContext(DbContextOptions<VideoAnalysisDbContext> options)
    : DbContext(options)
{
    public DbSet<AnalysisJob> Jobs => Set<AnalysisJob>();
    public DbSet<AnalysisShare> Shares => Set<AnalysisShare>();
    public DbSet<SavedShare> SavedShares => Set<SavedShare>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("video_analysis");
        var job = model.Entity<AnalysisJob>();
        job.ToTable(
            "jobs",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_job_status",
                    "\"Status\" IN ('Queued', 'Processing', 'Completed', 'Failed', 'Cancelled')"
                );
                table.HasCheckConstraint("ck_job_attempts", "\"Attempts\" >= 0");
                table.HasCheckConstraint(
                    "ck_job_result",
                    "(\"Status\" = 'Completed') = (\"Result\" IS NOT NULL)"
                );
                table.HasCheckConstraint(
                    "ck_job_lease",
                    "(\"Status\" = 'Processing') = (\"LeaseToken\" IS NOT NULL AND \"LeaseExpiresAt\" IS NOT NULL)"
                );
            }
        );
        job.HasKey(x => x.Id);
        job.Property(x => x.ExecutionLocation).HasMaxLength(10).HasDefaultValue("server");
        job.Property(x => x.CloudBudgetOperation).HasMaxLength(100);
        job.ToTable(
            "jobs",
            table =>
                table.HasCheckConstraint(
                    "ck_job_cloud_budget",
                    "(\"CloudBudgetOperation\" IS NULL AND \"CloudBudgetSeconds\" IS NULL) OR (\"CloudBudgetOperation\" IS NOT NULL AND \"CloudBudgetSeconds\" > 0 AND \"CloudBudgetSeconds\" <= 3600)"
                )
        );
        job.Property(x => x.SourceVideo).HasColumnType("jsonb");
        job.HasIndex(x => new { x.OwnerId, x.LocalAnalysisId }).IsUnique();
        job.Property(x => x.Name).HasMaxLength(200);
        job.Property(x => x.Note).HasMaxLength(10000);
        job.Property(x => x.Status).HasMaxLength(20);
        job.Property(x => x.IdempotencyKey).HasMaxLength(100);
        job.Property(x => x.RequestHash).HasMaxLength(64);
        job.Property(x => x.FailureCode).HasMaxLength(100);
        job.Property(x => x.Configuration).HasColumnType("jsonb");
        job.Property(x => x.Result).HasColumnType("jsonb");
        job.Property(x => x.Version).IsConcurrencyToken();
        job.HasIndex(x => new { x.OwnerId, x.IdempotencyKey }).IsUnique();
        job.HasIndex(x => new
        {
            x.OwnerId,
            x.CreatedAt,
            x.Id,
        });
        job.HasIndex(x => x.WorkoutExecutionId).HasFilter("\"SharedWithClient\"");
        job.HasIndex(x => new
        {
            x.Status,
            x.AvailableAt,
            x.CreatedAt,
            x.Id,
        });

        var share = model.Entity<AnalysisShare>();
        share.ToTable(
            "analysis_shares",
            table => table.HasCheckConstraint("ck_share_token", "char_length(\"Token\") = 43")
        );
        share.HasKey(x => x.Id);
        share.Property(x => x.Token).HasMaxLength(43);
        share.HasIndex(x => x.Token).IsUnique();
        share.HasIndex(x => x.AnalysisId).IsUnique().HasFilter("\"RevokedAt\" IS NULL");
        // The active-share uniqueness index cannot cover FK checks on revoked shares.
        share.HasIndex(x => new { x.AnalysisId, x.RevokedAt });
        share
            .HasOne<AnalysisJob>()
            .WithMany()
            .HasForeignKey(x => x.AnalysisId)
            .OnDelete(DeleteBehavior.Cascade);
        var saved = model.Entity<SavedShare>();
        saved.ToTable("saved_shares");
        saved.HasKey(x => x.Id);
        saved.HasIndex(x => new { x.UserId, x.AnalysisId }).IsUnique();
        saved.HasIndex(x => new { x.UserId, x.SavedAt });
        saved
            .HasOne<AnalysisShare>()
            .WithMany()
            .HasForeignKey(x => x.ShareId)
            .OnDelete(DeleteBehavior.Cascade);
        saved
            .HasOne<AnalysisJob>()
            .WithMany()
            .HasForeignKey(x => x.AnalysisId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
