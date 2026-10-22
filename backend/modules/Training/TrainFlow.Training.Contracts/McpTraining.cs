using System.Text.Json.Serialization;

namespace TrainFlow.Training.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<McpSetKind>))]
public enum McpSetKind { Standard, Amrap, Ramp, TopSet, BackOff, DropSet, RestPause, Cluster }
[JsonConverter(typeof(JsonStringEnumConverter<McpGroupKind>))]
public enum McpGroupKind { Superset, Circuit }
[JsonConverter(typeof(JsonStringEnumConverter<McpUnit>))]
public enum McpUnit { Scalar, Kg, Lb, Seconds, Minutes, Meters, Kilometers, Percent }
public sealed record McpQuantity(decimal Value, McpUnit Unit);
public sealed record McpIntRange(int Minimum, int Maximum);
public sealed record McpQuantityRange(McpQuantity Minimum, McpQuantity Maximum);
public sealed record McpFormulaUse(Guid? FormulaId, int Version, string? BuiltIn, Dictionary<string, McpQuantity> Inputs, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Expression = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, string>? VariableBindings = null);
public sealed record McpPrescription(McpIntRange? Reps = null, McpQuantityRange? Load = null, decimal? LoadPercent = null,
    McpQuantity? BaseValue = null, decimal? Rpe = null, decimal? Rir = null, McpQuantity? WorkTime = null,
    McpQuantity? Rest = null, string? Tempo = null, McpQuantity? Distance = null, string? Comment = null, McpFormulaUse? LoadFormula = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpUnit? LoadUnit = null);
public sealed record McpSetSegment(Guid Id, McpPrescription Prescription);
public sealed record McpTrainingSet(Guid Id, McpSetKind Kind, McpPrescription Prescription, McpSetSegment[]? Segments = null, Guid? SourceSetId = null);
public sealed record McpExerciseInstance(Guid Id, Guid ExerciseId, string Comment, McpTrainingSet[] Sets);
public sealed record McpExerciseGroup(Guid Id, McpGroupKind Kind, Guid[] ExerciseIds, int Rounds, decimal RestSeconds);
public sealed record McpWorkout(Guid Id, string Name, string Description, McpExerciseInstance[] Exercises, McpExerciseGroup[] Groups);
public sealed record McpTrainingDay(Guid Id, int DayNumber, McpWorkout[] Workouts, string? Note = null);
public sealed record McpCycle(Guid Id, string Name, string Description, int DayCount, McpTrainingDay[] Days);
public sealed record McpBlockMax(Guid? ExerciseId, int Reps, McpQuantity? Load = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpFormulaUse? LoadFormula = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpUnit? LoadUnit = null);
public sealed record McpMaxesTable(Guid Id, Guid? BlockId, McpBlockMax[] Rows);
public sealed record McpPlanAnnotation(Guid Id, string Kind, string Title, string Content, Guid? TargetId = null, string Visibility = "Coach");
public sealed record McpBlock(Guid Id, string Name, string Description, McpCycle[] Cycles, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpBlockMax[]? ExerciseMaxes = null);
public sealed record McpTrainingDocument(int SchemaVersion, McpBlock[] Blocks, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpMaxesTable[]? MaxesTables = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] McpPlanAnnotation[]? Annotations = null);
public sealed record McpProgramSummary(Guid Id, string Name, string Description, long Revision, DateTimeOffset UpdatedAt);
public sealed record McpProgramPage(McpProgramSummary[] Items, int Page, int PageSize, long Total);
public sealed record McpProgram(Guid Id, string Name, string Description, Guid? FolderId, long Revision, DateTimeOffset UpdatedAt,
    McpTrainingDocument Document, string EditorPath, McpProgramValidation? Validation = null, string[]? ChangedPaths = null);
public sealed record McpProgramDraft(string Name, string Description, Guid? FolderId, McpTrainingDocument Document);
public sealed record McpProgramRevision(Guid Id, int Number, long DraftRevision, DateTimeOffset PublishedAt,
    string Name, string Description, McpTrainingDocument Document);
public sealed record McpClientProgram(Guid AssignmentId, Guid ProgramId, string Name, Guid EffectiveRevisionId,
    DateOnly StartDate, string TimeZone, string Status, long Revision);
public sealed record McpClientProgramPage(McpClientProgram[] Items, int Page, int PageSize, long Total);
public sealed record McpValidationIssue(string Path, string Code, string Message);
public sealed record McpProgramValidation(bool Valid, McpValidationIssue[] Errors, McpValidationIssue[] Warnings);
public sealed record McpProgramProposal(Guid ProgramId, long ExpectedRevision, McpProgramDraft Draft,
    string[] ChangedPaths, McpProgramValidation Validation);
public sealed record McpSetChange(Guid SetId, McpTrainingSet Replacement);
public sealed record McpExerciseChange(Guid ExerciseInstanceId, Guid? ExerciseId = null, string? Comment = null,
    McpSetChange[]? SetChanges = null, Guid[]? SetOrder = null);
public sealed record McpWorkoutChange(Guid WorkoutId, string? Name = null, string? Description = null,
    McpExerciseChange[]? ExerciseChanges = null, Guid[]? ExerciseOrder = null);
public sealed record McpActualSet(Guid? PrescribedSetId, Guid? PrescribedSegmentId, bool Skipped, int? Reps, decimal? Load,
    string? LoadUnit, string LoadMeaning, decimal? Rpe, decimal? Rir, decimal? DurationSeconds, decimal? RestSeconds,
    decimal? DistanceMeters, string? Tempo, string? Comment);
public sealed record McpActualExercise(Guid ExerciseId, string Name, string Comment, McpActualSet[] Sets);
public sealed record McpWorkoutLog(Guid OccurrenceId, Guid RelationshipId, string ProgramName, DateOnly ScheduledDate, string Status,
    DateOnly? PerformedDate, DateTimeOffset? CompletedAt, string? Comment, McpActualExercise[] Exercises);
public sealed record McpWorkoutLogPage(McpWorkoutLog[] Items, int Page, int PageSize, long Total);

public interface IMcpTrainingOperations
{
    Task<McpProgramPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct);
    Task<McpProgram> GetAsync(Guid programId, CancellationToken ct);
    Task<McpProgramRevision> RevisionAsync(Guid programId, int number, CancellationToken ct);
    Task<McpClientProgramPage> ClientProgramsAsync(Guid relationshipId, int page, int pageSize, CancellationToken ct);
    Task<McpProgram> CreateAsync(McpProgramDraft draft, CancellationToken ct);
    Task<McpProgramProposal> ProposeAsync(Guid programId, long expectedRevision, McpWorkoutChange[] changes, CancellationToken ct);
    Task<McpProgram> ApplyDraftAsync(Guid programId, long expectedRevision, McpProgramDraft draft, CancellationToken ct);
    Task<McpProgramValidation> ValidateAsync(Guid? programId, McpTrainingDocument document, CancellationToken ct);
    Task<McpWorkoutLogPage> LogsAsync(Guid relationshipId, DateOnly from, DateOnly to, int page, int pageSize, CancellationToken ct);
    Task<TrainingProgressDto> ProgressAsync(Guid relationshipId, DateOnly from, DateOnly to, CancellationToken ct);
}
