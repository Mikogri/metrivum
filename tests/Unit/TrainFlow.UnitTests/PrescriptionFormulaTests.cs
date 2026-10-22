using TrainFlow.Training.Domain;

namespace TrainFlow.UnitTests;

public sealed class PrescriptionFormulaTests
{
    [Theory]
    [InlineData("Scalar", "3 + 2", 5)]
    [InlineData("Seconds", "2 min + 15 s", 135)]
    public void Typed_formulas_evaluate_without_mass_coercion(string output, string expression, decimal expected)
    {
        var unit = Enum.Parse<Unit>(output);
        var value = FormulaBindings.Evaluate(new(null, 1, null, [], expression, OutputUnit: unit), null, [], []);
        Assert.Equal(new Quantity(expected, unit), value.Result);
        Assert.Throws<TrainingValidationException>(() => FormulaBindings.Evaluate(new(null, 1, null, [], "10 kg", OutputUnit: unit), null, [], []));
    }
    [Fact]
    public void Fields_freeze_in_delivered_and_purchased_workouts_without_mutating_the_source()
    {
        var set = new TrainingSet(Guid.NewGuid(), SetKind.Standard, new(FieldFormulas: new()
        {
            ["Sets"] = new(null, 1, null, [], "3"), ["Reps"] = new(null, 1, null, [], "5")
        }));
        var workout = new Workout(Guid.NewGuid(), "A", "", [new(Guid.NewGuid(), Guid.NewGuid(), "", [set])], []);
        var evaluations = new Dictionary<Guid, FormulaEvaluation> { [set.Id] = new("", 1, [], new(0, Unit.Kg), FieldValues: new()
        {
            ["Sets"] = new(3, Unit.Scalar), ["Reps"] = new(5, Unit.Scalar), ["WorkTime"] = new(45, Unit.Seconds), ["Rest"] = new(90, Unit.Seconds)
        }) };
        var frozen = PrescriptionFormulas.Freeze(workout, evaluations);
        Assert.Equal(3, frozen.Exercises[0].Sets.Length);
        Assert.Equal(3, frozen.Exercises[0].Sets.Select(s => s.Id).Distinct().Count());
        Assert.Equal(frozen.Exercises[0].Sets.Select(s => s.Id), PrescriptionFormulas.Freeze(workout, evaluations).Exercises[0].Sets.Select(s => s.Id));
        Assert.All(frozen.Exercises[0].Sets, s =>
        {
            Assert.Equal(new IntRange(5, 5), s.Prescription.Reps);
            Assert.Equal(new Quantity(45, Unit.Seconds), s.Prescription.WorkTime);
            Assert.Equal(new Quantity(90, Unit.Seconds), s.Prescription.Rest);
            Assert.Null(s.Prescription.Load);
            Assert.Null(s.Prescription.FieldFormulas);
        });
        Assert.Single(workout.Exercises[0].Sets);
        Assert.NotNull(set.Prescription.FieldFormulas);
        Assert.Throws<TrainingValidationException>(() => PrescriptionFormulas.ValidateValue("Sets", new(2.5m, Unit.Scalar)));
        Assert.Throws<TrainingValidationException>(() => PrescriptionFormulas.ValidateValue("Rest", new(5, Unit.Kg)));
    }
    [Fact]
    public void An_individual_formula_does_not_overwrite_other_literal_sets()
    {
        var first = new TrainingSet(Guid.NewGuid(), SetKind.Standard, new());
        var second = new TrainingSet(Guid.NewGuid(), SetKind.Standard, new(Reps: new(7, 7)));
        var workout = new Workout(Guid.NewGuid(), "A", "", [new(Guid.NewGuid(), Guid.NewGuid(), "", [first, second])], []);
        var frozen = PrescriptionFormulas.Freeze(workout, new Dictionary<Guid, FormulaEvaluation> { [first.Id] = new("", 1, [], new(5, Unit.Scalar), FieldValues: new() { ["Reps"] = new(5, Unit.Scalar) }) });
        Assert.Equal(new IntRange(5, 5), frozen.Exercises[0].Sets[0].Prescription.Reps);
        Assert.Equal(new IntRange(7, 7), frozen.Exercises[0].Sets[1].Prescription.Reps);
        Assert.Throws<TrainingValidationException>(() => FormulaBindings.ValidateAlias(BlockMaxes.TimeAlias(Guid.NewGuid(), 1)));
    }

    [Fact]
    public void Time_maxima_are_block_scoped_and_cannot_be_used_as_mass()
    {
        var exercise = Guid.NewGuid();
        var block = new Block(Guid.NewGuid(), "A", "", [], [new(exercise, 1, Time: new(2, Unit.Minutes))]);
        BlockMaxes.Validate(block.ExerciseMaxes);
        var variables = BlockMaxes.Variables(block, new Dictionary<string, Quantity>());
        var use = new FormulaUse(null, 1, null, [], "maxTime_s / 2", new() { ["maxTime_s"] = BlockMaxes.TimeAlias(exercise, 1) }, Unit.Seconds);
        Assert.Equal(new Quantity(60, Unit.Seconds), FormulaBindings.Evaluate(use, null, variables, []).Result);
        Assert.Throws<TrainingValidationException>(() => FormulaBindings.Evaluate(use with { OutputUnit = Unit.Kg }, null, variables, []));
        Assert.False(variables.ContainsKey(BlockMaxes.Alias(exercise, 1)));
    }
}
