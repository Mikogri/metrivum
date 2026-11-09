using System.Text.Json;
using System.Text.Json.Serialization;

namespace Metrivum.Training.Domain;

[JsonConverter(typeof(JsonStringEnumConverter<SetKind>))]
public enum SetKind
{
    Standard, Amrap, Ramp, TopSet, BackOff, DropSet, RestPause, Cluster, Warmup
}
[JsonConverter(typeof(JsonStringEnumConverter<GroupKind>))]
public enum GroupKind
{
    Superset, Circuit
}
[JsonConverter(typeof(JsonStringEnumConverter<DocumentKind>))]
public enum DocumentKind
{
    Program, Template
}

public sealed record IntRange(int Minimum, int Maximum);
public sealed record QuantityRange(Quantity Minimum, Quantity Maximum);
public sealed record FormulaUse(Guid? FormulaId, int Version, string? BuiltIn, Dictionary<string, Quantity> Inputs, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Expression = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, string>? VariableBindings = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Unit? OutputUnit = null);
public sealed record FormulaEvaluation(string Expression, int Version, Dictionary<string, Quantity> Inputs, Quantity Result, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, string>? SourceVersions = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, Quantity>? FieldValues = null);
public sealed record Prescription(IntRange? Reps = null, QuantityRange? Load = null, decimal? LoadPercent = null, Quantity? BaseValue = null,
    decimal? Rpe = null, decimal? Rir = null, Quantity? WorkTime = null, Quantity? Rest = null, string? Tempo = null,
    Quantity? Distance = null, string? Comment = null, FormulaUse? LoadFormula = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Unit? LoadUnit = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, FormulaUse>? FieldFormulas = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? WorkTimeMax = null);
public sealed record SetSegment(Guid Id, Prescription Prescription);
public sealed record TrainingSet(Guid Id, SetKind Kind, Prescription Prescription, SetSegment[]? Segments = null, Guid? SourceSetId = null);
public sealed record ExerciseInstance(Guid Id, Guid ExerciseId, string Comment, TrainingSet[] Sets);
public sealed record ExerciseGroup(Guid Id, GroupKind Kind, Guid[] ExerciseIds, int Rounds, decimal RestSeconds);
public sealed record Workout(Guid Id, string Name, string Description, ExerciseInstance[] Exercises, ExerciseGroup[] Groups);
/// <summary>A day of a cycle. <c>Note</c> is free text for the day, e.g. what to do on a rest day.</summary>
public sealed record TrainingDay(Guid Id, int DayNumber, Workout[] Workouts, string? Note = null);
/// <summary>
/// A cycle of days. <c>Repeats</c> is how many times it runs in a row; left empty it runs once, or, when it is the
/// plan's only cycle, until the coach stops the plan. An <c>Implicit</c> cycle only holds a workout that is not in
/// any cycle: it has no name of its own and the editor shows just the workout.
/// </summary>
public sealed record Cycle(Guid Id, string Name, string Description, int DayCount, TrainingDay[] Days,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Repeats = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Implicit = null);
public sealed record BlockExerciseMax(Guid? ExerciseId, int Reps, Quantity? Load = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] FormulaUse? LoadFormula = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Unit? LoadUnit = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Quantity? Time = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] FormulaUse? TimeFormula = null);
/// <summary>
/// A block of the plan. An <c>Inactive</c> block stays in the draft but is left out when changes are applied. An
/// <c>Implicit</c> block only holds a cycle (or a lone workout) that is not in any block, so a plan does not need
/// blocks at all: it has no name of its own and the editor does not show it.
/// </summary>
public sealed record Block(Guid Id, string Name, string Description, Cycle[] Cycles,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] BlockExerciseMax[]? ExerciseMaxes = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Inactive = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Implicit = null);
public sealed record ExerciseMaxesTable(Guid Id, Guid? BlockId, BlockExerciseMax[] Rows);
[JsonConverter(typeof(JsonStringEnumConverter<AnnotationKind>))]
public enum AnnotationKind
{
    Comment, Goal
}
[JsonConverter(typeof(JsonStringEnumConverter<AnnotationVisibility>))]
public enum AnnotationVisibility
{
    Coach, Client
}
public sealed record PlanAnnotation(Guid Id, AnnotationKind Kind, string Title, string Content, Guid? TargetId = null, AnnotationVisibility Visibility = AnnotationVisibility.Coach);
public sealed record TrainingDocument(int SchemaVersion, Block[] Blocks,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ExerciseMaxesTable[]? MaxesTables = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PlanAnnotation[]? Annotations = null);

/// <summary>Contains the configured document settings and bounds for Training; does not itself access the database.</summary>
public sealed class DocumentLimits
{
    public int MaximumBytes { get; set; } = 1_048_576;
    public int MaximumNodes { get; set; } = 10000;
    public int MaximumCycleDays { get; set; } = 366;
    public int MaximumSegments { get; set; } = 20;
}

/// <summary>Serializes and deserializes versioned training documents with the shared strict JSON rules.</summary>
public static class TrainingJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow, MaxDepth = 48 };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T Deserialize<T>(string value) => JsonSerializer.Deserialize<T>(value, Options) ?? throw new TrainingValidationException("Empty JSON document.");
}

/// <summary>Validates training document structure and builds client-safe or active-only projections without database access.</summary>
public static class DocumentRules
{
    public const int MaximumRepetitions = 999;

    // Privacy is enforced before content leaves the owning API, including purchased copies.
    public static TrainingDocument ForClient(TrainingDocument document) => document with { Annotations = document.Annotations?.Where(n => n.Visibility == AnnotationVisibility.Client).ToArray() };

    public static PlanAnnotation[] AnnotationsFor(TrainingDocument document, Guid blockId, Guid cycleId) => (document.Annotations ?? []).Where(n => n.TargetId == null || n.TargetId == blockId || n.TargetId == cycleId).ToArray();

    public const int MaximumRepeats = 100;
    /// <summary>An open-ended plan is scheduled about this far ahead; applying changes again schedules the next stretch.</summary>
    public const int OpenEndedDays = 364;

    /// <summary>
    /// How many times a cycle runs: its <c>Repeats</c>, or once when left empty. The plan's only cycle left empty runs
    /// until stopped, scheduled <see cref="OpenEndedDays"/> ahead.
    /// </summary>
    public static int RunsOf(TrainingDocument document, Cycle cycle)
    {
        if (cycle.Repeats is { } repeats)
            return repeats;
        // A lone workout's holder cycle runs once and does not count: adding one never ends an open plan.
        var only = cycle.Implicit != true && document.Blocks.Sum(b => b.Cycles.Count(c => c.Implicit != true)) == 1;

        return only ? Math.Max(1, (int)Math.Ceiling(OpenEndedDays / (double)Math.Max(1, cycle.DayCount))) : 1;
    }

    /// <summary>
    /// What clients get: the plan without its inactive blocks, and without the notes and maxes tables tied to them.
    /// </summary>
    public static TrainingDocument ActiveOnly(TrainingDocument document)
    {
        if (!document.Blocks.Any(b => b.Inactive == true))
            return document;
        var removed = document.Blocks.Where(b => b.Inactive == true).SelectMany(b => new[] { b.Id }.Concat(b.Cycles.Select(c => c.Id))).ToHashSet();

        return document with
        {
            Blocks = document.Blocks.Where(b => b.Inactive != true).ToArray(),
            Annotations = document.Annotations?.Where(n => n.TargetId is not { } target || !removed.Contains(target)).ToArray(),
            MaxesTables = document.MaxesTables?.Where(t => t.BlockId is not { } block || !removed.Contains(block)).ToArray(),
        };
    }

    public static IEnumerable<Workout> Workouts(TrainingDocument document) => document.Blocks.SelectMany(b => b.Cycles).SelectMany(c => c.Days).SelectMany(d => d.Workouts);

    public static IEnumerable<TrainingSet> Sets(TrainingDocument document) => Workouts(document).SelectMany(w => w.Exercises).SelectMany(e => e.Sets);

    public static bool IsAdvancedSet(SetKind kind) => kind is not (SetKind.Standard or SetKind.Warmup or SetKind.BackOff or SetKind.Amrap);

    public static bool HasAdvanced(TrainingDocument document) => Workouts(document).Any(w => w.Groups.Any(g => g.Kind != GroupKind.Superset)) || Sets(document).Any(s => IsAdvancedSet(s.Kind));

    public static bool HasCustomFormulas(TrainingDocument document) => Prescriptions(document).Any(p => PrescriptionFormulas.Uses(p).Any(f => f.FormulaId != null || f.Expression != null || f.VariableBindings?.Count > 0));

    public static IEnumerable<Prescription> Prescriptions(TrainingDocument document) => Sets(document).SelectMany(s => new[] { s.Prescription }.Concat((s.Segments ?? []).Select(x => x.Prescription))).Concat(BlockMaxes.Rows(document).SelectMany(r => new[] { new Prescription(LoadFormula: r.LoadFormula, LoadUnit: r.LoadUnit), new Prescription(LoadFormula: r.TimeFormula) }));

    public static void Validate(TrainingDocument document, DocumentLimits limits) => Validate(document, limits, strict: true);

    /// <summary>
    /// A draft may be unfinished: wrong formats (reps, loads, set types, formulas being typed) are kept so the coach
    /// can save and fix them later. Only the bounds that keep the document safe to store and read are enforced here;
    /// applying changes runs <see cref="Validate(TrainingDocument, DocumentLimits)"/> before a revision exists.
    /// </summary>
    public static void ValidateDraft(TrainingDocument document, DocumentLimits limits) => Validate(document, limits, strict: false);

    private static void Validate(TrainingDocument document, DocumentLimits limits, bool strict)
    {
        if (document is null || document.SchemaVersion != 1 || document.Blocks is null)
            throw new TrainingValidationException("Unsupported document schema; expected 1.");
        if (JsonSerializer.SerializeToUtf8Bytes(document, TrainingJson.Options).Length > limits.MaximumBytes)
            throw new TrainingValidationException("Document size limit exceeded.");
        var ids = new HashSet<Guid>();
        void Id(Guid id)
        {
            if (id == Guid.Empty || !ids.Add(id))
                throw new TrainingValidationException("Document identifiers must be nonempty and unique.");
            if (ids.Count > limits.MaximumNodes)
                throw new TrainingValidationException("Document node limit exceeded.");
        }
        var targets = document.Blocks.Where(b => b != null).SelectMany(b => new[] { b.Id }.Concat((b.Cycles ?? []).Select(c => c.Id))).ToHashSet();

        foreach (var note in document.Annotations ?? [])
        {
            if (note == null || !Enum.IsDefined(note.Kind) || !Enum.IsDefined(note.Visibility) || note.TargetId is { } target && !targets.Contains(target))
                throw new TrainingValidationException("Invalid plan annotation or connection.");
            Id(note.Id);
            Text(note.Title, 200, true);
            NonNullText(note.Content, 4000);
        }
        var connected = new HashSet<Guid>();

        foreach (var table in document.MaxesTables ?? [])
        {
            if (table?.Rows == null)
                throw new TrainingValidationException("Maxes table rows are required.");
            Id(table.Id);
            if (strict)
                BlockMaxes.Validate(table.Rows);
            else
                DraftMaxes(table.Rows);
            if (table.BlockId is { } owner && (!document.Blocks.Any(b => b.Id == owner) || !connected.Add(owner) || document.Blocks.Any(b => b.Id == owner && b.ExerciseMaxes?.Length > 0)))
                throw new TrainingValidationException("Invalid or duplicate maxes table connection.");
        }
        foreach (var block in document.Blocks)
        {
            if (block?.Cycles is null)
                throw new TrainingValidationException("Block cycles are required.");
            Id(block.Id);
            Text(block.Name, 200, strict && block.Implicit != true);
            NonNullText(block.Description, 4000);
            if (strict)
                BlockMaxes.Validate(block.ExerciseMaxes);
            else
                DraftMaxes(block.ExerciseMaxes);
            foreach (var cycle in block.Cycles)
            {
                if (cycle?.Days is null)
                    throw new TrainingValidationException("Cycle days are required.");
                Id(cycle.Id);
                Text(cycle.Name, 200, strict && cycle.Implicit != true);
                NonNullText(cycle.Description, 4000);
                if (cycle.DayCount < 1 || cycle.DayCount > limits.MaximumCycleDays)
                    throw new TrainingValidationException("Invalid cycle length.");
                if (cycle.Repeats is < 1 or > MaximumRepeats)
                    throw new TrainingValidationException("A cycle repeats 1 to 100 times, or is left open.");
                var days = new HashSet<int>();

                foreach (var day in cycle.Days)
                {
                    if (day?.Workouts is null)
                        throw new TrainingValidationException("Day workouts are required.");
                    Id(day.Id);
                    if (day.DayNumber < 1 || day.DayNumber > cycle.DayCount || !days.Add(day.DayNumber))
                        throw new TrainingValidationException("Invalid or duplicate day number.");
                    Text(day.Note, 2000);
                    foreach (var workout in day.Workouts)
                    {
                        if (workout?.Exercises is null || workout.Groups is null)
                            throw new TrainingValidationException("Workout arrays are required.");
                        Id(workout.Id);
                        Text(workout.Name, 200, strict);
                        NonNullText(workout.Description, 4000);
                        foreach (var exercise in workout.Exercises)
                        {
                            if (exercise?.Sets is null)
                                throw new TrainingValidationException("Exercise sets are required.");
                            Id(exercise.Id);
                            NonNullText(exercise.Comment, 2000);
                            if (exercise.ExerciseId == Guid.Empty)
                                throw new TrainingValidationException("Catalog exercise is required.");
                            var priorTopSets = new HashSet<Guid>();

                            foreach (var set in exercise.Sets)
                            {
                                if (set is null)
                                    throw new TrainingValidationException("Set cannot be null.");
                                Id(set.Id);
                                if (strict)
                                    ValidateSet(set, limits.MaximumSegments);
                                else
                                    DraftSet(set, limits.MaximumSegments);
                                if (set.Kind == SetKind.TopSet)
                                    priorTopSets.Add(set.Id);
                                if (strict && set.Kind == SetKind.BackOff && set.SourceSetId is { } source && !priorTopSets.Contains(source))
                                    throw new TrainingValidationException("Back-off must reference an earlier top set of the same exercise.");
                                foreach (var segment in set.Segments ?? [])
                                    Id(segment.Id);
                            }
                        }
                        var used = new HashSet<Guid>();
                        var exerciseIds = workout.Exercises.Select(e => e.Id).ToHashSet();

                        foreach (var group in workout.Groups)
                        {
                            if (group?.ExerciseIds is null)
                                throw new TrainingValidationException("Group exercises are required.");
                            Id(group.Id);
                            if (!Enum.IsDefined(group.Kind) || group.ExerciseIds.Length < 2 || (group.Kind == GroupKind.Superset && group.ExerciseIds.Length != 2) || group.Rounds is < 1 or > 100 || group.RestSeconds is < 0 or > 86400)
                                throw new TrainingValidationException("Invalid exercise group.");
                            foreach (var id in group.ExerciseIds)
                                if (!exerciseIds.Contains(id) || !used.Add(id))
                                    throw new TrainingValidationException("Groups must reference distinct workout exercises without nesting or overlap.");
                        }
                    }
                }
            }
        }
    }

    // Draft shape only: no nulls where readers expect values, and bounded sizes. Formats are checked on apply.
    private static void DraftSet(TrainingSet set, int maximumSegments)
    {
        if (!Enum.IsDefined(set.Kind))
            throw new TrainingValidationException("Unknown set kind.");
        DraftPrescription(set.Prescription);
        var segments = set.Segments ?? [];

        if (segments.Length > maximumSegments)
            throw new TrainingValidationException("Invalid segments for set kind.");
        foreach (var segment in segments)
        {
            if (segment is null)
                throw new TrainingValidationException("Segment cannot be null.");
            DraftPrescription(segment.Prescription);
        }
    }

    private static void DraftPrescription(Prescription prescription)
    {
        if (prescription is null)
            throw new TrainingValidationException("Prescription is required.");
        Text(prescription.Comment, 2000);
        if (prescription.Tempo?.Length > 32)
            throw new TrainingValidationException("Tempo is too long.");
        if (prescription.FieldFormulas is { } fields)
        {
            if (fields.Count > 4)
                throw new TrainingValidationException("At most four field formulas are supported.");
            foreach (var field in fields)
                DraftFormula(field.Value ?? throw new TrainingValidationException("Field formula is required."));
        }
        if (prescription.LoadFormula is { } formula)
            DraftFormula(formula);
    }

    private static void DraftFormula(FormulaUse formula)
    {
        if (formula.Expression?.Length > 2048 || formula.VariableBindings?.Count > 64 || formula.Inputs?.Count > 64)
            throw new TrainingValidationException("Formula limits exceeded.");
        foreach (var input in formula.Inputs ?? [])
            if (input.Key is null || input.Key.Length > 80 || input.Value is null)
                throw new TrainingValidationException("Invalid formula input.");
    }

    private static void DraftMaxes(BlockExerciseMax[]? rows)
    {
        if (rows == null)
            return;
        if (rows.Length > 64)
            throw new TrainingValidationException("Maximum 64 block exercise maxes.");
        foreach (var row in rows)
        {
            if (row == null)
                throw new TrainingValidationException("Invalid or duplicate block exercise max.");
            if (row.LoadFormula is { } load)
                DraftFormula(load);
            if (row.TimeFormula is { } time)
                DraftFormula(time);
        }
    }

    public static void ValidateSet(TrainingSet set, int maximumSegments = 20)
    {
        if (!Enum.IsDefined(set.Kind))
            throw new TrainingValidationException("Unknown set kind.");
        ValidatePrescription(set.Prescription);
        var segments = set.Segments ?? [];
        var segmented = set.Kind is SetKind.Ramp or SetKind.DropSet or SetKind.RestPause or SetKind.Cluster;

        if (segmented ? segments.Length < 2 || segments.Length > maximumSegments : segments.Length != 0)
            throw new TrainingValidationException("Invalid segments for set kind.");
        if (set.Kind != SetKind.BackOff && set.SourceSetId != null)
            throw new TrainingValidationException("Only back-off sets reference a top set.");
        if (set.Kind == SetKind.Amrap && (set.Prescription.Reps != null || set.Prescription.FieldFormulas?.ContainsKey("Reps") == true))
            throw new TrainingValidationException("AMRAP does not prescribe a fixed repetition range.");
        foreach (var segment in segments)
        {
            if (segment is null)
                throw new TrainingValidationException("Segment cannot be null.");
            ValidatePrescription(segment.Prescription);
        }
    }

    public static void ValidatePrescription(Prescription prescription)
    {
        if (prescription is null)
            throw new TrainingValidationException("Prescription is required.");
        if (prescription.LoadUnit is { } unit && unit is not (Unit.Kg or Unit.Lb))
            throw new TrainingValidationException("Invalid load unit.");
        if (prescription.Reps is { } reps && (reps.Minimum < 1 || reps.Maximum < reps.Minimum || reps.Maximum > MaximumRepetitions))
            throw new TrainingValidationException($"Repetitions must be whole numbers from 1 to {MaximumRepetitions}; the upper bound must be at least the lower bound.");
        if (prescription.Load is { } load)
        {
            CheckQuantity(load.Minimum, "mass");
            CheckQuantity(load.Maximum, "mass");
            if (load.Maximum.In(load.Minimum.Unit) < load.Minimum.Value)
                throw new TrainingValidationException("Reversed load range.");
        }
        if ((prescription.Load != null ? 1 : 0) + (prescription.LoadPercent != null ? 1 : 0) + (prescription.LoadFormula != null ? 1 : 0) > 1)
            throw new TrainingValidationException("Load, percentage, and formula are mutually exclusive.");
        if (prescription.LoadPercent is { } percentage && (percentage <= 0 || percentage > 1000 || prescription.BaseValue is null))
            throw new TrainingValidationException("Percentage load requires a positive percentage and base value.");
        if (prescription.BaseValue is { } basis)
        {
            CheckQuantity(basis, "mass");
            if (prescription.LoadPercent == null)
                throw new TrainingValidationException("BaseValue is only valid for percentage load.");
        }
        if (prescription.Rpe is < 0 or > 10 || prescription.Rir is < 0 or > 100 || prescription.Rpe != null && prescription.Rir != null)
            throw new TrainingValidationException("Invalid or conflicting RPE/RIR.");
        if (prescription.WorkTimeMax == true && (prescription.WorkTime != null || prescription.FieldFormulas?.ContainsKey("WorkTime") == true))
            throw new TrainingValidationException("Maximum effort time cannot prescribe a fixed duration or formula.");
        if (prescription.WorkTime is { } work)
            CheckQuantity(work, "time");
        if (prescription.Rest is { } rest)
            CheckQuantity(rest, "time");
        if (prescription.Distance is { } distance)
            CheckQuantity(distance, "distance");
        Text(prescription.Comment, 2000);
        if (prescription.Tempo != null && !System.Text.RegularExpressions.Regex.IsMatch(prescription.Tempo, @"\A(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)\z", System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)))
            throw new TrainingValidationException("Tempo must contain four dash-separated numbers or X.");
        if (prescription.FieldFormulas is { } fields)
        {
            if (fields.Count > 4)
                throw new TrainingValidationException("At most four field formulas are supported.");
            foreach (var field in fields)
            {
                PrescriptionFormulas.UnitFor(field.Key);
                if (field.Value == null)
                    throw new TrainingValidationException("Field formula is required.");
                ValidatePrescription(new(LoadFormula: field.Value));
            }
        }
        if (prescription.LoadFormula is { } formula)
        {
            if (((formula.FormulaId != null ? 1 : 0) + (formula.BuiltIn != null ? 1 : 0) + (formula.Expression != null ? 1 : 0) != 1) || formula.Version < 1 || formula.Inputs is null || formula.Inputs.Count > 64)
                throw new TrainingValidationException("Invalid formula reference.");
            if (formula.Expression?.Length > 2048 || formula.VariableBindings?.Count > 64)
                throw new TrainingValidationException("Formula limits exceeded.");
            if (formula.OutputUnit is { } output && !Enum.IsDefined(output))
                throw new TrainingValidationException("Invalid formula output unit.");
            foreach (var binding in formula.VariableBindings ?? [])
            {
                FormulaBindings.Identifier(binding.Key);
                FormulaBindings.Identifier(binding.Value);
                if (formula.Inputs.ContainsKey(binding.Key))
                    throw new TrainingValidationException("A formula input cannot also have a variable binding.");
            }
            foreach (var input in formula.Inputs)
            {
                Text(input.Key, 80, true);
                if (input.Value is null || !Enum.IsDefined(input.Value.Unit) || input.Value.Value is < -1_000_000_000m or > 1_000_000_000m)
                    throw new TrainingValidationException("Invalid formula input.");
            }
        }
    }

    private static void CheckQuantity(Quantity quantity, string dimension)
    {
        if (quantity is null || !Enum.IsDefined(quantity.Unit) || Quantity.Dimension(quantity.Unit) != dimension || quantity.Value < 0 || quantity.Value > 1_000_000_000)
            throw new TrainingValidationException($"Invalid {dimension} quantity: use a compatible unit and a value from 0 to 1000000000.");
    }

    public static void Text(string? value, int maximum, bool required = false)
    {
        if ((required && string.IsNullOrWhiteSpace(value)) || (value?.Length ?? 0) > maximum || value?.Contains('\0') == true)
            throw new TrainingValidationException("Invalid text length or content.");
    }

    public static void NonNullText(string? value, int maximum)
    {
        if (value is null)
            throw new TrainingValidationException("Text must be a string, not null.");
        Text(value, maximum);
    }

    public static TrainingDocument Copy(TrainingDocument source)
    {
        var map = new Dictionary<Guid, Guid>();
        Guid New(Guid old)
        {
            if (!map.TryGetValue(old, out var id))
                map.Add(old, id = Guid.NewGuid());
            return id;
        }
        return source with
        {
            Annotations = source.Annotations?.Select(n => n with { Id = New(n.Id), TargetId = n.TargetId is { } target ? New(target) : null }).ToArray(),
            MaxesTables = source.MaxesTables?.Select(t => t with { Id = New(t.Id), BlockId = t.BlockId is { } blockId ? New(blockId) : null, Rows = t.Rows.ToArray() }).ToArray(),
            Blocks = source.Blocks.Select(b => b with { Id = New(b.Id), Cycles = b.Cycles.Select(c => c with { Id = New(c.Id), Days = c.Days.Select(d => d with { Id = New(d.Id), Workouts = d.Workouts.Select(w => w with { Id = New(w.Id), Exercises = w.Exercises.Select(e => e with { Id = New(e.Id), Sets = e.Sets.Select(s => s with { Id = New(s.Id), SourceSetId = s.SourceSetId is { } top ? New(top) : null, Segments = s.Segments?.Select(p => p with { Id = New(p.Id), Prescription = CopyPrescription(p.Prescription) }).ToArray(), Prescription = CopyPrescription(s.Prescription) }).ToArray() }).ToArray(), Groups = w.Groups.Select(g => g with { Id = New(g.Id), ExerciseIds = g.ExerciseIds.Select(New).ToArray() }).ToArray() }).ToArray() }).ToArray() }).ToArray() }).ToArray()
        };
    }

    private static Prescription CopyPrescription(Prescription value) => value with { LoadFormula = value.LoadFormula is { } f ? f with { Inputs = new(f.Inputs), VariableBindings = f.VariableBindings == null ? null : new(f.VariableBindings) } : null };
}

/// <summary>Validates training-folder moves and prevents invalid parent relationships before persistence.</summary>
public static class FolderRules
{
    public static void ValidateMove(Guid id, Guid? parentId, IReadOnlyDictionary<Guid, Guid?> parents, int maximumDepth)
    {
        var visited = new HashSet<Guid> { id };
        var cursor = parentId;
        var depth = 0;
        while (cursor != null)
        {
            if (!visited.Add(cursor.Value))
                throw new TrainingValidationException("Folder cycle detected.");
            if (!parents.TryGetValue(cursor.Value, out cursor))
                throw new TrainingValidationException("Parent folder is unavailable.");
            if (++depth >= maximumDepth)
                throw new TrainingValidationException("Folder depth limit exceeded.");
        }
        // Moving a subtree must keep its deepest descendant within the same limit.
        var descendants = new Queue<(Guid Id, int Depth)>();
        descendants.Enqueue((id, depth + 1));
        while (descendants.Count != 0)
        {
            var node = descendants.Dequeue();

            if (node.Depth > maximumDepth)
                throw new TrainingValidationException("Folder depth limit exceeded.");
            foreach (var child in parents.Where(x => x.Value == node.Id))
            {
                if (child.Key == id)
                    throw new TrainingValidationException("Folder cycle detected.");
                descendants.Enqueue((child.Key, node.Depth + 1));
            }
        }
    }
}
