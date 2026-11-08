using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;

namespace Metrivum.Training.Delivery;

public sealed record TargetRange(decimal Minimum, decimal Maximum);
public sealed record SetComparison(Guid? PlannedSetId, Guid? SegmentId, string Status, TargetRange? PlannedReps, int? ActualReps,
    TargetRange? PlannedLoadKg, decimal? ActualLoadKg, decimal? PlannedRpe, decimal? ActualRpe, decimal? PlannedRir, decimal? ActualRir,
    decimal? RepsDeviation, decimal? LoadDeviationKg, string[] Deviations);
public sealed record ExerciseComparison(Guid? PlannedInstanceId, Guid? PlannedExerciseId, Guid? ActualExerciseId, string Name, string Status,
    int PlannedSets, int PerformedSets, TargetRange? PlannedReps, int? ActualReps, TargetRange? PlannedVolumeKg, decimal? ActualVolumeKg,
    int VolumeRecordedSets, SetComparison[] Sets);
public sealed record WorkoutComparison(Guid ExecutionId, Guid OccurrenceId, Guid RevisionId, string Name, DateOnly PerformedDate,
    int PlannedExercises, int PerformedExercises, int PlannedSets, int PerformedSets, TargetRange? PlannedReps, int? ActualReps,
    TargetRange? PlannedVolumeKg, decimal? ActualVolumeKg, WorkoutFeedback? Feedback, ExerciseComparison[] Exercises,
    string Definition = "Frozen prescription vs recorded results. Segment efforts count separately. Volume includes explicitly total external kg/lb loads only; unresolved targets stay unknown. Target deviations also show deviations from that workout's planned progression; no progression or 1RM is inferred.");

public static class PlannedActual
{
    private sealed record Expected(Guid SetId, Guid? SegmentId, Prescription Prescription, bool MaximumEffort);
    public static WorkoutComparison Compare(WorkoutExecution execution, string name)
    {
        var workout = execution.Prescription.Workout;
        var result = new List<ExerciseComparison>();
        foreach (var planned in workout.Exercises)
        {
            var actual = execution.Exercises.SingleOrDefault(x => x.PrescribedInstanceId == planned.Id);
            var expected = planned.Sets.SelectMany(s => s.Segments?.Length > 0
                ? s.Segments.Select(segment => new Expected(s.Id, segment.Id, segment.Prescription, segment.Prescription.WorkTimeMax == true))
                : [new Expected(s.Id, null, s.Prescription, s.Kind == SetKind.Amrap || s.Prescription.WorkTimeMax == true)]).ToArray();
            result.Add(Exercise(planned.Id, planned.ExerciseId, actual, expected,
                execution.Prescription.Exercises.GetValueOrDefault(planned.ExerciseId)?.Name ?? "Exercise", execution.Prescription));
        }
        foreach (var added in execution.Exercises.Where(x => x.PrescribedInstanceId == null))
            result.Add(Exercise(null, null, added, [], added.Name, execution.Prescription));
        var all = result.ToArray();
        return new(execution.Id, execution.OccurrenceId, execution.Prescription.RevisionId, name, execution.PerformedDate,
            workout.Exercises.Length, all.Count(x => x.PerformedSets > 0), all.Sum(x => x.PlannedSets), all.Sum(x => x.PerformedSets),
            SumRanges(all.Where(x => x.PlannedSets > 0).Select(x => x.PlannedReps)),
            SumKnown(all.Where(x => x.PerformedSets > 0).Select(x => x.ActualReps is {} r ? (decimal?)r : null)) is {} reps ? (int)reps : null,
            SumRanges(all.Where(x => x.PlannedSets > 0).Select(x => x.PlannedVolumeKg)),
            SumKnown(all.Where(x => x.PerformedSets > 0).Select(x => x.ActualVolumeKg)), execution.Feedback, all);
    }

    private static ExerciseComparison Exercise(Guid? instance, Guid? exercise, ExerciseExecution? actual, Expected[] expected, string name, WorkoutPrescription snapshot)
    {
        var comparisons = new List<SetComparison>();
        foreach (var p in expected)
        {
            var set = actual?.Sets.SingleOrDefault(x => x.PrescribedSetId == p.SetId && x.PrescribedSegmentId == p.SegmentId);
            comparisons.Add(Set(p, set, snapshot));
        }
        foreach (var extra in actual?.Sets.Where(x => x.PrescribedSetId == null) ?? []) comparisons.Add(Set(null, extra, snapshot));
        var openTargets = expected.Where(x => x.MaximumEffort).Select(x => (x.SetId, x.SegmentId)).ToHashSet();
        var done = actual?.Sets.Where(x => DeliveryRules.IsPerformedSet(x, x.PrescribedSetId is { } id && openTargets.Contains((id, x.PrescribedSegmentId)))).ToArray() ?? [];
        var explicitlySkipped = actual?.Sets.Count > 0 && actual.Sets.All(x => x.Skipped);
        var volume = done.Select(s => s.Reps is {} reps && ActualKg(s) is {} kg ? (decimal?)(kg * reps) : null).ToArray();
        var targets = comparisons.Where(x => x.PlannedSetId != null).ToArray();
        return new(instance, exercise, actual?.ExerciseId, actual?.Name ?? name,
            instance == null ? "Added" : actual == null ? "Missing" : done.Length == 0 ? explicitlySkipped ? "Skipped" : "NotLogged" : exercise != actual.ExerciseId ? "Changed" : "Matched",
            expected.Length, done.Length, SumRanges(targets.Select(x => x.PlannedReps)),
            done.Length == 0 ? explicitlySkipped ? 0 : null : SumKnown(done.Select(x => x.Reps is {} r ? (decimal?)r : null)) is {} total ? (int)total : null,
            SumRanges(targets.Select(x => x.PlannedReps is {} r && x.PlannedLoadKg is {} load
                ? new TargetRange(r.Minimum * load.Minimum, r.Maximum * load.Maximum) : null)),
            done.Length == 0 ? explicitlySkipped ? 0 : null : SumKnown(volume), volume.Count(x => x != null), comparisons.ToArray());
    }

    private static SetComparison Set(Expected? planned, SetExecution? actual, WorkoutPrescription snapshot)
    {
        var p = planned?.Prescription;
        var reps = p?.Reps is {} range ? new TargetRange(range.Minimum, range.Maximum) : Target(planned, snapshot, "reps");
        TargetRange? load = p?.Load is {} quantity && Quantity.Dimension(quantity.Minimum.Unit) == "mass"
            ? new(quantity.Minimum.In(Unit.Kg), quantity.Maximum.In(Unit.Kg)) : Target(planned, snapshot, "load");
        var performed = actual is { Skipped: false };
        var kg = performed ? ActualKg(actual!) : null;
        var actualReps = performed ? actual!.Reps : null;
        var repDelta = Deviation(reps, actualReps);
        var loadDelta = Deviation(load, kg);
        var deviations = new List<string>();
        if (repDelta is not (null or 0)) deviations.Add("repetitions_outside_target");
        if (loadDelta is not (null or 0)) deviations.Add("load_outside_target");
        if (performed && p?.Rpe is {} rpe && actual!.Rpe is {} actualRpe && actualRpe != rpe) deviations.Add("rpe_differs");
        if (performed && p?.Rir is {} rir && actual!.Rir is {} actualRir && actualRir != rir) deviations.Add("rir_differs");
        return new(planned?.SetId, planned?.SegmentId, planned == null ? "Added" : actual == null ? "Missing" : actual.Skipped ? "Skipped" : DeliveryRules.IsPerformedSet(actual, planned?.MaximumEffort == true) ? "Performed" : "NotLogged",
            reps, actualReps, load, kg, p?.Rpe, performed ? actual!.Rpe : null, p?.Rir, performed ? actual!.Rir : null, repDelta, loadDelta, deviations.ToArray());
    }
    private static TargetRange? Target(Expected? set, WorkoutPrescription snapshot, string field)
    {
        if (set == null || !snapshot.Formulas.TryGetValue(set.SegmentId ?? set.SetId, out var evaluation)) return null;
        var value = evaluation.FieldValues?.GetValueOrDefault(field) ?? (field == "load" ? evaluation.Result : null);
        if (value == null || field == "load" && Quantity.Dimension(value.Unit) != "mass" || field == "reps" && Quantity.Dimension(value.Unit) != "scalar") return null;
        var number = field == "load" ? value.In(Unit.Kg) : value.Value;
        return new(number, number);
    }
    private static decimal? ActualKg(SetExecution actual) => actual.LoadMeaning == LoadMeaning.TotalExternal && actual.Load is {} value
        ? actual.LoadUnit == "kg" ? value : actual.LoadUnit == "lb" ? value * 0.45359237m : null : null;
    private static decimal? Deviation(TargetRange? range, decimal? value) => range == null || value == null ? null
        : value < range.Minimum ? value - range.Minimum : value > range.Maximum ? value - range.Maximum : 0;
    private static decimal? SumKnown(IEnumerable<decimal?> values)
    {
        var array = values.ToArray(); return array.Length == 0 || array.Any(x => x == null) ? null : array.Sum(x => x!.Value);
    }
    private static TargetRange? SumRanges(IEnumerable<TargetRange?> values)
    {
        var array = values.ToArray(); return array.Length == 0 || array.Any(x => x == null) ? null : new(array.Sum(x => x!.Minimum), array.Sum(x => x!.Maximum));
    }
}

public sealed partial class TrainingDeliveryService
{
    public async Task<WorkoutComparison> CompareExecutionAsync(Guid id, CancellationToken ct)
    {
        var execution = await ExecutionQuery().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.NotFound();
        var (_, assignment) = await WorkoutContextAsync(execution.OccurrenceId, Metrivum.Coaching.Contracts.RelationshipOperation.HistoricalSharedRead, ct);
        return PlannedActual.Compare(execution, assignment.ProgramName + " · " + execution.Prescription.Workout.Name);
    }

    public async Task<Paged<WorkoutComparison>> ComparisonReportAsync(DateOnly fromDate, DateOnly toDate, Guid? relationshipId, Guid? programId,
        Guid? blockId, Guid? cycleId, int page, int pageSize, string? view, CancellationToken ct)
    {
        Range(fromDate, toDate); Page(page, pageSize);
        var relationships = await VisibleAsync(relationshipId, null, ct, view);
        var query = from e in ExecutionQuery().AsNoTracking()
                    join o in Occurrences on e.OccurrenceId equals o.Id
                    join a in Assignments on o.AssignmentId equals a.Id
                    where relationships.Contains(a.RelationshipId) && e.Status == ExecutionStatus.Completed
                        && e.PerformedDate >= fromDate && e.PerformedDate <= toDate && (programId == null || a.ProgramId == programId)
                        && (blockId == null || o.BlockId == blockId) && (cycleId == null || o.CycleId == cycleId)
                    select e;
        var total = await query.LongCountAsync(ct);
        var executions = await query.OrderByDescending(x => x.PerformedDate).ThenByDescending(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(executions.Select(x => PlannedActual.Compare(x, x.Prescription.Workout.Name)).ToArray(), page, pageSize, total);
    }
}
