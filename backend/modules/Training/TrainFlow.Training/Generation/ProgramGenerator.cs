using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using TrainFlow.ExerciseCatalog.Contracts;
using TrainFlow.Training.Domain;

namespace TrainFlow.Training.Generation;

/// <summary>Pure deterministic recipe pipeline. No database writes, inferred max loads, or medical rules.</summary>
public static class ProgramGenerator
{
    public const string RecipeVersion = "baseline-recipes-1";
    private static readonly string[] Assumptions =
    [
        "Review this conservative baseline before publishing. Loads are intentionally unfilled; choose them in the builder.",
        "Time is an estimate: 5 minutes general warm-up, 1 minute specific warm-up per resistance exercise, 4 seconds per repetition, full prescribed rest, equipment setup and 3 minutes buffer.",
        "Repeated cycles retain exercise choices. Optional progression adds at most two repetitions over the block, without automatic load increases.",
        "Mixed uses controlled sequential sets and a time-capped conditioning finish; EMOM and AMRAP circuits are not simulated."
    ];

    public static string DatasetVersion(GeneratorCatalog catalog) => Hash(catalog.MetadataVersion + "|" +
        string.Join("|", catalog.Exercises.OrderBy(x => x.Id).Select(x => $"{x.Id}:{x.CatalogVersion}")));

    public static GenerationPreview Preview(GenerationRequest request, GeneratorCatalog catalog)
    {
        var invalid = ValidateInput(request);
        if (invalid != null)
            return Failure(invalid);
        request = request with
        {
            DaySlots = request.DaySlots.Order().ToArray()
        };
        GenerationPreview? minimum = null;
        // Optional accessory is removed before reducing work sets; rests remain intact.
        foreach (var variant in new[] { (Sets: 3, Accessory: true), (Sets: 3, Accessory: false), (Sets: 2, Accessory: false) })
        {
            var state = new GenerationState(request, RecipeVersion, catalog.MetadataVersion, DatasetVersion(catalog), request.Seed,
                request.Mode == GenerationMode.Cardio ? 1 : variant.Sets, variant.Accessory,
                request.Mode == GenerationMode.Cardio ? Math.Clamp((request.SessionMinutes - 12) * 60, 600, 1800) : 600, new(), []);
            var result = Build(state, catalog, chooseMissing: true);
            if (result.Feasible || result.Issues.Any(x => x.Code != "TIME_BUDGET" && !x.Target.EndsWith("/core", StringComparison.Ordinal)))
                return result;
            minimum = result;
        }
        if (minimum?.State != null)
        {
            var alternative = FitFasterAlternatives(minimum, catalog);
            if (alternative.Feasible)
                return alternative;
        }
        return Failure(new("TIME_BUDGET", "sessionMinutes", "The minimum recipe cannot fit this time budget with full warm-up, rest and transitions. Increase the time budget or choose another mode."));
    }

    private static GenerationPreview FitFasterAlternatives(GenerationPreview current, GeneratorCatalog catalog)
    {
        // Roles have distinct families in the reviewed recipes. Each pass can only reduce estimated
        // duration and checks the full document, so the search is bounded by slots × eligible records.
        foreach (var slot in current.Slots.Where(x => !current.State!.LockedSlots.Contains(x.Key)))
        {
            foreach (var candidate in Rank(Eligible(current.State!.Input, catalog, slot.Role), current.State.Input, current.State.SelectionSeed, slot.Key))
            {
                if (candidate.Id == current.State.Selections[slot.Key])
                    continue;
                var selections = new Dictionary<string, Guid>(current.State.Selections) { [slot.Key] = candidate.Id };
                var trial = Build(current.State with
                {
                    Selections = selections
                }, catalog, false);
                if (trial.Feasible)
                    return trial;
                if (trial.State != null && trial.Issues.All(x => x.Code == "TIME_BUDGET")
                    && trial.Durations.Sum(x => x.TotalSeconds) < current.Durations.Sum(x => x.TotalSeconds))
                    current = trial;
            }
        }
        return current;
    }

    public static GenerationPreview Restore(GenerationState state, GeneratorCatalog catalog) => Build(state, catalog, false);

    public static GenerationPreview Reshuffle(GenerationEditRequest request, GeneratorCatalog catalog)
    {
        var current = Restore(request.State, catalog);
        if (!current.Feasible)
            return current;
        var state = current.State!;
        var selections = new Dictionary<string, Guid>(state.Selections);
        foreach (var slot in current.Slots.Where(x => !state.LockedSlots.Contains(x.Key)))
        {
            var options = Eligible(state.Input, catalog, slot.Role).Where(x => x.Id != slot.ExerciseId).ToArray();
            foreach (var candidate in Rank(options, state.Input, request.Seed, slot.Key))
            {
                var trial = new Dictionary<string, Guid>(selections) { [slot.Key] = candidate.Id };
                if (!Build(state with
                {
                    SelectionSeed = request.Seed,
                    Selections = trial
                }, catalog, false).Feasible)
                    continue;
                selections = trial;
                break;
            }
        }
        return Build(state with
        {
            SelectionSeed = request.Seed,
            Selections = selections
        }, catalog, false);
    }

    public static GenerationPreview Replace(GenerationReplaceRequest request, GeneratorCatalog catalog)
    {
        var current = Restore(request.State, catalog);
        if (!current.Feasible)
            return current;
        var state = current.State!;
        var slot = current.Slots.SingleOrDefault(x => x.Key == request.Slot);
        if (slot == null)
            return Failure(new("UNKNOWN_SLOT", "slot", "The requested slot is unavailable."));
        if (state.LockedSlots.Contains(slot.Key))
            return Failure(new("LOCKED_SLOT", slot.Key, "Unlock this exercise before replacing it."));
        var options = Eligible(state.Input, catalog, slot.Role).Where(x => x.Id != slot.ExerciseId && (request.ExerciseId == null || x.Id == request.ExerciseId)).ToArray();
        if (options.Length == 0)
            return Failure(new("NO_ALTERNATIVE", slot.Key, "No different reviewed exercise satisfies this slot's equipment, exclusion and skill constraints."));
        GenerationPreview? rejected = null;
        foreach (var candidate in Rank(options, state.Input, request.Seed, slot.Key))
        {
            var selections = new Dictionary<string, Guid>(state.Selections) { [slot.Key] = candidate.Id };
            var result = Build(state with
            {
                SelectionSeed = request.Seed,
                Selections = selections
            }, catalog, false);
            if (result.Feasible)
                return result;
            rejected = result;
        }
        return rejected!;
    }

    public static GeneratorExercise[] Eligible(GenerationRequest request, GeneratorCatalog catalog, string role) => catalog.Exercises
        .Where(x => x.Reviewed && x.Status is "candidate" or "skill-gated" && x.MinimumLevel <= (int)request.Level && x.Role == role
            && !request.ExcludedExercises.Contains(x.Id) && x.RequiredSkills.All(request.Skills.Contains)
            && x.EquipmentAnyOf.Any(branch => branch.AllOf.All(request.Equipment.Contains)))
        .OrderBy(x => x.Id).ToArray();

    private static GenerationPreview Build(GenerationState state, GeneratorCatalog catalog, bool chooseMissing)
    {
        if (state == null)
            return Failure(new("INVALID_INPUT", "state", "Generation state is required."));
        var invalid = ValidateInput(state.Input);
        if (invalid != null)
            return Failure(invalid);
        if (state.RecipeVersion != RecipeVersion || state.MetadataVersion != catalog.MetadataVersion || state.DatasetVersion != DatasetVersion(catalog))
            return Failure(new("DATASET_CHANGED", "state", "The reviewed exercise dataset or recipe changed. Regenerate a preview before saving."));
        if (state.Selections == null || state.LockedSlots == null || state.Selections.Count > 42 || state.LockedSlots.Length > 42
            || state.SetsPerExercise is < 1 or > 3 || state.CardioSeconds is < 600 or > 1800
            || (state.Input.Mode == GenerationMode.Cardio ? state.SetsPerExercise != 1 : state.SetsPerExercise < 2)
            || state.Input.Mode != GenerationMode.Cardio && state.CardioSeconds != 600)
            return Failure(new("INVALID_STATE", "state", "Invalid recipe structure."));
        var roles = Roles(state.Input.Mode, state.IncludeAccessory);
        var selections = new Dictionary<string, Guid>();
        var slots = new List<GenerationSlot>();
        var chosen = new Dictionary<string, GeneratorExercise>();
        for (var session = 0; session < state.Input.DaySlots.Length; session++)
        {
            var families = new HashSet<string>();
            foreach (var role in roles)
            {
                var key = $"session-{session + 1}/{role}";
                var eligible = Eligible(state.Input, catalog, role).Where(x => !families.Contains(x.Family)).ToArray();
                GeneratorExercise? exercise;
                if (state.Selections.TryGetValue(key, out var selected))
                    exercise = eligible.SingleOrDefault(x => x.Id == selected);
                else
                    exercise = chooseMissing && eligible.Length > 0 ? Choose(eligible, state.Input, state.SelectionSeed, key) : null;
                if (exercise == null)
                    return Failure(new("NO_ELIGIBLE_EXERCISE", key, $"No eligible {role} exercise. Check equipment, exclusions, skills and reviewed metadata."));
                chosen.Add(key, exercise);
                selections.Add(key, exercise.Id);
                families.Add(exercise.Family);
                var equipment = exercise.EquipmentAnyOf.First(x => x.AllOf.All(state.Input.Equipment.Contains)).AllOf;
                var prescription = PrescriptionFor(state, exercise, state.Input.Cycles - 1);
                var label = prescription.WorkTime is { } time ? $"{time.Value / 60:0.#} min, RPE {prescription.Rpe}" :
                    $"{state.SetsPerExercise} × {prescription.Reps!.Minimum}–{prescription.Reps.Maximum}, RIR {prescription.Rir}, rest {prescription.Rest!.Value}s";
                slots.Add(new(key, role, exercise.Id, exercise.Name, exercise.Family, exercise.Muscles, equipment,
                    state.LockedSlots.Contains(key), label, exercise.RepetitionCounting));
            }
        }
        if (state.Selections.Keys.Except(selections.Keys).Any() || state.LockedSlots.Except(selections.Keys).Any()
            || state.LockedSlots.Distinct().Count() != state.LockedSlots.Length)
            return Failure(new("UNKNOWN_SLOT", "state", "Selection or lock references an unknown slot."));
        state = state with
        {
            Selections = selections
        };
        var durations = new List<GenerationDuration>();
        var cycles = Enumerable.Range(0, state.Input.Cycles).Select(cycle =>
        {
            var days = state.Input.DaySlots.Select((day, session) =>
            {
                var path = $"cycle-{cycle}/day-{day}";
                var work = 0;
                var rest = 0;
                var setup = 0;
                var specific = 0;
                var exercises = roles.Select(role =>
                {
                    var exercise = chosen[$"session-{session + 1}/{role}"];
                    var p = PrescriptionFor(state, exercise, cycle);
                    var sets = exercise.PrescriptionMode == "time" ? 1 : state.SetsPerExercise;
                    work += p.WorkTime != null ? (int)p.WorkTime.In(Unit.Seconds) : sets * p.Reps!.Maximum * 4 * (exercise.RepetitionCounting == "per-side" ? 2 : 1);
                    rest += (sets - 1) * (int)(p.Rest?.In(Unit.Seconds) ?? 0);
                    setup += exercise.SetupSeconds;
                    specific += exercise.PrescriptionMode == "time" ? 0 : 60;
                    return new ExerciseInstance(Id(state.Input.Seed, path + "/" + role), exercise.Id,
                        $"Generator role: {role}. Repetition counting: {exercise.RepetitionCounting}. Review working load in the editor.",
                        Enumerable.Range(0, sets).Select(set => new TrainingSet(Id(state.Input.Seed, path + "/" + role + "/set-" + set), SetKind.Standard, p)).ToArray());
                }).ToArray();
                if (cycle == state.Input.Cycles - 1)
                    durations.Add(new(day, 300, specific, work, rest, setup, 180, 480 + specific + work + rest + setup));
                var workout = new Workout(Id(state.Input.Seed, path + "/workout"), $"{state.Input.Mode} {session + 1}",
                    "Begin with 5 minutes easy general warm-up and 1 minute movement-specific preparation per resistance exercise. Keep the prescribed rest. Time includes setup and a 3-minute buffer.", exercises, []);
                return new TrainingDay(Id(state.Input.Seed, path), day, [workout]);
            }).ToArray();
            return new Cycle(Id(state.Input.Seed, "cycle-" + cycle), $"Cycle {cycle + 1}", "Repeat the selected exercises with controlled technique.", state.Input.CycleDays, days);
        }).ToArray();
        var document = new TrainingDocument(1, [new Block(Id(state.Input.Seed, "block"), state.Input.Mode + " baseline", "Review before publishing.", cycles)]);
        DocumentRules.Validate(document, new());
        var issues = durations.Where(x => x.TotalSeconds > state.Input.SessionMinutes * 60)
            .Select(x => new GenerationIssue("TIME_BUDGET", $"day-{x.DayNumber}", $"Estimated {Math.Ceiling(x.TotalSeconds / 60m)} minutes exceeds the {state.Input.SessionMinutes}-minute budget; increase time or regenerate the structure.")).ToArray();
        return new(issues.Length == 0, state, document, slots.ToArray(), durations.ToArray(), issues, Assumptions);
    }

    private static string[] Roles(GenerationMode mode, bool accessory) => mode switch
    {
        GenerationMode.Cardio => ["cardio"],
        GenerationMode.Mixed => accessory ? ["squat", "press", "core", "cardio"] : ["squat", "press", "cardio"],
        _ => accessory ? ["squat", "press", "pull", "hinge", "core"] : ["squat", "press", "pull", "hinge"]
    };

    private static Prescription PrescriptionFor(GenerationState state, GeneratorExercise exercise, int cycle)
    {
        if (exercise.PrescriptionMode == "time")
            return new(WorkTime: new(state.CardioSeconds, Unit.Seconds), Rpe: 5, Comment: "Comfortable, controlled conditioning pace. Duration is a cap, not an all-out effort.");
        var reps = state.Input.Mode == GenerationMode.Strength && exercise.Role is "squat" or "press" or "pull" ? 5 : 8;
        var progression = state.Input.ProgressRepetitions ? Math.Min(cycle, 2) : 0;
        return new(Reps: new(reps + progression, reps + progression + 2), Rir: 3,
            Rest: new(state.Input.Mode == GenerationMode.Strength ? 150 : 90, Unit.Seconds),
            Comment: exercise.RepetitionCounting == "per-side" ? "Repetitions per side; perform both sides." : "Choose a working load that preserves the prescribed repetitions in reserve.");
    }

    private static GeneratorExercise Choose(GeneratorExercise[] pool, GenerationRequest request, int seed, string slot) => Rank(pool, request, seed, slot).First();
    private static IOrderedEnumerable<GeneratorExercise> Rank(GeneratorExercise[] pool, GenerationRequest request, int seed, string slot) => pool
        .OrderBy(x => Score(seed, slot, x.Id) / (1 + (x.Muscles.Intersect(request.PriorityMuscles).Any() ? 1 : 0) + (request.PreferredFamilies.Contains(x.Family) ? 1 : 0)))
        .ThenBy(x => x.Id);
    private static decimal Score(int seed, string slot, Guid exercise) => BinaryPrimitives.ReadUInt64BigEndian(SHA256.HashData(Encoding.UTF8.GetBytes($"{seed}:{slot}:{exercise}")));
    private static Guid Id(int seed, string path) => new(SHA256.HashData(Encoding.UTF8.GetBytes($"{RecipeVersion}:{seed}:{path}")).AsSpan(0, 16));
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    private static GenerationIssue? ValidateInput(GenerationRequest request)
    {
        if (request == null || !Enum.IsDefined(request.Mode) || !Enum.IsDefined(request.Level) || request.SessionMinutes is < 10 or > 180
            || request.CycleDays is < 1 or > 28 || request.Cycles is < 1 or > 12 || request.DaySlots == null || request.DaySlots.Length is < 1 or > 7
            || request.DaySlots.Any(x => x < 1 || x > request.CycleDays) || request.DaySlots.Distinct().Count() != request.DaySlots.Length
            || request.Equipment == null || request.Skills == null || request.ExcludedExercises == null || request.PriorityMuscles == null || request.PreferredFamilies == null
            || request.Equipment.Length > 50 || request.Skills.Length > 30 || request.ExcludedExercises.Length > 1000 || request.PriorityMuscles.Length > 3 || request.PreferredFamilies.Length > 10
            || request.Equipment.Concat(request.Skills).Concat(request.PriorityMuscles).Concat(request.PreferredFamilies).Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 80))
            return new("INVALID_INPUT", "input", "Use 10–180 minutes, 1–28 cycle days, 1–7 distinct workout days, 1–12 cycles, and at most 3 priority muscles. All constraint arrays are required.");
        return null;
    }
    private static GenerationPreview Failure(GenerationIssue issue) => new(false, null, null, [], [], [issue], Assumptions);
}
