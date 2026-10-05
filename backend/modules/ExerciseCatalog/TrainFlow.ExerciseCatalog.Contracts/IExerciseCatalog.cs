namespace TrainFlow.ExerciseCatalog.Contracts;

public sealed record ExerciseSnapshot(Guid Id, int Version, string Name, string Description, string Instructions);

public interface IExerciseCatalog
{
    Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(IEnumerable<string> names, CancellationToken cancellationToken);
}
