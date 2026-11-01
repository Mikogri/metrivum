using System.Text.Json.Serialization;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.Training.Domain;

namespace Metrivum.Training.Generation;

[JsonConverter(typeof(JsonStringEnumConverter<GenerationMode>))]
public enum GenerationMode
{
    Strength, Hypertrophy, Cardio, Mixed
}
[JsonConverter(typeof(JsonStringEnumConverter<GenerationLevel>))]
public enum GenerationLevel
{
    Beginner, Intermediate, Advanced
}

public sealed record GenerationRequest(GenerationMode Mode, GenerationLevel Level, int SessionMinutes, int CycleDays,
    int[] DaySlots, int Cycles, int Seed, string[] Equipment, string[] Skills, Guid[] ExcludedExercises,
    string[] PriorityMuscles, string[] PreferredFamilies, bool ProgressRepetitions = false, Guid? TeamId = null);
public sealed record GenerationState(GenerationRequest Input, string RecipeVersion, string MetadataVersion,
    string DatasetVersion, int SelectionSeed, int SetsPerExercise, bool IncludeAccessory, int CardioSeconds,
    Dictionary<string, Guid> Selections, string[] LockedSlots);
public sealed record GenerationIssue(string Code, string Target, string Message);
public sealed record GenerationSlot(string Key, string Role, Guid ExerciseId, string Name, string Family,
    string[] Muscles, string[] Equipment, bool Locked, string Prescription, string RepetitionCounting);
public sealed record GenerationDuration(int DayNumber, int GeneralWarmupSeconds, int SpecificWarmupSeconds,
    int WorkSeconds, int RestSeconds, int SetupSeconds, int BufferSeconds, int TotalSeconds);
public sealed record GenerationPreview(bool Feasible, GenerationState? State, TrainingDocument? Document,
    GenerationSlot[] Slots, GenerationDuration[] Durations, GenerationIssue[] Issues, string[] Assumptions);
public sealed record GenerationEditRequest(GenerationState State, int Seed);
public sealed record GenerationReplaceRequest(GenerationState State, string Slot, Guid? ExerciseId, int Seed);
public sealed record SaveGeneratedDraftRequest(string Name, string Description, Guid? FolderId, GenerationState State);
public sealed record GenerationOptions(string RecipeVersion, string MetadataVersion, string DatasetVersion,
    string[] Equipment, string[] Skills, string[] Muscles, string[] Families, GeneratorExercise[] Exercises);
