using Metrivum.BuildingBlocks;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;

namespace Metrivum.UnitTests;

public sealed class PlannedActualTests
{
    [Fact]
    public void Uses_frozen_targets_and_distinguishes_substituted_added_missing_and_skipped_sets()
    {
        var expected = Guid.NewGuid();
        var missed = Guid.NewGuid();
        var skipped = Guid.NewGuid();
        var instance = Guid.NewGuid();
        var exercise = Guid.NewGuid();
        var prescription = new Prescription(
            new(5, 8),
            new(new(100, Unit.Kg), new(110, Unit.Kg)),
            Rpe: 8,
            Rir: 2
        );
        var workout = new Workout(
            Guid.NewGuid(),
            "Session",
            "",
            [
                new(
                    instance,
                    exercise,
                    "",
                    [
                        new(expected, SetKind.Standard, prescription),
                        new(missed, SetKind.Standard, prescription),
                        new(skipped, SetKind.Standard, prescription),
                    ]
                ),
            ],
            []
        );
        var execution = Execution(workout);
        execution.Exercises.Add(
            new()
            {
                Id = Guid.NewGuid(),
                PrescribedInstanceId = instance,
                ExerciseId = Guid.NewGuid(),
                Name = "Alternative",
                Sets =
                [
                    new()
                    {
                        PrescribedSetId = expected,
                        Reps = 4,
                        Load = 90,
                        LoadUnit = "kg",
                        LoadMeaning = LoadMeaning.TotalExternal,
                        Rpe = 9,
                        Rir = 1,
                    },
                    new() { PrescribedSetId = skipped, Skipped = true },
                ],
            }
        );
        execution.Exercises.Add(
            new()
            {
                ExerciseId = Guid.NewGuid(),
                Name = "Extra",
                Sets = [new() { Reps = 12, LoadMeaning = LoadMeaning.Bodyweight }],
            }
        );
        var compared = PlannedActual.Compare(execution, "Session");
        Assert.Equal(3, compared.PlannedSets);
        Assert.Equal(2, compared.PerformedSets);
        var changed = compared.Exercises[0];
        Assert.Equal("Changed", changed.Status);
        Assert.Equal(
            new[] { "Performed", "Missing", "Skipped" },
            changed.Sets.Select(x => x.Status)
        );
        Assert.Equal(-1, changed.Sets[0].RepsDeviation);
        Assert.Equal(-10, changed.Sets[0].LoadDeviationKg);
        Assert.Equal(360, changed.ActualVolumeKg);
        Assert.Equal(new TargetRange(1500, 2640), changed.PlannedVolumeKg);
        Assert.Equal("Added", compared.Exercises[1].Status);
        Assert.Null(compared.Exercises[1].ActualVolumeKg);
        Assert.Null(compared.ActualVolumeKg); // A bodyweight set never becomes an invented external-load volume.
    }

    [Fact]
    public void Pounds_convert_to_kg_and_values_inside_prescribed_range_have_zero_deviation()
    {
        var set = Guid.NewGuid();
        var instance = Guid.NewGuid();
        var exercise = Guid.NewGuid();
        var workout = new Workout(
            Guid.NewGuid(),
            "",
            "",
            [
                new(
                    instance,
                    exercise,
                    "",
                    [
                        new(
                            set,
                            SetKind.Standard,
                            new(Reps: new(3, 5), Load: new(new(100, Unit.Lb), new(110, Unit.Lb)))
                        ),
                    ]
                ),
            ],
            []
        );
        var execution = Execution(workout);
        execution.Exercises.Add(
            new()
            {
                PrescribedInstanceId = instance,
                ExerciseId = exercise,
                Sets =
                [
                    new()
                    {
                        PrescribedSetId = set,
                        Reps = 4,
                        Load = 105,
                        LoadUnit = "lb",
                        LoadMeaning = LoadMeaning.TotalExternal,
                    },
                ],
            }
        );
        var result = Assert.Single(PlannedActual.Compare(execution, "").Exercises);
        Assert.Equal(0, result.Sets[0].LoadDeviationKg);
        Assert.Equal(0, result.Sets[0].RepsDeviation);
        Assert.Equal(105 * .45359237m * 4, result.ActualVolumeKg);
    }

    [Fact]
    public void Missing_targets_and_unlogged_values_stay_unknown_and_do_not_become_zero()
    {
        var id = Guid.NewGuid();
        var ex = Guid.NewGuid();
        var set = Guid.NewGuid();
        var workout = new Workout(
            Guid.NewGuid(),
            "",
            "",
            [new(id, ex, "", [new(set, SetKind.Standard, new())])],
            []
        );
        var execution = Execution(workout);
        execution.Exercises.Add(
            new()
            {
                PrescribedInstanceId = id,
                ExerciseId = ex,
                Sets = [new() { PrescribedSetId = set }],
            }
        );
        var result = PlannedActual.Compare(execution, "");
        Assert.Null(result.PlannedVolumeKg);
        Assert.Null(result.ActualVolumeKg);
        Assert.Null(result.PlannedReps);
        Assert.Null(result.ActualReps);
    }

    [Theory]
    [InlineData(0, 5, 3, 3)]
    [InlineData(3, 11, 3, 3)]
    [InlineData(3, 5, 6, 3)]
    [InlineData(3, 5, 3, 0)]
    public void Feedback_enforces_all_scales(int rating, int rpe, int wellbeing, int sleep) =>
        Assert.Throws<ApiException>(() =>
            WorkoutFeedbackRules.Validate(new(rating, rpe, wellbeing, sleep))
        );

    [Fact]
    public void Feedback_accepts_session_rpe_zero_and_optional_note() =>
        WorkoutFeedbackRules.Validate(new(5, 0, 4, 2));

    private static WorkoutExecution Execution(Workout workout) =>
        new()
        {
            Id = Guid.NewGuid(),
            OccurrenceId = Guid.NewGuid(),
            PerformedDate = new(2026, 10, 24),
            Prescription = new(Guid.NewGuid(), "Plan", workout, [], []),
        };
}
