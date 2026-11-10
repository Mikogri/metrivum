using System.Text.Json;
using System.Text.Json.Serialization;
using Metrivum.Forms.Contracts;

namespace Metrivum.CheckIns.Contracts;

public sealed record McpCheckIn(
    Guid Id,
    Guid RelationshipId,
    string Name,
    DateTimeOffset AvailableAt,
    DateTimeOffset DueAt,
    string Status,
    DateTimeOffset? SubmittedAt,
    DateTimeOffset? ReviewedAt,
    bool WasLate
);

public sealed record McpCheckInPage(McpCheckIn[] Items, int Page, int PageSize, long Total);

public sealed record McpCheckInSubmission(
    McpCheckIn Request,
    FormDefinition Form,
    IReadOnlyDictionary<string, JsonElement>? Answers,
    DateTimeOffset? MeasuredAt,
    string Provenance
);

[JsonConverter(typeof(JsonStringEnumConverter<McpRecurrenceKind>))]
public enum McpRecurrenceKind
{
    OneTime,
    EveryNDays,
    EveryNWeeks,
    Monthly,
    AssignedProgramCycle,
}

public sealed record McpRecurrence(
    McpRecurrenceKind Kind,
    int Interval,
    DateOnly StartDate,
    TimeOnly ReleaseTime,
    IReadOnlyList<int>? WeekDays = null,
    int? DayOfMonth = null,
    Guid? AssignmentId = null,
    IReadOnlyList<int>? CycleDays = null
);

public sealed record McpCheckInAssignment(
    Guid FormTemplateId,
    string Name,
    string Description,
    string TimeZone,
    McpRecurrence Recurrence,
    int ResponseWindowHours,
    IReadOnlyList<Guid> RelationshipIds,
    IReadOnlyList<Guid> GroupIds
);

public sealed record McpAssignmentPreview(
    Guid FormTemplateId,
    Guid FormVersionId,
    Guid[] RelationshipIds,
    string TimeZone,
    DateTimeOffset? NextAvailableAt,
    int ResponseWindowHours,
    string ReviewPath,
    bool Executed
);

public interface IMcpCheckInOperations
{
    Task<McpCheckInPage> ListAsync(
        Guid? relationshipId,
        DateTimeOffset from,
        DateTimeOffset to,
        string? status,
        int page,
        int pageSize,
        CancellationToken ct
    );
    Task<McpCheckInSubmission> SubmissionAsync(Guid requestId, CancellationToken ct);
    Task<McpAssignmentPreview> ProposeAssignmentAsync(
        McpCheckInAssignment request,
        CancellationToken ct
    );
}
