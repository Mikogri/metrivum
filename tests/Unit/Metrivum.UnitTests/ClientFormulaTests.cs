using Metrivum.Training.Domain;
namespace Metrivum.UnitTests;
public sealed class ClientFormulaTests
{
    [Theory]
    [InlineData("oneRepMax", 100)]
    [InlineData("ROUND_TO_STEP(oneRepMax, 1)", 100)]
    [InlineData("oneRepMax * .8", 80)]
    [InlineData("ROUND_TO_STEP(oneRepMax * .813, 2.5)", 82.5)]
    public void Manual_one_rep_max_keeps_its_mass_unit(string expression, decimal expected)
    {
        var result = FormulaBindings.Evaluate(new(null, 1, null, new() { ["oneRepMax"] = new(100, Unit.Kg) }, expression), null, [], []);
        Assert.Equal(new Quantity(expected, Unit.Kg), result.Result);
    }

    [Fact] public void Inline_expression_resolves_real_client_inputs_and_versions()
    {
        var use = new FormulaUse(null, 1, null, [], Expression: "=maxBench1r*80%");
        var result = FormulaBindings.Evaluate(use, null, new() { ["maxBench1r"] = new(100, Unit.Kg) }, new() { ["maxBench1r"] = "metric:4" });
        Assert.Equal(new Quantity(80, Unit.Kg), result.Result);
        Assert.Equal("metric:4", result.SourceVersions!["maxBench1r"]);
    }
    [Fact] public void Saved_rule_bindings_override_no_explicit_input()
    {
        var use = new FormulaUse(null, 1, "percentage-1rm", new() { ["percentage"] = new(80, Unit.Percent) }, VariableBindings: new() { ["base1Rm"] = "maxBench1r" });
        var result = FormulaBindings.Evaluate(use, new("base1Rm*percentage", new() { ["base1Rm"] = Unit.Kg, ["percentage"] = Unit.Scalar }, Unit.Kg), new() { ["maxBench1r"] = new(100, Unit.Kg) }, new() { ["maxBench1r"] = "1" });
        Assert.Equal(80, result.Result.Value);
    }
    [Theory] [InlineData("bodyweight")] [InlineData("1alias")] [InlineData("MAX")] [InlineData("a b")]
    public void Reserved_or_invalid_aliases_fail(string alias) => Assert.Throws<TrainingValidationException>(() => FormulaBindings.ValidateAlias(alias));
    [Theory] [InlineData("=missing*80%")] [InlineData("=maxBench1r/0")]
    public void Missing_metrics_and_division_by_zero_fail(string expression) => Assert.Throws<TrainingValidationException>(() => FormulaBindings.Evaluate(new(null,1,null,[],expression), null, new() { ["maxBench1r"] = new(100,Unit.Kg) }, []));
    [Fact] public void Extreme_negative_input_is_validation_error_without_overflow()
    {
        Assert.Throws<TrainingValidationException>(() => FormulaBindings.Evaluate(new(null,1,null,new() { ["x"] = new(decimal.MinValue,Unit.Kg) },"x"),null,[],[]));
    }
    [Fact] public void Scalar_inline_load_is_kilograms()
    {
        Assert.Equal(new Quantity(64, Unit.Kg), FormulaBindings.Evaluate(new(null,1,null,[],"=80*0.8"),null,[],[]).Result);
    }
    [Fact] public void Direct_preview_can_use_concrete_inputs_without_claiming_client_source_versions()
    {
        var result = FormulaBindings.Evaluate(new(null,1,null,new() { ["maxBench1r"] = new(100,Unit.Kg) },"=maxBench1r*80%"),null,[],[]);
        Assert.Equal(80,result.Result.Value); Assert.Empty(result.SourceVersions!);
    }
    [Fact] public void Authoritative_client_source_overrides_supplied_alias_and_keeps_snapshot_values()
    {
        var variables = new Dictionary<string,Quantity> { ["maxBench1r"] = new(100,Unit.Kg) };
        var result = FormulaBindings.Evaluate(new(null,1,null,new() { ["maxBench1r"] = new(999,Unit.Kg) },"=maxBench1r*80%"),null,variables,new() { ["maxBench1r"] = "v1" });
        variables["maxBench1r"] = new(200,Unit.Kg);
        Assert.Equal(80,result.Result.Value); Assert.Equal(100,result.Inputs["maxBench1r"].Value);
        Assert.Equal("v1",result.SourceVersions!["maxBench1r"]);
    }
    [Fact] public void Manual_old_contract_remains_valid()
    {
        var result = FormulaBindings.Evaluate(new(null,1,"old",new() { ["x"] = new(10,Unit.Kg) }),new("x*80%",new() { ["x"] = Unit.Kg },Unit.Kg),[],[]);
        Assert.Equal(8,result.Result.Value); Assert.Empty(result.SourceVersions!);
    }
    [Theory]
    [InlineData("ROUND_TO_STEP_LOWER(oneRepMax_kg, 2.5)", 100, Unit.Kg)]
    [InlineData("round_to_step_lower(oneRepMax_kg, 2.5)", 100, Unit.Kg)]
    [InlineData("ROUND_TO_STEP_UPPER(oneRepMax_lb, 2.5)", 222.5, Unit.Lb)]
    public void Qualified_inputs_convert_the_same_source_without_mutating_it(string expression, decimal expected, Unit unit)
    {
        var alias = BlockMaxes.Alias(Guid.NewGuid(), 1);
        var name = expression.Contains("_lb") ? "oneRepMax_lb" : "oneRepMax_kg";
        var inputs = new Dictionary<string, Quantity> { [alias] = new(100, Unit.Kg) };
        var result = FormulaBindings.Evaluate(new(null, 1, null, [], expression, new() { [name] = alias }), null, inputs, new() { [alias] = "metric:1" });
        Assert.Equal(expected, result.Result.Value); Assert.Equal(unit, result.Result.Unit);
        Assert.Equal("metric:1", result.SourceVersions![alias]); Assert.Equal(100, inputs[alias].Value);
        var weight = FormulaBindings.Evaluate(new(null, 1, null, [], "weight_lb"), null, new() { ["weight"] = new(100, Unit.Kg) }, []);
        Assert.Equal(Unit.Lb, weight.Result.Unit);
    }
}
