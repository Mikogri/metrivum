using Metrivum.Training.Domain;

namespace Metrivum.UnitTests;

public sealed class TrainingDocumentTests
{
    [Theory]
    [InlineData(SetKind.Warmup)]
    [InlineData(SetKind.BackOff)]
    public void Basic_set_markers_do_not_require_advanced_structures(SetKind kind)
    {
        var document = Example();
        var workout = document.Blocks[0].Cycles[0].Days[0].Workouts[0];
        var exercise = workout.Exercises[0];
        exercise.Sets[0] = exercise.Sets[0] with { Kind = kind };
        DocumentRules.Validate(document, new());
        Assert.False(DocumentRules.IsAdvancedSet(kind));
    }

    [Fact]
    public void An_explicit_back_off_source_still_has_to_be_an_earlier_top_set()
    {
        var document = Example();
        var workout = document.Blocks[0].Cycles[0].Days[0].Workouts[0];
        workout.Exercises[0].Sets[0] = workout.Exercises[0].Sets[0] with { Kind = SetKind.BackOff, SourceSetId = Guid.NewGuid() };
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(document, new()));
    }
    [Fact]
    public void A_plan_needs_no_named_blocks_or_cycles_when_they_only_hold_a_cycle_or_a_workout()
    {
        var example = Example().Blocks[0];
        var cycle = example.Cycles[0];
        var lone = cycle with { Id = Guid.NewGuid(), Name = "", DayCount = 1, Repeats = 1, Implicit = true, Days = [cycle.Days[0] with { Id = Guid.NewGuid(), DayNumber = 1, Workouts = [DocumentRules.Copy(Example()).Blocks[0].Cycles[0].Days[0].Workouts[0]] }] };
        var document = new TrainingDocument(1, [
            example with { Name = "", Implicit = true },
            new Block(Guid.NewGuid(), "", "", [lone], Implicit: true),
        ]);
        DocumentRules.Validate(document, new());
        var roundTrip = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(document));
        Assert.True(roundTrip.Blocks[1].Implicit);
        Assert.True(roundTrip.Blocks[1].Cycles[0].Implicit);
        Assert.DoesNotContain("implicit", TrainingJson.Serialize(Example()));
        // The lone workout runs once and leaves the other cycle the plan's only one, open until stopped.
        Assert.Equal(1, DocumentRules.RunsOf(document, lone));
        Assert.True(DocumentRules.RunsOf(document, example.Cycles[0] with { Repeats = null }) > 1);
        // A block the coach made still needs a name.
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(document with { Blocks = [example with { Name = "" }] }, new()));
    }

    [Fact]
    public void Rejects_day_outside_non_week_cycle()
    {
        var document = Example() with
        {
            Blocks = [new Block(Guid.NewGuid(), "Block", "", [new Cycle(Guid.NewGuid(), "Cycle", "", 5, [new TrainingDay(Guid.NewGuid(), 6, [])])])]
        };
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(document, new()));
    }

    [Fact]
    public void Applying_leaves_out_inactive_blocks_and_what_is_tied_to_them()
    {
        var active = Example().Blocks[0];
        var inactive = active with { Id = Guid.NewGuid(), Name = "Off", Cycles = [active.Cycles[0] with { Id = Guid.NewGuid(), Days = [] }], Inactive = true };
        var note = new PlanAnnotation(Guid.NewGuid(), AnnotationKind.Comment, "Note", "", inactive.Id);
        var global = new PlanAnnotation(Guid.NewGuid(), AnnotationKind.Goal, "Goal", "");
        var document = new TrainingDocument(1, [active, inactive], [new(Guid.NewGuid(), inactive.Id, [])], [global, note]);
        var applied = DocumentRules.ActiveOnly(document);
        Assert.Equal([active.Id], applied.Blocks.Select(b => b.Id));
        Assert.Equal([global.Id], applied.Annotations!.Select(n => n.Id));
        Assert.Empty(applied.MaxesTables!);
        var plain = Example();
        Assert.Same(plain, DocumentRules.ActiveOnly(plain));
        Assert.DoesNotContain("inactive", TrainingJson.Serialize(applied), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Drafts_keep_wrong_formats_that_applying_refuses()
    {
        var instance = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(Guid.NewGuid(), SetKind.Ramp, new(Reps: new(8, 5), Rpe: 8, Rir: 2, Tempo: "fast"))]);
        var document = new TrainingDocument(1, [new(Guid.NewGuid(), "", "", [new(Guid.NewGuid(), "", "", 7, [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "", "", [instance], [])])])])]);
        DocumentRules.ValidateDraft(document, new());
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(document, new()));
        var unbounded = document with { Blocks = [document.Blocks[0] with { Cycles = [document.Blocks[0].Cycles[0] with { DayCount = 10_000 }] }] };
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateDraft(unbounded, new()));
    }

    [Fact]
    public void Rejects_conflicting_load_and_rpe_rir()
    {
        var set = new TrainingSet(Guid.NewGuid(), SetKind.Standard, new Prescription(Reps: new(5, 5), Load: new(new(80, Unit.Kg), new(90, Unit.Kg)), LoadPercent: 80));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(set));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(set with { Prescription = new(Rpe: 8, Rir: 2) }));
    }

    [Fact]
    public void Rejects_reversed_ranges_and_non_mass_loads()
    {
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(new(Guid.NewGuid(), SetKind.Standard, new(Reps: new(8, 5)))));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(new(Guid.NewGuid(), SetKind.Standard, new(Load: new(new(8, Unit.Seconds), new(8, Unit.Seconds))))));
    }

    [Fact]
    public void Rejects_segments_in_standard_set_and_missing_drop_segments()
    {
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(new(Guid.NewGuid(), SetKind.Standard, new(), [new(Guid.NewGuid(), new(Reps: new(5, 5)))])));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidateSet(new(Guid.NewGuid(), SetKind.DropSet, new())));
    }

    [Fact]
    public void Clone_rewrites_internal_ids_and_group_references()
    {
        var original = Example();
        var copied = DocumentRules.Copy(original);
        Assert.NotEqual(original.Blocks[0].Id, copied.Blocks[0].Id);
        var before = original.Blocks[0].Cycles[0].Days[0].Workouts[0];
        var after = copied.Blocks[0].Cycles[0].Days[0].Workouts[0];
        Assert.NotEqual(before.Exercises[0].Id, after.Exercises[0].Id);
        Assert.Equal(before.Exercises[0].ExerciseId, after.Exercises[0].ExerciseId);
        Assert.Equal(after.Exercises.Select(e => e.Id), after.Groups[0].ExerciseIds);
        DocumentRules.Validate(copied, new());
    }

    [Fact]
    public void Folder_move_rejects_descendant_cycle()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        Assert.Throws<TrainingValidationException>(() => FolderRules.ValidateMove(a, b, new Dictionary<Guid, Guid?> { [a] = null, [b] = a }, 16));
    }

    [Fact]
    public void Rejects_explicit_null_required_text_before_export()
    {
        var document = Example();
        document.Blocks[0] = document.Blocks[0] with
        {
            Description = null!
        };
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(document, new()));
    }

    [Fact]
    public void Extremely_negative_formula_input_is_validation_error_not_numeric_overflow()
    {
        var prescription = new Prescription(LoadFormula: new(null, 1, "percentage-1rm", new()
        {
            ["base1Rm"] = new(decimal.MinValue, Unit.Kg)
        }));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.ValidatePrescription(prescription));
    }

    public static TrainingDocument Example()
    {
        var a = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(Guid.NewGuid(), SetKind.Standard, new(Reps: new(5, 5), Load: new(new(80, Unit.Kg), new(80, Unit.Kg))))]);
        var b = new ExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "", [new(Guid.NewGuid(), SetKind.Amrap, new(LoadPercent: 50, BaseValue: new(100, Unit.Kg)))]);
        return new(1, [new(Guid.NewGuid(), "Block", "", [new(Guid.NewGuid(), "Cycle", "", 9, [new(Guid.NewGuid(), 2, [new(Guid.NewGuid(), "Workout", "", [a, b], [new(Guid.NewGuid(), GroupKind.Superset, [a.Id, b.Id], 3, 60)])])])])]);
    }
}
