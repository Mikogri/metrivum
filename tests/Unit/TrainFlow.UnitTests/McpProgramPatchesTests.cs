using TrainFlow.BuildingBlocks;
using TrainFlow.Training.Contracts;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Features;

namespace TrainFlow.UnitTests;

public sealed class McpProgramPatchesTests
{
    [Fact]
    public void Set_change_preserves_untouched_hierarchy_comments_and_formula_inputs()
    {
        var document = Document();
        var workout = document.Blocks[0].Cycles[0].Days[0].Workouts[0];
        var exercise = workout.Exercises[0];
        var original = exercise.Sets[0];
        var replacement = original with { Prescription = original.Prescription with { Reps = new(8, 10) } };
        var changed = McpProgramPatches.Apply(document, [new(workout.Id, ExerciseChanges:
            [new(exercise.Id, SetChanges: [new(original.Id, replacement)])])]);
        var result = changed.Blocks[0].Cycles[0].Days[0].Workouts[0];
        Assert.Equal(replacement, result.Exercises[0].Sets[0]);
        Assert.Same(exercise.Sets[1], result.Exercises[0].Sets[1]);
        Assert.Same(workout.Exercises[1], result.Exercises[1]);
        Assert.Equal(TrainingJson.Serialize(document.Blocks[0].Cycles[0].Days[1]), TrainingJson.Serialize(changed.Blocks[0].Cycles[0].Days[1]));
        Assert.Equal(document.Blocks[0].Id, changed.Blocks[0].Id);
        Assert.Equal("rest day", changed.Blocks[0].Cycles[0].Days[1].Note);
        var domain = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(changed));
        DocumentRules.Validate(domain, new());
        Assert.Equal(100m, domain.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises[0].Sets[0].Prescription.LoadFormula!.Inputs["base1Rm"].Value);
    }

    [Fact]
    public void Reorder_preserves_nodes_and_rejects_missing_duplicate_and_foreign_targets()
    {
        var document = Document();
        var workout = document.Blocks[0].Cycles[0].Days[0].Workouts[0];
        var order = workout.Exercises.Select(x => x.Id).Reverse().ToArray();
        var changed = McpProgramPatches.Apply(document, [new(workout.Id, ExerciseOrder: order)]);
        Assert.Equal(order, changed.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises.Select(x => x.Id));
        Assert.Throws<ApiException>(() => McpProgramPatches.Apply(document, [new(workout.Id, ExerciseOrder: [order[0]])]));
        Assert.Throws<ApiException>(() => McpProgramPatches.Apply(document, [new(workout.Id, ExerciseOrder: [order[0], order[0]])]));
        Assert.Throws<ApiException>(() => McpProgramPatches.Apply(document, [new(Guid.NewGuid(), Name: "Foreign")]));
        Assert.Throws<ApiException>(() => McpProgramPatches.Apply(document, [new(workout.Id, ExerciseChanges: [new(Guid.NewGuid(), Comment: "Foreign")])]));
    }

    [Fact]
    public void Typed_document_round_trip_retains_units_and_segment_structure()
    {
        var document = Document();
        var domain = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(document));
        var roundtrip = TrainingJson.Deserialize<McpTrainingDocument>(TrainingJson.Serialize(domain));
        Assert.Equal(TrainingJson.Serialize(document), TrainingJson.Serialize(roundtrip));
    }

    private static McpTrainingDocument Document()
    {
        var prescription = new McpPrescription(Reps: new(5, 5), Rest: new(120, McpUnit.Seconds),
            LoadFormula: new(null, 1, "percentage-1rm", new() { ["base1Rm"] = new(100, McpUnit.Kg), ["percentage"] = new(.8m, McpUnit.Scalar) }));
        var exercises = new[] {
            new McpExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "keep cue", [new(Guid.NewGuid(), McpSetKind.Standard, prescription), new(Guid.NewGuid(), McpSetKind.Standard, prescription)]),
            new McpExerciseInstance(Guid.NewGuid(), Guid.NewGuid(), "unchanged", [new(Guid.NewGuid(), McpSetKind.Cluster, new(), [new(Guid.NewGuid(), new(Reps: new(2, 2))), new(Guid.NewGuid(), new(Reps: new(2, 2)))])]) };
        return new(1, [new(Guid.NewGuid(), "Block", "block notes", [new(Guid.NewGuid(), "Cycle", "cycle notes", 7,
            [new(Guid.NewGuid(), 1, [new(Guid.NewGuid(), "Workout", "workout notes", exercises, [])]), new(Guid.NewGuid(), 2, [], "rest day")])])]);
    }
}
