namespace TrainFlow.Training.Contracts;

public interface IAnalysisWorkoutReferences
{
    Task RequireOwnedAsync(Guid userId, Guid executionId, Guid? setId, CancellationToken ct);
}
