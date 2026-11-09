using Metrivum.Training.Infrastructure;
using System.Text.RegularExpressions;
namespace Metrivum.Training.Domain;

/// <summary>Resolves formula inputs from explicit values and authorized client/block snapshots without updating their sources.</summary>
public static class FormulaBindings
{
    public static (string Name, Unit? Unit) Qualified(string name) => name.EndsWith("_kg", StringComparison.Ordinal) ? (name[..^3], Unit.Kg) : name.EndsWith("_lb", StringComparison.Ordinal) ? (name[..^3], Unit.Lb) : name.EndsWith("_min", StringComparison.Ordinal) ? (name[..^4], Unit.Minutes) : name.EndsWith("_s", StringComparison.Ordinal) ? (name[..^2], Unit.Seconds) : (name, null);
    public static readonly string[] ProfileNames = ["weight", "bodyweight", "bodyWeight", "height", "hrMax"];
    public static void Identifier(string name)
    {
        if (name == null || !Regex.IsMatch(name, "\\A[A-Za-z_][A-Za-z0-9_]{0,79}\\z", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)))
            throw new TrainingValidationException("Invalid variable identifier.");
    }
    public static void ValidateAlias(string name)
    {
        Identifier(name);
        if (Qualified(name).Unit != null) throw new TrainingValidationException("Unit suffixes are reserved for converted variables.");
        if (Regex.IsMatch(name, @"\Aexercise(?:Time)?[0-9]+Rm_", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant) || (name.Equals("oneRepMax", StringComparison.OrdinalIgnoreCase) || name.Equals("repMax", StringComparison.OrdinalIgnoreCase) || name.Equals("maxTime", StringComparison.OrdinalIgnoreCase)) || ProfileNames.Contains(name, StringComparer.OrdinalIgnoreCase) || new[] { "MIN", "MAX", "AVG", "IF", "ROUND_TO_STEP", "ROUND_TO_STEP_LOWER", "ROUND_TO_STEP_UPPER", "kg", "lb", "s", "min", "m", "km" }.Contains(name, StringComparer.OrdinalIgnoreCase))
            throw new TrainingValidationException("This variable name is reserved.");
    }
    public static bool NeedsClient(FormulaUse use) => use.VariableBindings?.Count > 0 || use.Expression != null && Names(use.Expression).Any(n => !use.Inputs.ContainsKey(n));
    public static string[] Names(string expression) => Regex.Matches(expression, @"\b[A-Za-z_][A-Za-z0-9_]*\b", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50))
        .Select(m => m.Value).Where(n => !new[] { "MIN", "MAX", "AVG", "IF", "ROUND_TO_STEP", "ROUND_TO_STEP_LOWER", "ROUND_TO_STEP_UPPER", "kg", "lb", "s", "min", "m", "km" }.Contains(n, StringComparer.OrdinalIgnoreCase)).Distinct().ToArray();
    public static FormulaEvaluation Evaluate(FormulaUse use, FormulaDefinition? definition, Dictionary<string, Quantity> variables, Dictionary<string, string> versions, FormulaEngine? engine = null, bool typesOnly = false)
    {
        DocumentRules.ValidatePrescription(new(LoadFormula: use));
        engine ??= new();
        var expression = (use.Expression ?? definition?.Expression ?? throw new TrainingValidationException("Formula definition is missing.")).TrimStart();
        if (expression.StartsWith('=')) expression = expression[1..];
        var inputs = new Dictionary<string, Quantity>(use.Inputs, StringComparer.Ordinal);
        var sources = new Dictionary<string, string>(StringComparer.Ordinal);
        void Bind(string input, string alias, Unit? expected = null)
        {
            var qualified = Qualified(input);
            var source = variables.ContainsKey(alias) ? alias : Qualified(alias).Name;
            if (!variables.TryGetValue(source, out var value))
            {
                if (!typesOnly) throw new TrainingValidationException($"Missing client variable: {alias}.");
                value = new(1, expected ?? (qualified.Unit ?? (source is "height" or "hrMax" ? Unit.Scalar : source.StartsWith("exerciseTime", StringComparison.Ordinal) ? Unit.Seconds : use.OutputUnit ?? Unit.Kg)));
            }
            inputs[input] = qualified.Unit is { } unit ? new(value.In(unit), unit) : value;
            if (versions.TryGetValue(source, out var version)) sources[source] = version;
        }
        foreach (var binding in use.VariableBindings ?? []) Bind(binding.Key, binding.Value, definition?.Inputs.GetValueOrDefault(binding.Key));
        if (use.Expression != null)
            foreach (var name in Names(expression))
                if (variables.ContainsKey(name) || !inputs.ContainsKey(name)) Bind(name, Qualified(name).Name);
        inputs = inputs.ToDictionary(x => x.Key, x => Qualified(x.Key).Unit is { } unit ? new Quantity(x.Value.In(unit), unit) : x.Value);
        if (definition != null)
        {
            if (inputs.Count != definition.Inputs.Count || definition.Inputs.Keys.Any(x => !inputs.ContainsKey(x)))
                throw new TrainingValidationException("Formula inputs do not match the versioned declaration.");
            inputs = inputs.ToDictionary(x => x.Key, x => new Quantity(x.Value.In(definition.Inputs[x.Key]), definition.Inputs[x.Key]));
        }
        var output = use.OutputUnit ?? Unit.Kg;
        if (typesOnly)
        {
            // Structural validation never substitutes a guessed client value into arithmetic.
            try { engine.Validate(expression, inputs.ToDictionary(x => x.Key, x => x.Value.Unit), definition?.OutputUnit ?? output); }
            catch (TrainingValidationException) when (definition == null) { engine.Validate(expression, inputs.ToDictionary(x => x.Key, x => x.Value.Unit), Unit.Scalar); }
            return new(expression, use.Version, inputs, new(0, output), sources);
        }
        var result = engine.Evaluate(expression, inputs);
        if (definition != null) result = new(result.In(definition.OutputUnit), definition.OutputUnit);
        if (use.Expression != null && Quantity.Dimension(result.Unit) == "scalar") result = new(result.In(Unit.Scalar), output);
        if (Quantity.Dimension(result.Unit) != Quantity.Dimension(output) || result.Value < 0 || (Quantity.Dimension(output) == "mass" ? result.In(Unit.Kg) : Quantity.Dimension(output) == "time" ? result.In(Unit.Seconds) : result.In(Unit.Scalar)) > 100000)
            throw new TrainingValidationException("Formula must produce a nonnegative value with compatible units within 100000.");
        return new(expression, use.Version, inputs, use.OutputUnit is { } explicitUnit ? new(result.In(explicitUnit), explicitUnit) : result, sources);
    }
}

