using System.Text.Json.Serialization;

namespace Metrivum.CheckIns.Domain;

[JsonConverter(typeof(JsonStringEnumConverter<RecurrenceKind>))]
public enum RecurrenceKind
{
    OneTime, EveryNDays, EveryNWeeks, Monthly, AssignedProgramCycle
}
[JsonConverter(typeof(JsonStringEnumConverter<ScheduleStatus>))]
public enum ScheduleStatus
{
    Active, Paused, Ended
}
[JsonConverter(typeof(JsonStringEnumConverter<RequestStatus>))]
public enum RequestStatus
{
    Scheduled, Available, Overdue, Submitted, Reviewed, Cancelled
}
public sealed record Recurrence(RecurrenceKind Kind, int Interval, DateOnly StartDate, TimeOnly ReleaseTime, IReadOnlyList<int>? WeekDays = null, int? DayOfMonth = null, Guid? AssignmentId = null, IReadOnlyList<int>? CycleDays = null);
/// <summary>Represents persisted check in schedule state in CheckIns; mapped and saved by the owning module's EF services.</summary>
public sealed class CheckInSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid FormTemplateId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string TimeZone { get; set; } = "UTC";
    public string RecurrenceJson { get; set; } = "";
    public int ResponseWindowHours
    {
        get; set;
    }
    public ScheduleStatus Status
    {
        get; set;
    }
    public DateTimeOffset? NextAvailableAtUtc
    {
        get; set;
    }
    public DateTimeOffset? RetryAtUtc
    {
        get; set;
    }
    public string? LastFailure
    {
        get; set;
    }
    public int FailureCount
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
}
/// <summary>Represents persisted schedule target state in CheckIns; mapped and saved by the owning module's EF services.</summary>
public sealed class ScheduleTarget
{
    public Guid ScheduleId
    {
        get; set;
    }
    public Guid TargetId
    {
        get; set;
    }
    public bool IsGroup
    {
        get; set;
    }
    public Guid? RelationshipId
    {
        get; set;
    }
    public Guid? GroupId
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
}
/// <summary>Represents persisted check in request state in CheckIns; mapped and saved by the owning module's EF services.</summary>
public sealed class CheckInRequest
{
    public string? AssignmentSource { get; set; }
    public string? AssignmentGroupsJson { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ScheduleId
    {
        get; set;
    }
    public string ScheduleName { get; set; } = "";
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
    public Guid ClientId
    {
        get; set;
    }
    public Guid FormVersionId
    {
        get; set;
    }
    public DateTimeOffset AvailableAtUtc
    {
        get; set;
    }
    public DateTimeOffset DueAtUtc
    {
        get; set;
    }
    public RequestStatus Status
    {
        get; set;
    }
    public Guid? FormSubmissionId
    {
        get; set;
    }
    public DateTimeOffset? SubmittedAt
    {
        get; set;
    }
    public bool WasLate
    {
        get; set;
    }
    public DateTimeOffset? ReviewedAt
    {
        get; set;
    }
    public Guid? ReviewedBy
    {
        get; set;
    }
    public string? ClientReply
    {
        get; set;
    }
    public string? CoachPrivateNotes
    {
        get; set;
    }
    public DateTimeOffset? CancelledAt
    {
        get; set;
    }
    public Guid? CancelledBy
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
