namespace TrainFlow.Training.Domain;

public static class BlockMaxes
{
    public static IEnumerable<BlockExerciseMax> Rows(TrainingDocument document) => document.Blocks.SelectMany(b => b.ExerciseMaxes ?? []).Concat((document.MaxesTables ?? []).SelectMany(t => t.Rows));

    public static Block Effective(TrainingDocument document, Block block) => block with { ExerciseMaxes = document.MaxesTables?.SingleOrDefault(t => t.BlockId == block.Id)?.Rows ?? block.ExerciseMaxes };

    public static string TimeAlias(Guid exerciseId, int reps) => $"exerciseTime{reps}Rm_{exerciseId:N}";

    public static string Alias(Guid exerciseId, int reps) => $"exercise{reps}Rm_{exerciseId:N}";

    public static void Validate(BlockExerciseMax[]? rows)
    {
        if (rows == null) return;
        if (rows.Length > 64) throw new TrainingValidationException("Maximum 64 block exercise maxes.");
        var exercises = new HashSet<Guid>();
        foreach (var row in rows)
        {
            if (row == null || row.Reps is < 1 or > 100 || row.ExerciseId == Guid.Empty || row.ExerciseId is { } id && !exercises.Add(id))
                throw new TrainingValidationException("Invalid or duplicate block exercise max.");
            DocumentRules.ValidatePrescription(new(Load: row.Load == null ? null : new(row.Load, row.Load), LoadFormula: row.LoadFormula, LoadUnit: row.LoadUnit));
            if (row.Time != null && row.TimeFormula != null) throw new TrainingValidationException("Max time and formula are mutually exclusive.");
            if (row.Time is { } time && (Quantity.Dimension(time.Unit) != "time" || time.Value <= 0 || time.In(Unit.Seconds) > 86400)) throw new TrainingValidationException("Invalid exercise max time.");
            if (row.TimeFormula is { } timeFormula) DocumentRules.ValidatePrescription(new(LoadFormula: timeFormula));
            if (row.Load is { } load && (!Enum.IsDefined(load.Unit) || Quantity.Dimension(load.Unit) != "mass" || load.Value <= 0 || load.In(Unit.Kg) > 100000))
                throw new TrainingValidationException("Invalid block exercise max load.");
        }
    }

    public static Dictionary<string, Quantity> Variables(Block block, IReadOnlyDictionary<string, Quantity> current)
    {
        var result = new Dictionary<string, Quantity>(current, StringComparer.Ordinal);
        foreach (var row in block.ExerciseMaxes ?? [])
            if (row.ExerciseId is { } id)
            {
                if (row.Load is { } load) result[Alias(id, row.Reps)] = load;
                if (row.Time is { } time) result[TimeAlias(id, row.Reps)] = time;
            }
        return result;
    }

    public static FormulaUse Scope(FormulaUse use, Guid exerciseId, Block block)
    {
        var row = block.ExerciseMaxes?.SingleOrDefault(x => x.ExerciseId == exerciseId);
        if (row == null || use.VariableBindings == null) return use;
        return use with { VariableBindings = use.VariableBindings.ToDictionary(x => x.Key, x => FormulaBindings.Qualified(x.Key).Name == "repMax" ? Alias(exerciseId, row.Reps) : x.Value) };
    }

    public static bool Resolved(FormulaUse use, Dictionary<string, Quantity> variables) =>
        (use.VariableBindings ?? []).All(b => (variables.ContainsKey(b.Value) || variables.ContainsKey(FormulaBindings.Qualified(b.Value).Name))) &&
        (use.Expression == null || FormulaBindings.Names(use.Expression).All(n => use.Inputs.ContainsKey(n) || use.VariableBindings?.ContainsKey(n) == true || (variables.ContainsKey(n) || variables.ContainsKey(FormulaBindings.Qualified(n).Name))));
}
