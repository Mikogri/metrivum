using TrainFlow.ExerciseCatalog.Contracts;

namespace TrainFlow.ExerciseCatalog.Features;

public sealed class McpExerciseOperations(CatalogService catalog) : IMcpExerciseOperations
{
    public async Task<McpExercisePage> SearchAsync(string? search, string? muscleKey, string? movementPatternKey, bool favoritesOnly, int page, int pageSize, CancellationToken ct,
        Guid? tagId = null, string[]? availableEquipment = null)
    {
        var result = await catalog.ListForMcpAsync(new(Search: search, TagId: tagId, MuscleKey: muscleKey, MovementPatternKey: movementPatternKey, FavoritesOnly: favoritesOnly, Page: page, PageSize: pageSize), availableEquipment, ct);
        return new(result.Items.Select(x => new McpExerciseSummary(x.Id, x.Name, x.Description, x.Version, x.PrimaryMuscleKeys)).ToArray(), page, pageSize, result.Total);
    }
    public async Task<McpExercise> GetAsync(Guid exerciseId, CancellationToken ct)
    {
        var result = await catalog.GetAsync(exerciseId, ct);
        var metadata = (await catalog.GeneratorPoolAsync(ct)).Exercises.SingleOrDefault(x => x.Id == exerciseId);
        return new(result.Id, result.Name, result.Description, result.Instructions, result.Version, result.PrimaryMuscleKeys.ToArray(), result.SecondaryMuscleKeys.ToArray(), result.MovementPatternKeys.ToArray(), metadata);
    }
}
