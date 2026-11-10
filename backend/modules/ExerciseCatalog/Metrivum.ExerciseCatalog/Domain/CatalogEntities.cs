namespace Metrivum.ExerciseCatalog.Domain;

/// <summary>Represents persisted exercise state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class Exercise
{
    public Guid Id { get; set; }
    public Guid AuthorId { get; set; }
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string Description { get; set; } = "";
    public string Instructions { get; set; } = "";
    public string? DemonstrationUrl { get; set; }
    public int Version { get; set; } = 1;
    public bool IsArchived { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<ExerciseTag> Tags { get; set; } = [];
    public List<ExerciseMuscle> Muscles { get; set; } = [];
    public List<ExerciseMovementPattern> MovementPatterns { get; set; } = [];
}

/// <summary>Represents persisted exercise revision state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseRevision
{
    public Guid ExerciseId { get; set; }
    public int Version { get; set; }
    public string Description { get; set; } = "";
    public string Instructions { get; set; } = "";
    public bool IsArchived { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid ChangedBy { get; set; }
}

/// <summary>Represents persisted exercise tag definition state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseTagDefinition
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public Guid? MergedIntoId { get; set; }
}

/// <summary>Represents persisted exercise tag state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseTag
{
    public Guid ExerciseId { get; set; }
    public Guid TagId { get; set; }
    public ExerciseTagDefinition Tag { get; set; } = null!;
}

/// <summary>Represents persisted muscle state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class Muscle
{
    public string Key { get; set; } = "";
    public string LabelEn { get; set; } = "";
    public string LabelPl { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
}

/// <summary>Represents persisted movement pattern state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class MovementPattern
{
    public string Key { get; set; } = "";
    public string LabelEn { get; set; } = "";
    public string LabelPl { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
}

/// <summary>Represents persisted exercise muscle state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseMuscle
{
    public Guid ExerciseId { get; set; }
    public string MuscleKey { get; set; } = "";
    public bool IsPrimary { get; set; }
    public Muscle Muscle { get; set; } = null!;
}

/// <summary>Represents persisted exercise movement pattern state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseMovementPattern
{
    public Guid ExerciseId { get; set; }
    public string PatternKey { get; set; } = "";
    public MovementPattern Pattern { get; set; } = null!;
}

/// <summary>Represents persisted exercise favorite state in ExerciseCatalog; mapped and saved by the owning module's EF services.</summary>
public sealed class ExerciseFavorite
{
    public Guid UserId { get; set; }
    public Guid ExerciseId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
