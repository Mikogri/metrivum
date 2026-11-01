using Microsoft.EntityFrameworkCore;
using Metrivum.ExerciseCatalog.Contracts;

namespace Metrivum.ExerciseCatalog.Features;

public sealed partial class CatalogService
{
    public async Task<GeneratorCatalog> GeneratorPoolAsync(CancellationToken cancellationToken)
    {
        await access.RequireAsync("exercises.browse", cancellationToken);
        var ids = ReviewedGeneratorCatalog.Exercises.Select(x => x.Id).ToArray();
        var available = await db.Exercises.AsNoTracking().Where(x => ids.Contains(x.Id) && !x.IsArchived)
            .Select(x => new { x.Id, x.Version, x.Name }).ToDictionaryAsync(x => x.Id, cancellationToken);
        // A catalog edit requires renewed metadata review; never silently reuse stale classification.
        return new(ReviewedGeneratorCatalog.Version, ReviewedGeneratorCatalog.Exercises.Where(x =>
            available.TryGetValue(x.Id, out var row) && row.Version == x.CatalogVersion && row.Name == x.Name).ToArray());
    }
}

/// <summary>Canonical IDs and descriptions verified against Metrivum development catalog on 2026-10-08.
/// Eligibility and setup estimates are deliberately narrow recipe assumptions, not clinical claims.</summary>
public static class ReviewedGeneratorCatalog
{
    public const string Version = "reviewed-baseline-2026-10-08.1";
    public static readonly GeneratorExercise[] Exercises =
    [
        E("1a20da52-97e2-5d8a-9cda-e9a08e008fa6", "Bodyweight Squat", "squat", "squat", ["quadriceps", "gluteus-maximus"], [[]]),
        E("203ae2fe-8340-5dae-91d7-88dc00f658d1", "Goblet Squat", "squat", "squat", ["quadriceps", "gluteus-maximus"], [["dumbbells"], ["kettlebell"]]),
        E("5850e3fa-d29d-5bda-9b0d-f9b2b08c8273", "Dumbbell Front Squat", "squat", "squat", ["quadriceps", "gluteus-maximus"], [["dumbbells"]], 1, ["front-rack"]),
        E("e05ea632-82ac-551e-98fc-427317b43668", "Barbell Back Squat", "squat", "squat", ["quadriceps", "gluteus-maximus"], [["barbell", "plates", "rack-safeties"]], 1, ["barbell-squat"]),
        E("9507eaba-3304-5f20-b68f-de17b35b9fb9", "Push-Up", "horizontal-press", "press", ["pectoralis-major", "triceps"], [[]], 0, ["push-up"]),
        E("11fb402e-dc6d-57ca-a4f5-43b8f2949262", "Dumbbell Floor Press", "horizontal-press", "press", ["pectoralis-major", "triceps"], [["dumbbells"]]),
        E("451874c7-8d87-58ef-9699-a5a49aaf85ee", "Barbell Bench Press", "horizontal-press", "press", ["pectoralis-major", "triceps"], [["barbell", "plates", "bench", "rack-safeties"]], 1, ["barbell-bench"]),
        E("710bceef-0344-5c0b-9e6c-4fb207e7a758", "Dumbbell Bent-Over Row", "horizontal-pull", "pull", ["latissimus-dorsi", "rhomboids", "trapezius"], [["dumbbells"]], 0, ["hip-hinge"]),
        E("d216deab-4992-5527-acf1-2751fb28beab", "Chest-Supported Dumbbell Row", "horizontal-pull", "pull", ["latissimus-dorsi", "rhomboids", "trapezius"], [["dumbbells", "incline-bench"]]),
        E("1be597a5-c894-5446-a653-0be594c4923c", "Glute Bridge", "hip-extension", "hinge", ["gluteus-maximus"], [[]]),
        E("90bb9c3c-318c-58fb-af89-57753c4532a5", "Dumbbell Romanian Deadlift", "hip-extension", "hinge", ["gluteus-maximus", "hamstrings"], [["dumbbells"]], 0, ["hip-hinge"]),
        E("0e78cee8-0685-531f-8a54-5313fd6ef631", "Dead Bug", "trunk-control", "core", ["rectus-abdominis", "transversus-abdominis", "obliques"], [[]], counting: "per-side"),
        E("a38f23ac-cc6f-53ff-9644-eee89de37020", "Bird Dog", "trunk-control", "core", ["multifidus", "erector-spinae", "gluteus-maximus"], [[]], counting: "per-side"),
        E("f14dee04-891a-5b53-b438-38ff31118b8a", "Walking", "walking", "cardio", ["quadriceps", "gluteus-maximus"], [["clear-walking-route"]], mode: "time"),
        E("1d71ec50-2c89-5073-9ded-f3adb7193ae7", "Stationary Bike", "cycling", "cardio", ["quadriceps", "gluteus-maximus"], [["stationary-bike"]], mode: "time"),
        E("7c67bcd4-f420-5e6d-8c3b-9f30bf485932", "Air Bike", "cycling", "cardio", ["quadriceps", "gluteus-maximus", "deltoids", "pectoralis-major", "latissimus-dorsi"], [["air-bike"]], mode: "time"),
        E("d45c5ded-9454-505b-acbc-10e904b05ce5", "Snatch", "olympic-lift", "squat", ["quadriceps", "gluteus-maximus", "trapezius", "deltoids"], [["barbell", "plates"]], 2, ["olympic-lifting"], status: "manual-only")
    ];

    private static GeneratorExercise E(string id, string name, string family, string role, string[] muscles,
        string[][] equipment, int level = 0, string[]? skills = null, string mode = "reps", string counting = "total", string? status = null)
        => new(Guid.Parse(id), name, 1, family, role, muscles, equipment.Select(x => new EquipmentBranch(x)).ToArray(),
            level, skills ?? [], status ?? (skills?.Length > 0 ? "skill-gated" : "candidate"), true, mode,
            equipment.Any(x => x.Contains("barbell")) ? 180 : equipment.All(x => x.Length == 0) ? 30 : 90, counting);
}
