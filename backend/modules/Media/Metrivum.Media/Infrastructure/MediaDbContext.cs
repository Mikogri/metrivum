using Microsoft.EntityFrameworkCore;

namespace Metrivum.Media.Infrastructure;

/// <summary>Represents persisted media file state in Media; mapped and saved by the owning module's EF services.</summary>
public sealed class MediaFile
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string Purpose { get; set; } = "Video";
    public long? DurationMs { get; set; }
    public string Name { get; set; } = "";
    public string Bucket { get; set; } = "";
    public string ObjectKey { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public long ReservedStorageBytes { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public string State { get; set; } = "Pending";
    public bool Pinned { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UploadExpiresAt { get; set; }
    public DateTimeOffset? DeleteAfter { get; set; }
    public int DeleteAttempts { get; set; }
    public long Version { get; set; } = 1;
}

/// <summary>Maps Media entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class MediaDbContext(DbContextOptions<MediaDbContext> options) : DbContext(options)
{
    public DbSet<MediaFile> Files => Set<MediaFile>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("media");
        var file = model.Entity<MediaFile>();
        file.ToTable(
            "files",
            table =>
            {
                table.HasCheckConstraint("ck_media_size", "\"Size\" > 0");
                table.HasCheckConstraint(
                    "ck_media_state",
                    "\"State\" IN ('Pending', 'Ready', 'Deleting', 'Deleted')"
                );
            }
        );
        file.HasKey(x => x.Id);
        file.Property(x => x.Purpose).HasMaxLength(20).HasDefaultValue("Video");
        file.Property(x => x.Name).HasMaxLength(200);
        file.Property(x => x.Bucket).HasMaxLength(100);
        file.Property(x => x.ObjectKey).HasMaxLength(250);
        file.Property(x => x.ContentType).HasMaxLength(100);
        file.Property(x => x.State).HasMaxLength(20);
        file.Property(x => x.Version).IsConcurrencyToken();
        file.HasIndex(x => new { x.Bucket, x.ObjectKey }).IsUnique();
        file.HasIndex(x => new
        {
            x.OwnerId,
            x.CreatedAt,
            x.Id,
        });
        file.HasIndex(x => new { x.State, x.DeleteAfter });
        file.HasIndex(x => new { x.OwnerId, x.AcceptedAt });
    }
}
