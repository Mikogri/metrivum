using Metrivum.Training.Domain;

namespace Metrivum.UnitTests;

public sealed class TrainingFormulaTests
{
    [Theory]
    [InlineData("base1Rm * 0.8", 80)]
    [InlineData("ROUND_TO_STEP_LOWER(base1Rm * .813, 2.5)", 80)]
    [InlineData("ROUND_TO_STEP_UPPER(base1Rm * .813, 2.5)", 82.5)]
    [InlineData("ROUND_TO_STEP_LOWER(-base1Rm * .813, 2.5 kg)", -82.5)]
    [InlineData("ROUND_TO_STEP_UPPER(-base1Rm * .813, 2.5 kg)", -80)]
    [InlineData("ROUND_TO_STEP(base1Rm * 0.813, 2.5 kg)", 82.5)]
    [InlineData("ROUND_TO_STEP(base1Rm * 0.813, 2.5)", 82.5)]
    [InlineData("MIN(base1Rm, 95 kg)", 95)]
    [InlineData("AVG(80 kg, base1Rm)", 90)]
    [InlineData("IF(base1Rm > 90 kg, 85 kg, 70 kg)", 85)]
    public void Evaluates_typed_training_expressions(string expression, decimal expected)
    {
        var result = new FormulaEngine().Evaluate(
            expression,
            new Dictionary<string, Quantity> { ["base1Rm"] = new(100, Unit.Kg) }
        );
        Assert.Equal(expected, result.Value);
        Assert.Equal(Unit.Kg, result.Unit);
    }

    [Theory]
    [InlineData("missing + 5 kg")]
    [InlineData("10 kg + 2 s")]
    [InlineData("1 / 0")]
    [InlineData("System.IO.File.ReadAllText('x')")]
    [InlineData("ROUND_TO_STEP(10 kg, 0 kg)")]
    [InlineData("IF(1, 2 kg, 3 s)")]
    public void Rejects_invalid_inputs_units_and_execution(string expression) =>
        Assert.Throws<TrainingValidationException>(() =>
            new FormulaEngine().Evaluate(expression, new Dictionary<string, Quantity>())
        );

    [Fact]
    public void Converts_mass_units_before_addition() =>
        Assert.Equal(
            2m,
            new FormulaEngine()
                .Evaluate("1 kg + 2.2046226218487757 lb", new Dictionary<string, Quantity>())
                .Value,
            10
        );

    [Fact]
    public void Rounds_midpoints_away_from_zero() =>
        Assert.Equal(
            -2.5m,
            new FormulaEngine()
                .Evaluate("ROUND_TO_STEP(-1.25 kg, 2.5 kg)", new Dictionary<string, Quantity>())
                .Value
        );

    [Fact]
    public void Rejects_excessive_depth_and_cyclic_dependencies()
    {
        var engine = new FormulaEngine(new FormulaLimits { MaximumDepth = 4 });
        Assert.Throws<TrainingValidationException>(() =>
            engine.Evaluate("((((((1))))))", new Dictionary<string, Quantity>())
        );
        Assert.Throws<TrainingValidationException>(() =>
            engine.EvaluateGraph(
                new Dictionary<string, string> { ["a"] = "b + 1", ["b"] = "a + 1" },
                new Dictionary<string, Quantity>()
            )
        );
    }

    [Fact]
    public void Evaluates_dependency_graph_in_dependency_order()
    {
        var actual = new FormulaEngine().EvaluateGraph(
            new Dictionary<string, string> { ["backOff"] = "top * .85", ["top"] = "base * .9" },
            new Dictionary<string, Quantity> { ["base"] = new(100, Unit.Kg) }
        );
        Assert.Equal(new Quantity(76.5m, Unit.Kg), actual["backOff"]);
    }

    [Fact]
    public void Definition_validation_checks_types_without_guessing_runtime_inputs()
    {
        new FormulaEngine().Validate(
            "base / (factor - 1)",
            new Dictionary<string, Unit> { ["base"] = Unit.Kg, ["factor"] = Unit.Scalar },
            Unit.Kg
        );
        new FormulaEngine().Validate(
            "base / (factor > 1)",
            new Dictionary<string, Unit> { ["base"] = Unit.Kg, ["factor"] = Unit.Scalar },
            Unit.Kg
        );
        Assert.Throws<TrainingValidationException>(() =>
            new FormulaEngine().Validate(
                "base + duration",
                new Dictionary<string, Unit> { ["base"] = Unit.Kg, ["duration"] = Unit.Seconds },
                Unit.Kg
            )
        );
    }

    [Fact]
    public void Graph_operation_budget_is_global()
    {
        var engine = new FormulaEngine(new FormulaLimits { MaximumOperations = 8 });
        Assert.Throws<TrainingValidationException>(() =>
            engine.EvaluateGraph(
                new Dictionary<string, string> { ["a"] = "1 + 2 + 3", ["b"] = "a + 4 + 5" },
                new Dictionary<string, Quantity>()
            )
        );
    }
}
