using System.Text.Json;
using System.Text.Json.Serialization;

namespace TrainFlow.Training.Domain;

[JsonConverter(typeof(JsonStringEnumConverter<SetKind>))]
public enum SetKind
{
    Standard, Amrap, Ramp, TopSet, BackOff, DropSet, RestPause, Cluster
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
public sealed record FormulaUse(Guid? FormulaId, int Version, string? BuiltIn, Dictionary<string, Quantity> Inputs);
public sealed record FormulaEvaluation(string Expression, int Version, Dictionary<string, Quantity> Inputs, Quantity Result);
public sealed record Prescription(IntRange? Reps = null, QuantityRange? Load = null, decimal? LoadPercent = null, Quantity? BaseValue = null,
    decimal? Rpe = null, decimal? Rir = null, Quantity? WorkTime = null, Quantity? Rest = null, string? Tempo = null,
    Quantity? Distance = null, string? Comment = null, FormulaUse? LoadFormula = null);
public sealed record SetSegment(Guid Id, Prescription Prescription);
public sealed record TrainingSet(Guid Id, SetKind Kind, Prescription Prescription, SetSegment[]? Segments = null, Guid? SourceSetId = null);
public sealed record ExerciseInstance(Guid Id, Guid ExerciseId, string Comment, TrainingSet[] Sets);
public sealed record ExerciseGroup(Guid Id, GroupKind Kind, Guid[] ExerciseIds, int Rounds, decimal RestSeconds);
public sealed record Workout(Guid Id, string Name, string Description, ExerciseInstance[] Exercises, ExerciseGroup[] Groups);
/// <summary>A day of a cycle. <c>Note</c> is free text for the day, e.g. what to do on a rest day.</summary>
public sealed record TrainingDay(Guid Id, int DayNumber, Workout[] Workouts, string? Note = null);
public sealed record Cycle(Guid Id, string Name, string Description, int DayCount, TrainingDay[] Days);
public sealed record Block(Guid Id, string Name, string Description, Cycle[] Cycles);
public sealed record TrainingDocument(int SchemaVersion, Block[] Blocks);

public sealed class DocumentLimits
{
    public int MaximumBytes { get; set; } = 1_048_576;
    public int MaximumNodes { get; set; } = 10000;
    public int MaximumCycleDays { get; set; } = 366;
    public int MaximumSegments { get; set; } = 20;
}

public static class TrainingJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow, MaxDepth = 48 };
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static T Deserialize<T>(string value) => JsonSerializer.Deserialize<T>(value, Options) ?? throw new TrainingValidationException("Empty JSON document.");
}

public static class DocumentRules
{
    public static IEnumerable<Workout> Workouts(TrainingDocument document) => document.Blocks.SelectMany(b => b.Cycles).SelectMany(c => c.Days).SelectMany(d => d.Workouts);
    public static IEnumerable<TrainingSet> Sets(TrainingDocument document) => Workouts(document).SelectMany(w => w.Exercises).SelectMany(e => e.Sets);
    public static bool HasAdvanced(TrainingDocument document) => Workouts(document).Any(w => w.Groups.Length > 0) || Sets(document).Any(s => s.Kind != SetKind.Standard);
    public static bool HasCustomFormulas(TrainingDocument document) => Prescriptions(document).Any(p => p.LoadFormula?.FormulaId != null);
    public static IEnumerable<Prescription> Prescriptions(TrainingDocument document) => Sets(document).SelectMany(s => new[] { s.Prescription }.Concat((s.Segments ?? []).Select(x => x.Prescription)));
    public static void Validate(TrainingDocument document, DocumentLimits limits)
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
        foreach (var block in document.Blocks)
        {
            if (block?.Cycles is null)
                throw new TrainingValidationException("Block cycles are required.");
            Id(block.Id);
            Text(block.Name, 200, true);
            NonNullText(block.Description, 4000);
            foreach (var cycle in block.Cycles)
            {
                if (cycle?.Days is null)
                    throw new TrainingValidationException("Cycle days are required.");
                Id(cycle.Id);
                Text(cycle.Name, 200, true);
                NonNullText(cycle.Description, 4000);
                if (cycle.DayCount < 1 || cycle.DayCount > limits.MaximumCycleDays)
                    throw new TrainingValidationException("Invalid cycle length.");
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
                        Text(workout.Name, 200, true);
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
                                ValidateSet(set, limits.MaximumSegments);
                                if (set.Kind == SetKind.TopSet)
                                    priorTopSets.Add(set.Id);
                                if (set.Kind == SetKind.BackOff && (set.SourceSetId is null || !priorTopSets.Contains(set.SourceSetId.Value)))
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
        if (set.Kind == SetKind.Amrap && set.Prescription.Reps != null)
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
        if (prescription.Reps is { } reps && (reps.Minimum < 1 || reps.Maximum < reps.Minimum || reps.Maximum > 10000))
            throw new TrainingValidationException("Invalid repetition range.");
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
        if (prescription.WorkTime is { } work)
            CheckQuantity(work, "time");
        if (prescription.Rest is { } rest)
            CheckQuantity(rest, "time");
        if (prescription.Distance is { } distance)
            CheckQuantity(distance, "distance");
        Text(prescription.Comment, 2000);
        if (prescription.Tempo != null && !System.Text.RegularExpressions.Regex.IsMatch(prescription.Tempo, @"\A(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)\z", System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)))
            throw new TrainingValidationException("Tempo must contain four dash-separated numbers or X.");
        if (prescription.LoadFormula is { } formula)
        {
            if ((formula.FormulaId != null) == (formula.BuiltIn != null) || formula.Version < 1 || formula.Inputs is null || formula.Inputs.Count > 64)
                throw new TrainingValidationException("Invalid formula reference.");
            foreach (var input in formula.Inputs)
            {
                Text(input.Key, 80, true);
                if (input.Value is null || !Enum.IsDefined(input.Value.Unit) || Math.Abs(input.Value.Value) > 1_000_000_000m)
                    throw new TrainingValidationException("Invalid formula input.");
            }
        }
    }
    private static void CheckQuantity(Quantity quantity, string dimension)
    {
        if (quantity is null || !Enum.IsDefined(quantity.Unit) || Quantity.Dimension(quantity.Unit) != dimension || quantity.Value < 0 || quantity.Value > 1_000_000_000)
            throw new TrainingValidationException($"Invalid {dimension} quantity.");
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
            Blocks = source.Blocks.Select(b => b with { Id = New(b.Id), Cycles = b.Cycles.Select(c => c with { Id = New(c.Id), Days = c.Days.Select(d => d with { Id = New(d.Id), Workouts = d.Workouts.Select(w => w with { Id = New(w.Id), Exercises = w.Exercises.Select(e => e with { Id = New(e.Id), Sets = e.Sets.Select(s => s with { Id = New(s.Id), SourceSetId = s.SourceSetId is { } top ? New(top) : null, Segments = s.Segments?.Select(p => p with { Id = New(p.Id), Prescription = CopyPrescription(p.Prescription) }).ToArray(), Prescription = CopyPrescription(s.Prescription) }).ToArray() }).ToArray(), Groups = w.Groups.Select(g => g with { Id = New(g.Id), ExerciseIds = g.ExerciseIds.Select(New).ToArray() }).ToArray() }).ToArray() }).ToArray() }).ToArray() }).ToArray()
        };
    }
    private static Prescription CopyPrescription(Prescription value) => value with { LoadFormula = value.LoadFormula is { } f ? f with { Inputs = new(f.Inputs) } : null };
}

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
