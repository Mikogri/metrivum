using Microsoft.EntityFrameworkCore;

namespace TrainFlow.VideoAnalysis.Infrastructure;

public sealed class AnalysisJob
{
    public Guid Id
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public Guid MediaId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string? Note
    {
        get; set;
    }
    public string[] Tags { get; set; } = [];
    public string Configuration { get; set; } = "{}";
    public string Status { get; set; } = "Queued";
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string? Result
    {
        get; set;
    }
    public string? FailureCode
    {
        get; set;
    }
    public int Attempts
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset AvailableAt
    {
        get; set;
    }
    public DateTimeOffset? CompletedAt
    {
        get; set;
    }
    public DateTimeOffset? LeaseExpiresAt
    {
        get; set;
    }
    public Guid? LeaseToken
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}

public sealed class VideoAnalysisDbContext(DbContextOptions<VideoAnalysisDbContext> options) : DbContext(options)
{
    public DbSet<AnalysisJob> Jobs => Set<AnalysisJob>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("video_analysis");
        var job = model.Entity<AnalysisJob>();
        job.ToTable("jobs", table =>
        {
            table.HasCheckConstraint("ck_job_status", "\"Status\" IN ('Queued', 'Processing', 'Completed', 'Failed', 'Cancelled')");
            table.HasCheckConstraint("ck_job_attempts", "\"Attempts\" >= 0");
            table.HasCheckConstraint("ck_job_result", "(\"Status\" = 'Completed') = (\"Result\" IS NOT NULL)");
            table.HasCheckConstraint("ck_job_lease", "(\"Status\" = 'Processing') = (\"LeaseToken\" IS NOT NULL AND \"LeaseExpiresAt\" IS NOT NULL)");
        });
        job.HasKey(x => x.Id);
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
        job.HasIndex(x => new { x.OwnerId, x.CreatedAt, x.Id });
        job.HasIndex(x => new { x.Status, x.AvailableAt, x.CreatedAt, x.Id });
    }
}
