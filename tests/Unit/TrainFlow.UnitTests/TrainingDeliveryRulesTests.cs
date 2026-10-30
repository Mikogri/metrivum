using TrainFlow.Training.Delivery;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.UnitTests;

public sealed class TrainingDeliveryRulesTests
{
    [Fact]
    public void Repeated_cycles_schedule_each_run_and_a_lone_open_cycle_runs_for_a_year()
    {
        var a = new ProgramAssignment { Id = Guid.NewGuid(), StartDate = new(2026, 1, 5), TimeZone = "Europe/Warsaw" };
        Workout W() => new(Guid.NewGuid(), "Session", "", [], []);
        TrainingRevision Revision(params Cycle[] cycles) => new() { Id = Guid.NewGuid(), Snapshot = new(1, "Program", "", DocumentKind.Program, new(1, [new(Guid.NewGuid(), "Block", "", cycles)]), [], []) };
        var twice = new Cycle(Guid.NewGuid(), "Twice", "", 7, [new(Guid.NewGuid(), 1, [W()])], 2);
        var once = new Cycle(Guid.NewGuid(), "Open but not alone", "", 3, [new(Guid.NewGuid(), 2, [W()])]);
        var runs = DeliveryRules.Resolve(a, Revision(twice, once));
        Assert.Equal([new DateOnly(2026, 1, 5), new DateOnly(2026, 1, 12), new DateOnly(2026, 1, 20)], runs.Select(x => x.ScheduledDate));
        Assert.Equal([0, 1, 0], runs.Select(x => x.Repetition));
        var alone = DeliveryRules.Resolve(a, Revision(once with { Repeats = null }));
        Assert.Equal(122, alone.Length);
        Assert.Equal(Enumerable.Range(0, 122), alone.Select(x => x.Repetition));
    }

    [Fact]
    public void Arbitrary_cycles_and_two_workouts_on_one_day_resolve_without_week_assumptions()
    {
        var a = new ProgramAssignment { Id = Guid.NewGuid(), StartDate = new(2026, 1, 4), TimeZone = "Europe/Warsaw" };
        Workout W() => new(Guid.NewGuid(), "Session", "", [], []);
        var revision = new TrainingRevision
        {
            Id = Guid.NewGuid(),
            Snapshot = new(1, "Program", "", DocumentKind.Program,
            new(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "10 days", "", 10, [new(Guid.NewGuid(), 10, [W(), W()])]),
                new(Guid.NewGuid(), "7 days", "", 7, [new(Guid.NewGuid(), 1, [W()])])])]), [], [])
        };
        var result = DeliveryRules.Resolve(a, revision);
        Assert.Equal([new DateOnly(2026, 1, 13), new(2026, 1, 13), new(2026, 1, 14)], result.Select(x => x.ScheduledDate));
        Assert.Equal(3, result.Select(x => x.Id).Distinct().Count());
    }
    [Theory]
    [InlineData(2026, 3, 29, 23)]
    [InlineData(2026, 10, 25, 25)]
    public void Warsaw_dst_deadlines_use_local_midnight(int year, int month, int day, int hours)
    {
        var date = new DateOnly(year, month, day);
        Assert.Equal(hours, (DeliveryRules.Deadline(date, "Europe/Warsaw") - DeliveryRules.Deadline(date.AddDays(-1), "Europe/Warsaw")).TotalHours);
    }
    [Fact]
    public void Not_logged_by_deadline_is_missed_and_late_completion_reclassifies()
    {
        var o = new WorkoutOccurrence { Deadline = new(2026, 1, 1, 23, 0, 0, TimeSpan.Zero) };
        Assert.Equal("Scheduled", DeliveryRules.Status(o, null, o.Deadline.AddTicks(-1)));
        Assert.Equal("Missed", DeliveryRules.Status(o, null, o.Deadline));
        Assert.Equal("Completed", DeliveryRules.Status(o, new()
        {
            Status = ExecutionStatus.Completed
        }, o.Deadline.AddDays(4)));
        Assert.Equal("Skipped", DeliveryRules.Status(o, new()
        {
            Status = ExecutionStatus.Skipped
        }, o.Deadline));
    }
    [Fact]
    public void Volume_only_converts_explicit_total_external_mass_and_actual_repetitions()
    {
        var set = new ActualSet(null, null, false, 10, 100, "lb", LoadMeaning.TotalExternal, null, null, null, null, null, null, null);
        Assert.Equal(453.59237m, DeliveryRules.Volume(set));
        Assert.Null(DeliveryRules.Volume(set with
        {
            LoadMeaning = LoadMeaning.PerHand
        }));
        Assert.Null(DeliveryRules.Volume(set with
        {
            LoadMeaning = LoadMeaning.Bodyweight
        }));
        Assert.Null(DeliveryRules.Volume(set with
        {
            Skipped = true
        }));
        Assert.Null(DeliveryRules.Volume(set with
        {
            Reps = null
        }));
        Assert.Null(DeliveryRules.Volume(set with
        {
            LoadUnit = "stone"
        }));
    }
}
