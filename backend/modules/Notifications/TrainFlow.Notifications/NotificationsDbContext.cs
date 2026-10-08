using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace TrainFlow.Notifications;

public sealed class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RecipientUserId
    {
        get; set;
    }
    public string EventKey { get; set; } = "";
    public string Type { get; set; } = "";
    public string Category { get; set; } = "";
    public string SourceModule { get; set; } = "";
    public Guid SourceId
    {
        get; set;
    }
    public string? DeepLink
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
    public DateTimeOffset? ReadAt
    {
        get; set;
    }
    public bool Required
    {
        get; set;
    }
    public bool Cancelled
    {
        get; set;
    }
    public DateTimeOffset? DeliveredAt
    {
        get; set;
    }
}
public sealed class NotificationPreference
{
    public Guid UserId
    {
        get; set;
    }
    public bool Messaging { get; set; } = true;
    public bool CheckIns { get; set; } = true;
    public bool Coaching { get; set; } = true;
    public bool System { get; set; } = true;
}
public sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationPreference> Preferences => Set<NotificationPreference>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("notifications");
        var n = b.Entity<Notification>();
        n.ToTable("Notifications");
        n.HasKey(x => x.Id);
        n.HasIndex(x => new { x.RecipientUserId, x.EventKey }).IsUnique();
        n.HasIndex(x => new { x.RecipientUserId, x.AvailableAt, x.ReadAt });
        n.HasIndex(x => new { x.DeliveredAt, x.AvailableAt });
        n.HasIndex(x => new { x.RecipientUserId, x.AvailableAt }).HasDatabaseName("IX_Notifications_Unread")
            .HasFilter("\"ReadAt\" IS NULL AND NOT \"Cancelled\"");
        n.HasIndex(x => x.AvailableAt).HasDatabaseName("IX_Notifications_PendingDelivery")
            .HasFilter("\"DeliveredAt\" IS NULL AND NOT \"Cancelled\"");
        n.Property(x => x.EventKey).HasMaxLength(200);
        n.Property(x => x.Type).HasMaxLength(100);
        n.Property(x => x.Category).HasMaxLength(20);
        n.Property(x => x.SourceModule).HasMaxLength(30);
        n.Property(x => x.DeepLink).HasMaxLength(300);
        b.Entity<NotificationPreference>().ToTable("Preferences").HasKey(x => x.UserId);
    }
}
public sealed class NotificationsDesignFactory : IDesignTimeDbContextFactory<NotificationsDbContext>
{
    public NotificationsDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<NotificationsDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=localhost;Database=trainflow_design;Username=design_only", x => x.MigrationsHistoryTable("__EFMigrationsHistory", "notifications")).Options);
}
