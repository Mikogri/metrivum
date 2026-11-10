using Metrivum.BuildingBlocks;
using Metrivum.Training.Domain;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Delivery;

/// <summary>Validates training delivery state, dates and execution completion and resolves occurrence schedules without writing data.</summary>
public static class DeliveryRules
{
    public static bool IsPerformedSet(SetExecution set, bool maximumEffort = false) =>
        !set.Skipped
        && (set.Reps > 0 || set.DurationSeconds > 0 || set.DistanceMeters > 0 || maximumEffort);

    // A saved, non-skipped maximum-effort set is an explicit log even when its result was omitted.
    public static bool HasPerformedSet(WorkoutExecution execution)
    {
        var openTargets = new HashSet<(Guid Set, Guid? Segment)>();
        foreach (var target in execution.Prescription.Workout.Exercises.SelectMany(ex => ex.Sets))
        {
            if (target.Kind == SetKind.Amrap || target.Prescription.WorkTimeMax == true)
                openTargets.Add((target.Id, null));
            foreach (var segment in target.Segments ?? [])
                if (segment.Prescription.WorkTimeMax == true)
                    openTargets.Add((target.Id, segment.Id));
        }
        return execution
            .Exercises.SelectMany(ex => ex.Sets)
            .Any(set =>
                IsPerformedSet(
                    set,
                    set.PrescribedSetId is { } id
                        && openTargets.Contains((id, set.PrescribedSegmentId))
                )
            );
    }

    public static TimeZoneInfo Zone(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception e)
            when (e is TimeZoneNotFoundException or InvalidTimeZoneException or ArgumentException)
        {
            throw ApiException.Invalid("Unknown schedule time zone.");
        }
    }

    public static DateOnly LocalDate(DateTimeOffset now, string zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Zone(zone)).DateTime);

    public static DateTimeOffset Deadline(DateOnly day, string zone)
    {
        var tz = Zone(zone);
        var local = day.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        while (tz.IsInvalidTime(local))
            local = local.AddMinutes(1);
        var offset = tz.IsAmbiguousTime(local)
            ? tz.GetAmbiguousTimeOffsets(local).Min()
            : tz.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    public static WorkoutOccurrence[] Resolve(
        ProgramAssignment assignment,
        TrainingRevision revision
    )
    {
        var results = new List<WorkoutOccurrence>();
        var offset = 0;
        var document = revision.Snapshot.Document;
        foreach (var block in document.Blocks)
        foreach (var cycle in block.Cycles)
            for (var run = 0; run < DocumentRules.RunsOf(document, cycle); run++)
            {
                foreach (var day in cycle.Days)
                foreach (var workout in day.Workouts)
                {
                    var date = assignment.StartDate.AddDays(checked(offset + day.DayNumber - 1));
                    results.Add(
                        new()
                        {
                            Id = Guid.NewGuid(),
                            AssignmentId = assignment.Id,
                            RevisionId = revision.Id,
                            BlockId = block.Id,
                            CycleId = cycle.Id,
                            DayId = day.Id,
                            WorkoutId = workout.Id,
                            Repetition = run,
                            Name = workout.Name,
                            ScheduledDate = date,
                            Deadline = Deadline(date, assignment.TimeZone),
                            Prescription = new(
                                revision.Id,
                                revision.Snapshot.Name,
                                PrescriptionFormulas.Freeze(
                                    workout,
                                    assignment.FormulaSnapshot?.Evaluations
                                        ?? revision.Snapshot.Formulas
                                ),
                                revision
                                    .Snapshot.Exercises.Where(x =>
                                        workout.Exercises.Any(e => e.ExerciseId == x.Key)
                                    )
                                    .ToDictionary(),
                                assignment.FormulaSnapshot?.Evaluations
                                    ?? revision.Snapshot.Formulas,
                                revision.Snapshot.Document.Annotations == null
                                    ? null
                                    : DocumentRules.AnnotationsFor(
                                        revision.Snapshot.Document,
                                        block.Id,
                                        cycle.Id
                                    )
                            ),
                        }
                    );
                }
                offset = checked(offset + cycle.DayCount);
                if (offset > 3660 || results.Count > 5000)
                    throw ApiException.Invalid(
                        "Assignments support at most ten years and 5000 workouts."
                    );
            }
        return results.ToArray();
    }

    public static string Status(
        WorkoutOccurrence occurrence,
        WorkoutExecution? execution,
        DateTimeOffset now
    ) =>
        execution?.Status switch
        {
            ExecutionStatus.Completed => "Completed",
            ExecutionStatus.Skipped => "Skipped",
            ExecutionStatus.InProgress => "InProgress",
            _ => now >= occurrence.Deadline ? "Missed" : "Scheduled",
        };

    public static decimal? Volume(ActualSet set) =>
        !set.Skipped
        && set.LoadMeaning == LoadMeaning.TotalExternal
        && set.Load >= 0
        && set.Reps > 0
            ? set.LoadUnit switch
            {
                "kg" => set.Load * set.Reps,
                "lb" => set.Load * 0.45359237m * set.Reps,
                _ => null,
            }
            : null;

    public static void Version(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(
                409,
                "VERSION_CONFLICT",
                "Training changed in another tab. Reload before saving."
            );
    }
}
