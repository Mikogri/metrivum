using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Delivery;

public sealed record AssignProgramRequest(Guid? RevisionId, Guid[] RelationshipIds, Guid[] GroupIds, DateOnly StartDate, string TimeZone);
public sealed record AssignmentStatusRequest(AssignmentStatus Status);
public sealed record RefreshAssignmentRequest(Guid RevisionId);
public sealed record SkipWorkoutRequest(string? Reason);
public sealed record AssignmentBatchDto(Guid Id, AssignmentDto[] Assignments);
public sealed record AssignmentRecipientDto(Guid Id, Guid ClientId, string DisplayName, string? Username);
public sealed record AssignmentDto(Guid Id, Guid RelationshipId, Guid ProgramId, string ProgramName, Guid OriginalRevisionId, Guid EffectiveRevisionId,
    DateOnly StartDate, string TimeZone, AssignmentStatus Status, string Source, Guid? GroupAssignmentId, long Version, string[] AllowedActions, Guid? ClientId = null, string? ClientDisplayName = null, string? ClientUsername = null);
public sealed record OccurrenceDto(Guid Id, Guid AssignmentId, Guid RelationshipId, Guid ProgramId, string ProgramName, Guid RevisionId,
    Guid BlockId, Guid CycleId, Guid DayId, Guid WorkoutId, string Name, DateOnly ScheduledDate, DateTimeOffset Deadline,
    string Status, Guid? ExecutionId, bool LoggedLate, string[] AllowedActions, DateOnly? PerformedDate = null, int? DurationSeconds = null, bool HasComment = false, int? ExerciseCount = null);
public sealed record ActualSet(Guid? PrescribedSetId, Guid? PrescribedSegmentId, bool Skipped, int? Reps, decimal? Load, string? LoadUnit,
    LoadMeaning LoadMeaning, decimal? Rpe, decimal? Rir, decimal? DurationSeconds, decimal? DistanceMeters, decimal? RestSeconds, string? Tempo, string? Comment, Guid? Id = null);
public sealed record ActualExercise(Guid? PrescribedInstanceId, Guid ExerciseId, string? Comment, ActualSet[] Sets);
public sealed record SaveExecutionRequest(DateOnly PerformedDate, string? Comment, int? DurationSeconds, ActualExercise[] Exercises);
public sealed record ExerciseExecutionDto(Guid Id, Guid? PrescribedInstanceId, Guid ExerciseId, string Name, string Comment, ActualSet[] Sets);
public sealed record ExecutionDto(Guid Id, Guid OccurrenceId, ExecutionStatus Status, DateOnly PerformedDate, DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt, DateTimeOffset UpdatedAt, string Comment, int? DurationSeconds, long Version, ExerciseExecutionDto[] Exercises, string[] AllowedActions, WorkoutFeedback? Feedback = null);
public sealed record WorkoutDetailDto(OccurrenceDto Occurrence, WorkoutPrescription Prescription, ExecutionDto? Execution);
