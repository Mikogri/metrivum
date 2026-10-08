using TrainFlow.BuildingBlocks;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Delivery;

public static class DeliveryRules
{
    public static TimeZoneInfo Zone(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException or ArgumentException) { throw ApiException.Invalid("Unknown schedule time zone."); }
    }
    public static DateOnly LocalDate(DateTimeOffset now, string zone) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Zone(zone)).DateTime);
    public static DateTimeOffset Deadline(DateOnly day, string zone)
    {
        var tz = Zone(zone);
        var local = day.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        while (tz.IsInvalidTime(local))
            local = local.AddMinutes(1);
        var offset = tz.IsAmbiguousTime(local) ? tz.GetAmbiguousTimeOffsets(local).Min() : tz.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }
    public static WorkoutOccurrence[] Resolve(ProgramAssignment assignment, TrainingRevision revision)
    {
        var results = new List<WorkoutOccurrence>();
        var offset = 0;
        foreach (var block in revision.Snapshot.Document.Blocks)
            foreach (var cycle in block.Cycles)
            {
                foreach (var day in cycle.Days)
                    foreach (var workout in day.Workouts)
                    {
                        var date = assignment.StartDate.AddDays(checked(offset + day.DayNumber - 1));
                        results.Add(new()
                        {
                            Id = Guid.NewGuid(),
                            AssignmentId = assignment.Id,
                            RevisionId = revision.Id,
                            BlockId = block.Id,
                            CycleId = cycle.Id,
                            DayId = day.Id,
                            WorkoutId = workout.Id,
                            Name = workout.Name,
                            ScheduledDate = date,
                            Deadline = Deadline(date, assignment.TimeZone),
                            Prescription = new(revision.Id, revision.Snapshot.Name, workout,
                                revision.Snapshot.Exercises.Where(x => workout.Exercises.Any(e => e.ExerciseId == x.Key)).ToDictionary(), revision.Snapshot.Formulas)
                        });
                    }
                offset = checked(offset + cycle.DayCount);
                if (offset > 3660 || results.Count > 5000)
                    throw ApiException.Invalid("Assignments support at most ten years and 5000 workouts.");
            }
        return results.ToArray();
    }
    public static string Status(WorkoutOccurrence occurrence, WorkoutExecution? execution, DateTimeOffset now) => execution?.Status switch
    {
        ExecutionStatus.Completed => "Completed",
        ExecutionStatus.Skipped => "Skipped",
        ExecutionStatus.InProgress => "InProgress",
        _ => now >= occurrence.Deadline ? "Missed" : "Scheduled"
    };
    public static decimal? Volume(ActualSet set) => !set.Skipped && set.LoadMeaning == LoadMeaning.TotalExternal && set.Load >= 0 && set.Reps > 0
        ? set.LoadUnit switch
        {
            "kg" => set.Load * set.Reps,
            "lb" => set.Load * 0.45359237m * set.Reps,
            _ => null
        } : null;
    public static void Version(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(409, "VERSION_CONFLICT", "Training changed in another tab. Reload before saving.");
    }
}
