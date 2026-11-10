using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.ExerciseCatalog.Features;
using Metrivum.Training.Domain;
using Metrivum.Training.Generation;

namespace Metrivum.UnitTests;

public sealed class GeneratorTests
{
    private static readonly GeneratorCatalog Catalog = new(
        ReviewedGeneratorCatalog.Version,
        ReviewedGeneratorCatalog.Exercises
    );

    private static GenerationRequest Input(GenerationMode mode = GenerationMode.Strength) =>
        new(
            mode,
            GenerationLevel.Intermediate,
            60,
            10,
            [1, 4, 8],
            3,
            4231,
            [
                "dumbbells",
                "incline-bench",
                "clear-walking-route",
                "stationary-bike",
                "air-bike",
                "barbell",
                "plates",
                "rack-safeties",
                "bench",
            ],
            ["hip-hinge", "push-up", "front-rack", "barbell-squat", "barbell-bench"],
            [],
            [],
            [],
            true
        );

    [Theory]
    [InlineData(GenerationMode.Strength)]
    [InlineData(GenerationMode.Hypertrophy)]
    [InlineData(GenerationMode.Cardio)]
    [InlineData(GenerationMode.Mixed)]
    public void Same_seed_and_version_produce_identical_valid_editable_documents(
        GenerationMode mode
    )
    {
        var a = ProgramGenerator.Preview(Input(mode), Catalog);
        var b = ProgramGenerator.Preview(Input(mode), Catalog);
        Assert.True(a.Feasible, string.Join(';', a.Issues.Select(x => x.Message)));
        Assert.Equal(TrainingJson.Serialize(a), TrainingJson.Serialize(b));
        DocumentRules.Validate(a.Document!, new());
        Assert.All(
            DocumentRules.Prescriptions(a.Document!),
            p =>
            {
                Assert.Null(p.Load);
                Assert.Null(p.LoadPercent);
                Assert.Null(p.BaseValue);
                Assert.Null(p.LoadFormula);
            }
        );
        Assert.All(a.Durations, x => Assert.True(x.TotalSeconds <= 3600));
    }

    [Fact]
    public void Non_week_cycles_repeat_choices_with_bounded_progression_and_unique_node_ids()
    {
        var result = ProgramGenerator.Preview(Input(), Catalog);
        var cycles = result.Document!.Blocks[0].Cycles;
        Assert.All(
            cycles,
            cycle =>
            {
                Assert.Equal(10, cycle.DayCount);
                Assert.Equal([1, 4, 8], cycle.Days.Select(x => x.DayNumber));
            }
        );
        Assert.Equal(
            cycles[0].Days[0].Workouts[0].Exercises.Select(x => x.ExerciseId),
            cycles[2].Days[0].Workouts[0].Exercises.Select(x => x.ExerciseId)
        );
        Assert.Equal(
            cycles[0].Days[0].Workouts[0].Exercises[0].Sets[0].Prescription.Reps!.Maximum + 2,
            cycles[2].Days[0].Workouts[0].Exercises[0].Sets[0].Prescription.Reps!.Maximum
        );
        DocumentRules.Validate(result.Document, new());
    }

    [Fact]
    public void Equipment_exclusions_and_skills_are_enforced_even_for_locked_or_forged_selections()
    {
        var input = Input() with
        {
            Equipment = ["dumbbells", "incline-bench"],
            Skills = [],
            Level = GenerationLevel.Beginner,
        };
        var first = ProgramGenerator.Preview(input, Catalog);
        Assert.True(first.Feasible);
        Assert.All(
            first.Slots,
            slot =>
            {
                var metadata = Catalog.Exercises.Single(x => x.Id == slot.ExerciseId);
                Assert.Empty(metadata.RequiredSkills);
                Assert.Contains(
                    metadata.EquipmentAnyOf,
                    x => x.AllOf.All(input.Equipment.Contains)
                );
            }
        );
        var excluded = first.Slots[0].ExerciseId;
        var second = ProgramGenerator.Preview(
            input with
            {
                ExcludedExercises = [excluded],
            },
            Catalog
        );
        Assert.True(second.Feasible);
        Assert.DoesNotContain(second.Slots, x => x.ExerciseId == excluded);
        var forged = first.State! with
        {
            Input = input with { ExcludedExercises = [excluded] },
            LockedSlots = [first.Slots[0].Key],
        };
        Assert.False(ProgramGenerator.Restore(forged, Catalog).Feasible);
    }

    [Fact]
    public void Manual_only_and_unreviewed_exercises_are_never_selected()
    {
        var unrestricted = Input() with
        {
            Level = GenerationLevel.Advanced,
            Skills = ["olympic-lifting"],
        };
        Assert.DoesNotContain(
            ProgramGenerator.Eligible(unrestricted, Catalog, "squat"),
            x => x.Status == "manual-only"
        );
        var unreviewed = new GeneratorCatalog(
            "test",
            Catalog.Exercises.Select(x => x with { Reviewed = false }).ToArray()
        );
        Assert.Equal(
            "NO_ELIGIBLE_EXERCISE",
            ProgramGenerator.Preview(unrestricted, unreviewed).Issues[0].Code
        );
    }

    [Fact]
    public void Cardio_has_time_and_intensity_without_forced_repetitions()
    {
        var preview = ProgramGenerator.Preview(Input(GenerationMode.Cardio), Catalog);
        Assert.All(
            DocumentRules.Prescriptions(preview.Document!),
            p =>
            {
                Assert.NotNull(p.WorkTime);
                Assert.NotNull(p.Rpe);
                Assert.Null(p.Reps);
            }
        );
        Assert.Single(preview.Document!.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises[0].Sets);
    }

    [Fact]
    public void Too_short_time_returns_explicit_constraint_error_and_full_duration_components_are_counted()
    {
        var impossible = ProgramGenerator.Preview(Input() with { SessionMinutes = 10 }, Catalog);
        Assert.False(impossible.Feasible);
        Assert.Contains(impossible.Issues, x => x.Code == "TIME_BUDGET");
        var possible = ProgramGenerator.Preview(Input(), Catalog);
        Assert.All(
            possible.Durations,
            x =>
                Assert.Equal(
                    x.GeneralWarmupSeconds
                        + x.SpecificWarmupSeconds
                        + x.WorkSeconds
                        + x.RestSeconds
                        + x.SetupSeconds
                        + x.BufferSeconds,
                    x.TotalSeconds
                )
        );
    }

    [Fact]
    public void Equipment_anyof_allof_requires_actual_specialty_equipment()
    {
        var input = Input() with
        {
            Equipment = ["barbell", "plates", "bench", "full-gym", "kettlebell"],
        };
        Assert.DoesNotContain(
            ProgramGenerator.Eligible(input, Catalog, "press"),
            x => x.Name == "Barbell Bench Press"
        );
        Assert.Contains(
            ProgramGenerator.Eligible(input, Catalog, "squat"),
            x => x.Name == "Goblet Squat"
        );
    }

    [Fact]
    public void More_available_time_does_not_inflate_resistance_volume()
    {
        var regular = ProgramGenerator.Preview(Input(), Catalog);
        var longSession = ProgramGenerator.Preview(Input() with { SessionMinutes = 180 }, Catalog);
        Assert.Equal(
            DocumentRules.Sets(regular.Document!).Count(),
            DocumentRules.Sets(longSession.Document!).Count()
        );
        Assert.Equal(3, longSession.State!.SetsPerExercise);
    }

    [Fact]
    public void Short_session_tries_faster_eligible_alternatives_before_declaring_infeasible()
    {
        var input = new GenerationRequest(
            GenerationMode.Strength,
            GenerationLevel.Intermediate,
            30,
            7,
            [1],
            1,
            12,
            ["dumbbells", "incline-bench", "barbell", "plates", "rack-safeties", "bench"],
            ["hip-hinge", "barbell-squat", "barbell-bench", "front-rack", "push-up"],
            [],
            [],
            []
        );
        var preview = ProgramGenerator.Preview(input, Catalog);
        Assert.True(preview.Feasible);
        Assert.All(preview.Durations, duration => Assert.True(duration.TotalSeconds <= 1800));
        Assert.False(preview.State!.IncludeAccessory);
        Assert.Equal(2, preview.State.SetsPerExercise);
        Assert.Equal(
            TrainingJson.Serialize(preview),
            TrainingJson.Serialize(ProgramGenerator.Preview(input, Catalog))
        );
        Assert.All(
            preview.Slots,
            slot =>
                Assert.Contains(
                    ProgramGenerator.Eligible(input, Catalog, slot.Role),
                    exercise => exercise.Id == slot.ExerciseId
                )
        );
        Assert.All(
            DocumentRules.Prescriptions(preview.Document!),
            prescription => Assert.Equal(150, prescription.Rest!.Value)
        );
    }

    [Fact]
    public void Optional_accessory_exclusion_does_not_make_required_recipe_infeasible()
    {
        var excluded = Catalog.Exercises.Where(x => x.Role == "core").Select(x => x.Id).ToArray();
        var preview = ProgramGenerator.Preview(
            Input() with
            {
                ExcludedExercises = excluded,
            },
            Catalog
        );
        Assert.True(preview.Feasible);
        Assert.False(preview.State!.IncludeAccessory);
        Assert.Equal(3, preview.State.SetsPerExercise);
        Assert.All(
            DocumentRules.Prescriptions(preview.Document!),
            x => Assert.Equal(150, x.Rest!.Value)
        );
    }

    [Fact]
    public void Skill_requirement_and_level_must_both_match()
    {
        var beginner = Input() with { Level = GenerationLevel.Beginner };
        Assert.DoesNotContain(
            ProgramGenerator.Eligible(beginner, Catalog, "squat"),
            x => x.Name == "Barbell Back Squat"
        );
        Assert.Contains(
            ProgramGenerator.Eligible(
                beginner with
                {
                    Level = GenerationLevel.Intermediate,
                },
                Catalog,
                "squat"
            ),
            x => x.Name == "Barbell Back Squat"
        );
        Assert.DoesNotContain(
            ProgramGenerator.Eligible(Input() with { Skills = [] }, Catalog, "squat"),
            x => x.Name == "Barbell Back Squat"
        );
    }

    [Fact]
    public void Reshuffle_preserves_locked_slots_and_structure_and_replace_changes_only_one_slot()
    {
        var a = ProgramGenerator.Preview(Input(), Catalog);
        var lockedKey = a.Slots[0].Key;
        var shuffled = ProgramGenerator.Reshuffle(
            new(a.State! with { LockedSlots = [lockedKey] }, 987),
            Catalog
        );
        Assert.True(shuffled.Feasible);
        Assert.Equal(a.State!.Selections[lockedKey], shuffled.State!.Selections[lockedKey]);
        Assert.Equal(a.Slots.Select(x => x.Key), shuffled.Slots.Select(x => x.Key));
        Assert.Equal(a.Document!.Blocks[0].Id, shuffled.Document!.Blocks[0].Id);
        var key = a.Slots.First(x => x.Role == "core").Key;
        var replaced = ProgramGenerator.Replace(new(a.State, key, null, 99), Catalog);
        Assert.True(replaced.Feasible);
        Assert.NotEqual(a.State.Selections[key], replaced.State!.Selections[key]);
        Assert.All(
            a.State.Selections.Where(x => x.Key != key),
            entry => Assert.Equal(entry.Value, replaced.State.Selections[entry.Key])
        );
        var lockedReplace = ProgramGenerator.Replace(
            new(shuffled.State, lockedKey, null, 99),
            Catalog
        );
        Assert.Equal("LOCKED_SLOT", lockedReplace.Issues[0].Code);
    }

    [Fact]
    public void Dataset_change_blocks_stale_save_or_edit_and_missing_pool_is_honest()
    {
        var a = ProgramGenerator.Preview(Input(), Catalog);
        var changed = Catalog with { Exercises = Catalog.Exercises.Skip(1).ToArray() };
        Assert.Equal("DATASET_CHANGED", ProgramGenerator.Restore(a.State!, changed).Issues[0].Code);
        Assert.Equal(
            "NO_ELIGIBLE_EXERCISE",
            ProgramGenerator.Preview(Input(), new("empty", [])).Issues[0].Code
        );
    }

    [Fact]
    public void Invalid_input_and_unknown_slots_fail_without_null_reference_or_silent_ignoring()
    {
        Assert.False(
            ProgramGenerator.Preview(Input() with { DaySlots = [1, 1] }, Catalog).Feasible
        );
        Assert.False(ProgramGenerator.Preview(Input() with { Skills = null! }, Catalog).Feasible);
        var a = ProgramGenerator.Preview(Input(), Catalog);
        Assert.Equal(
            "UNKNOWN_SLOT",
            ProgramGenerator
                .Restore(a.State! with { LockedSlots = ["other"] }, Catalog)
                .Issues[0]
                .Code
        );
        Assert.Equal(
            "INVALID_STATE",
            ProgramGenerator.Restore(a.State! with { SetsPerExercise = 99 }, Catalog).Issues[0].Code
        );
    }
}
