namespace TrainFlow.Training.Contracts;

public sealed record TrainingProgressQuery(DateOnly From, DateOnly To, Guid? RelationshipId = null, Guid? ProgramId = null, Guid? ExerciseId = null, Guid? GroupId = null, IReadOnlyCollection<Guid>? RelationshipIds = null, string? View = null, Guid? TeamId = null, Guid? MemberId = null);
public sealed record TrainingProgramProgress(Guid ProgramId, string ProgramName, int Completed);
public sealed record TrainingClientProgress(Guid RelationshipId, int Due, int Completed, int Missed, DateTimeOffset? LatestCompletedAt);
public sealed record TrainingPerformancePoint(Guid ExerciseId, string Name, DateOnly PerformedDate, string LoadMeaning, int Sets, int Reps,
    decimal? VolumeKg, decimal? BestLoadKg, decimal? AverageRpe, decimal? AverageRir, int SubstitutionSets);
public sealed record TrainingProgressDto(DateOnly From, DateOnly To, int Planned, int Due, int Completed, int Skipped, int Missed, int InProgress,
    decimal? CompletionPercentage, int LoggedLate, int ActiveAssignments, int ActualSets, int ActualReps, decimal? VolumeKg,
    TrainingProgramProgress[] Programs, TrainingClientProgress[] Clients, TrainingPerformancePoint[] Performance, string MetricDefinition);
public interface ITrainingProgressReader
{
    Task<TrainingProgressDto> ReadAsync(TrainingProgressQuery query, CancellationToken cancellationToken);
}
