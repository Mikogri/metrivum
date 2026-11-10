namespace Metrivum.ExerciseCatalog.Contracts;

public sealed record McpExerciseSummary(
    Guid Id,
    string Name,
    string Description,
    int Version,
    string[] PrimaryMuscleKeys
);

public sealed record McpExercisePage(
    McpExerciseSummary[] Items,
    int Page,
    int PageSize,
    long Total
);

public sealed record McpExercise(
    Guid Id,
    string Name,
    string Description,
    string Instructions,
    int Version,
    string[] PrimaryMuscleKeys,
    string[] SecondaryMuscleKeys,
    string[] MovementPatternKeys,
    GeneratorExercise? GeneratorMetadata
);

public interface IMcpExerciseOperations
{
    Task<McpExercisePage> SearchAsync(
        string? search,
        string? muscleKey,
        string? movementPatternKey,
        bool favoritesOnly,
        int page,
        int pageSize,
        CancellationToken ct,
        Guid? tagId = null,
        string[]? availableEquipment = null
    );
    Task<McpExercise> GetAsync(Guid exerciseId, CancellationToken ct);
}
