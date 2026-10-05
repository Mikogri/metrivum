namespace TrainFlow.ExerciseCatalog.Features;

public sealed record CreateExerciseRequest(string Name, string Description = "", string Instructions = "",
    string? DemonstrationUrl = null, Guid[]? TagIds = null, string[]? PrimaryMuscleKeys = null,
    string[]? SecondaryMuscleKeys = null, string[]? MovementPatternKeys = null);
public sealed record UpdateExerciseRequest(int ExpectedVersion, string Description, string Instructions);
public sealed record ArchiveExerciseRequest(int ExpectedVersion);
public sealed record CreateTagRequest(string Name);
public sealed record MergeTagRequest(Guid TargetId);
public sealed record DictionaryRequest(int ExpectedVersion, string LabelEn, string LabelPl, bool IsActive = true);
public sealed record TagDto(Guid Id, string Name);
public sealed record DictionaryEntryDto(string Key, string LabelEn, string LabelPl, bool IsActive, int Version);
public sealed record DictionariesDto(IReadOnlyList<DictionaryEntryDto> Muscles, IReadOnlyList<DictionaryEntryDto> MovementPatterns);
public sealed record ExerciseDto(Guid Id, string Name, string Description, string Instructions, string? DemonstrationUrl,
    int Version, bool IsArchived, bool IsFavorite, bool IsAuthor, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    IReadOnlyList<TagDto> Tags, IReadOnlyList<string> PrimaryMuscleKeys, IReadOnlyList<string> SecondaryMuscleKeys,
    IReadOnlyList<string> MovementPatternKeys);
public sealed record ExerciseListItemDto(Guid Id, string Name, string Description, int Version, bool IsFavorite, DateTimeOffset CreatedAt);
public sealed record CatalogPage(IReadOnlyList<ExerciseListItemDto> Items, int Total, int Page, int PageSize);
public sealed record ExerciseRevisionDto(int Version, string Description, string Instructions, bool IsArchived, DateTimeOffset CreatedAt);

public sealed record CatalogQuery(string? Search = null, Guid? TagId = null, string? MuscleKey = null,
    string? MovementPatternKey = null, bool FavoritesOnly = false, string Sort = "name", int Page = 1, int PageSize = 25);
