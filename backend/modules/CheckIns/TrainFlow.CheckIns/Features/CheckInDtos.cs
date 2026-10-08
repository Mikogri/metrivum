using System.Text.Json;
using TrainFlow.CheckIns.Domain;
using TrainFlow.Forms.Contracts;

namespace TrainFlow.CheckIns.Features;

public sealed record ScheduleRequest(Guid FormTemplateId, string Name, string Description, string TimeZone, Recurrence Recurrence, int ResponseWindowHours, IReadOnlyList<Guid> RelationshipIds, IReadOnlyList<Guid> GroupIds);
public sealed record ScheduleDto(Guid Id, Guid CoachId, Guid WorkspaceId, Guid FormTemplateId, string Name, string Description, string TimeZone, Recurrence Recurrence, int ResponseWindowHours, IReadOnlyList<Guid> RelationshipIds, IReadOnlyList<Guid> GroupIds, ScheduleStatus Status, DateTimeOffset? NextAvailableAtUtc, DateTimeOffset? RetryAtUtc, string? LastFailure, int FailureCount, long Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record CheckInRequestDto(Guid Id, Guid ScheduleId, string ScheduleName, Guid RelationshipId, Guid FormVersionId, DateTimeOffset AvailableAtUtc, DateTimeOffset DueAtUtc, RequestStatus Status, DateTimeOffset? SubmittedAt, DateTimeOffset? ReviewedAt, DateTimeOffset? CancelledAt, bool WasLate, long Version, string? ClientReply);
public sealed record CheckInDetailDto(CheckInRequestDto Request, FormVersionDto Form, FormSubmissionDto? Submission, string? CoachPrivateNotes);
public sealed record SubmitCheckInRequest(IReadOnlyDictionary<string, JsonElement> Answers);
public sealed record ReviewCheckInRequest(string? ClientReply = null, string? CoachPrivateNotes = null);
public sealed record CheckInPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, long Total);
