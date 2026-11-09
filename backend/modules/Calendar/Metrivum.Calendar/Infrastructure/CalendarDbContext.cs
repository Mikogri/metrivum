using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Metrivum.Calendar.Domain;

namespace Metrivum.Calendar.Infrastructure;

/// <summary>Maps Calendar entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class CalendarDbContext(DbContextOptions<CalendarDbContext> options) : DbContext(options)
{
    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();
    public DbSet<CalendarAttendee> Attendees => Set<CalendarAttendee>();
    public DbSet<CalendarAudit> Audit => Set<CalendarAudit>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("calendar");
        var e = model.Entity<CalendarEvent>();
        e.ToTable("Events", t =>
        {
            t.HasCheckConstraint("CK_Event_Time", "\"EndsAtUtc\" > \"StartsAtUtc\"");
            t.HasCheckConstraint("CK_Event_Kind", "\"Kind\" IN ('Meeting','Event')");
            t.HasCheckConstraint("CK_Event_Dates", "(\"StartDate\" IS NULL AND \"EndDateExclusive\" IS NULL) OR (\"Kind\" = 'Event' AND \"StartDate\" IS NOT NULL AND \"EndDateExclusive\" > \"StartDate\")");
        });
        e.HasKey(x => x.Id);
        e.HasAlternateKey(x => new { x.Id, x.CoachId, x.WorkspaceId });
        e.Property(x => x.Version).IsConcurrencyToken();
        e.Property(x => x.Title).HasMaxLength(200);
        e.Property(x => x.Description).HasMaxLength(10000);
        e.Property(x => x.Kind).HasMaxLength(20);
        e.Property(x => x.TimeZone).HasMaxLength(100);
        e.Property(x => x.Location).HasMaxLength(500);
        e.Property(x => x.MeetingUrl).HasMaxLength(2048);
        e.HasIndex(x => new { x.CoachId, x.WorkspaceId, x.StartsAtUtc, x.Id });
        e.HasIndex(x => new { x.TeamId, x.StartsAtUtc, x.Id });
        var a = model.Entity<CalendarAttendee>();
        a.ToTable("Attendees", t => t.HasCheckConstraint("CK_Attendee_Response", "\"Response\" IN ('Pending','Accepted','Declined')"));
        a.HasKey(x => new { x.EventId, x.ClientId });
        a.Property(x => x.Response).HasMaxLength(20);
        a.Property(x => x.Version).IsConcurrencyToken();
        a.HasOne<CalendarEvent>().WithMany().HasForeignKey(x => new { x.EventId, x.CoachId, x.WorkspaceId }).HasPrincipalKey(x => new { x.Id, x.CoachId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        a.HasIndex(x => new { x.ClientId, x.EventId });
        a.HasIndex(x => new { x.RelationshipId, x.CoachId, x.WorkspaceId, x.ClientId });
        var audit = model.Entity<CalendarAudit>();
        audit.ToTable("Audit");
        audit.HasKey(x => x.Id);
        audit.Property(x => x.Action).HasMaxLength(40);
        audit.HasOne<CalendarEvent>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Restrict);
        audit.HasIndex(x => new { x.EventId, x.At });
    }
}
/// <summary>Creates the Calendar DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class CalendarDesignFactory : IDesignTimeDbContextFactory<CalendarDbContext>
{
    public CalendarDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<CalendarDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=localhost;Database=trainflow_design;Username=design_only", x => x.MigrationsHistoryTable("__EFMigrationsHistory", "calendar")).Options);
}
