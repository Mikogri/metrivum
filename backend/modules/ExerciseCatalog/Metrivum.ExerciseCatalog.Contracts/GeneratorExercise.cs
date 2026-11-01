namespace Metrivum.ExerciseCatalog.Contracts;

/// <summary>Versioned, conservative generator metadata; an empty AllOf branch needs no equipment.</summary>
public sealed record EquipmentBranch(string[] AllOf);
public sealed record GeneratorExercise(Guid Id, string Name, int CatalogVersion, string Family, string Role,
    string[] Muscles, EquipmentBranch[] EquipmentAnyOf, int MinimumLevel, string[] RequiredSkills,
    string Status, bool Reviewed, string PrescriptionMode, int SetupSeconds, string RepetitionCounting);

public sealed record GeneratorCatalog(string MetadataVersion, GeneratorExercise[] Exercises);
