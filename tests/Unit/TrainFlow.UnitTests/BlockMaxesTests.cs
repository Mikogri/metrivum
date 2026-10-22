using TrainFlow.Training.Domain;
namespace TrainFlow.UnitTests;

public sealed class BlockMaxesTests
{
    [Fact]
    public void Maxes_json_accepts_explicit_units_and_preserves_unfinished_formula_drafts()
    {
        var exercise = Guid.NewGuid();
        var draft = new TrainingDocument(1, [], [new(Guid.NewGuid(), null,
            [new(exercise, 1, new(100, Unit.Kg), LoadUnit: Unit.Kg),
             new(null, 5, LoadFormula: new(null, 1, null, [], "80 * ("), LoadUnit: Unit.Lb)])]);
        var restored = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(draft));
        DocumentRules.Validate(restored, new());
        Assert.Equal(Unit.Kg, restored.MaxesTables![0].Rows[0].LoadUnit);
        Assert.Equal("80 * (", restored.MaxesTables[0].Rows[1].LoadFormula!.Expression);
        Assert.Equal(Unit.Lb, restored.MaxesTables[0].Rows[1].LoadUnit);
    }

    [Fact]
    public void Constants_override_only_the_connected_block_and_only_the_recorded_rep_count()
    {
        var exercise = Guid.NewGuid();
        var single = BlockMaxes.Alias(exercise, 1); var five = BlockMaxes.Alias(exercise, 5);
        var athlete = new Dictionary<string, Quantity> { [single] = new(100, Unit.Kg), [five] = new(80, Unit.Kg), ["hrMax"] = new(190, Unit.Scalar) };
        var a = new Block(Guid.NewGuid(), "A", "", [], [new(exercise, 5, new(90, Unit.Kg))]);
        var b = new Block(Guid.NewGuid(), "B", "", []);
        Assert.Equal(90, BlockMaxes.Variables(a, athlete)[five].Value);
        Assert.Equal(100, BlockMaxes.Variables(a, athlete)[single].Value);
        Assert.Equal(190, BlockMaxes.Variables(a, athlete)["hrMax"].Value);
        Assert.Equal(80, BlockMaxes.Variables(b, athlete)[five].Value);
        Assert.Equal(80, athlete[five].Value);
        var use = new FormulaUse(null, 1, null, [], "repMax*.8", new() { ["repMax"] = single });
        var scoped = BlockMaxes.Scope(use, exercise, a);
        Assert.Equal(five, scoped.VariableBindings!["repMax"]);
        Assert.Equal(single, use.VariableBindings!["repMax"]);
        Assert.Equal(72, FormulaBindings.Evaluate(scoped, null, BlockMaxes.Variables(a, athlete), []).Result.Value);
    }

    [Fact]
    public void A_blank_load_keeps_the_variable_and_never_invents_a_max()
    {
        var id = Guid.NewGuid(); var alias = BlockMaxes.Alias(id, 1);
        var block = new Block(Guid.NewGuid(), "A", "", [], [new(id, 1)]);
        Assert.Empty(BlockMaxes.Variables(block, new Dictionary<string, Quantity>()));
        Assert.False(BlockMaxes.Resolved(new(null, 1, null, [], "oneRepMax", new() { ["oneRepMax"] = alias }), []));
        Assert.Equal(120, BlockMaxes.Variables(block, new Dictionary<string, Quantity> { [alias] = new(120, Unit.Kg) })[alias].Value);
    }

    [Fact]
    public void Rows_are_bounded_and_unambiguous_but_incomplete_drafts_are_allowed()
    {
        var id = Guid.NewGuid();
        BlockMaxes.Validate([new(null, 1)]);
        Assert.Throws<TrainingValidationException>(() => BlockMaxes.Validate([new(id, 1), new(id, 5)]));
        Assert.Throws<TrainingValidationException>(() => BlockMaxes.Validate([new(id, 0)]));
        Assert.Throws<TrainingValidationException>(() => BlockMaxes.Validate([new(id, 1, new(10, Unit.Seconds))]));
    }
    [Fact]
    public void Detached_tables_persist_and_only_an_explicit_connection_enables_their_values()
    {
        var a = new Block(Guid.NewGuid(), "A", "", []); var b = a with { Id = Guid.NewGuid() };
        var exercise = Guid.NewGuid(); var table = new ExerciseMaxesTable(Guid.NewGuid(), null, [new(exercise, 1, new(120, Unit.Kg))]);
        var draft = new TrainingDocument(1, [a, b], [table]);
        DocumentRules.Validate(draft, new());
        var restored = TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(draft));
        Assert.Empty(BlockMaxes.Variables(BlockMaxes.Effective(restored, a), new Dictionary<string, Quantity>()));
        var connected = draft with { MaxesTables = [table with { BlockId = a.Id }] };
        Assert.Equal(120, BlockMaxes.Variables(BlockMaxes.Effective(connected, a), new Dictionary<string, Quantity>())[BlockMaxes.Alias(exercise, 1)].Value);
        Assert.Empty(BlockMaxes.Variables(BlockMaxes.Effective(connected, b), new Dictionary<string, Quantity>()));
        var copy = DocumentRules.Copy(connected);
        Assert.NotEqual(table.Id, copy.MaxesTables![0].Id);
        Assert.Equal(copy.Blocks[0].Id, copy.MaxesTables[0].BlockId);
        Assert.Equal(exercise, copy.MaxesTables[0].Rows[0].ExerciseId);
        DocumentRules.Validate(copy, new());
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(draft with { MaxesTables = [table with { BlockId = Guid.NewGuid() }] }, new()));
        Assert.Throws<TrainingValidationException>(() => DocumentRules.Validate(connected with { MaxesTables = [connected.MaxesTables![0], table with { Id = Guid.NewGuid(), BlockId = a.Id }] }, new()));
    }
}
