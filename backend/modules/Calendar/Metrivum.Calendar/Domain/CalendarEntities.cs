namespace Metrivum.Calendar.Domain;

/// <summary>Represents persisted calendar event state in Calendar; mapped and saved by the owning module's EF services.</summary>
public sealed class CalendarEvent
{
    public Guid? TeamId
    {
        get; set;
    }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public string Kind { get; set; } = "Meeting";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string TimeZone { get; set; } = "UTC";
    public DateTimeOffset StartsAtUtc
    {
        get; set;
    }
    public DateTimeOffset EndsAtUtc
    {
        get; set;
    }
    public DateOnly? StartDate
    {
        get; set;
    }
    public DateOnly? EndDateExclusive
    {
        get; set;
    }
    public string? Location
    {
        get; set;
    }
    public string? MeetingUrl
    {
        get; set;
    }
    public bool Cancelled
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted calendar attendee state in Calendar; mapped and saved by the owning module's EF services.</summary>
public sealed class CalendarAttendee
{
    public Guid EventId
    {
        get; set;
    }
    public Guid ClientId
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public string Response { get; set; } = "Pending";
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted calendar audit state in Calendar; mapped and saved by the owning module's EF services.</summary>
public sealed class CalendarAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public string Action { get; set; } = "";
    public DateTimeOffset At
    {
        get; set;
    }
}
