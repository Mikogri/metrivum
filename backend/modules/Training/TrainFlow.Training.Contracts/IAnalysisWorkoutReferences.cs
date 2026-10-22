namespace TrainFlow.Training.Contracts;

/// <summary>What an analysis is linked to: a logged workout of a client and, optionally, one set in it.</summary>
public sealed record AnalysisSetReference(Guid ExecutionId, Guid? SetId, Guid RelationshipId, Guid ClientId, string ClientName,
    DateOnly PerformedDate, string WorkoutName, string? ExerciseName, int? SetNumber, int? Reps, decimal? Load, string? LoadUnit);

public interface IAnalysisWorkoutReferences
{
    Task RequireOwnedAsync(Guid userId, Guid executionId, Guid? setId, CancellationToken ct);

    /// <summary>
    /// The signed-in coach of that client's assignment (or the client) may link an analysis to the workout; throws 404/403 otherwise.
    /// </summary>
    Task<AnalysisSetReference> RequireLinkableAsync(Guid executionId, Guid? setId, CancellationToken ct);

    /// <summary>The link as the signed-in user may see it, or null when it is gone or no longer visible to them.</summary>
    Task<AnalysisSetReference?> DescribeAsync(Guid executionId, Guid? setId, CancellationToken ct);

    /// <summary>The signed-in client's own logged workouts whose history they may still read (newest first), or just the one given.</summary>
    Task<Guid[]> ClientExecutionsAsync(Guid? executionId, CancellationToken ct);
}
