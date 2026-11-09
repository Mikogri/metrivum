using System.Globalization;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace Metrivum.Training.Domain;

/// <summary>Reports an invalid training document or formula to the module validation boundary.</summary>
public sealed class TrainingValidationException(string message) : Exception(message);

[JsonConverter(typeof(JsonStringEnumConverter<Unit>))]
public enum Unit
{
    Scalar, Kg, Lb, Seconds, Minutes, Meters, Kilometers, Percent
}

public sealed record Quantity(decimal Value, Unit Unit)
{
    public static string Dimension(Unit unit) => unit switch
    {
        Unit.Kg or Unit.Lb => "mass",
        Unit.Seconds or Unit.Minutes => "time",
        Unit.Meters or Unit.Kilometers => "distance",
        Unit.Scalar or Unit.Percent => "scalar",
        _ => throw new TrainingValidationException("Unknown unit.")
    };
    public decimal In(Unit target)
    {
        if (Dimension(Unit) != Dimension(target))
            throw new TrainingValidationException("Incompatible units.");
        return Value * Factor(Unit) / Factor(target);
    }
    private static decimal Factor(Unit unit) => unit switch
    {
        Unit.Lb => 0.45359237m,
        Unit.Minutes => 60,
        Unit.Kilometers => 1000,
        Unit.Percent => .01m,
        _ => 1
    };
}

/// <summary>Contains the configured formula settings and bounds for Training; does not itself access the database.</summary>
public sealed class FormulaLimits
{
    public int MaximumLength { get; set; } = 2048;
    public int MaximumDepth { get; set; } = 32;
    public int MaximumOperations { get; set; } = 512;
    public int MaximumGraphNodes { get; set; } = 64;
}

/// <summary>Parses, validates and evaluates bounded typed training formulas in memory; performs no database writes.</summary>
public sealed class FormulaEngine(FormulaLimits? limits = null)
{
    private readonly FormulaLimits limits = limits ?? new();
    public void Validate(string expression, IReadOnlyDictionary<string, Unit> inputs, Unit output)
    {
        var value = Parse(expression, name => inputs.TryGetValue(name, out var unit) ? new(1, unit) : throw new TrainingValidationException($"Undeclared input: {name}."), new Budget(limits.MaximumOperations), true);
        value.In(output);
    }
    public Quantity Evaluate(string expression, IReadOnlyDictionary<string, Quantity> inputs)
    {
        try
        {
            return Parse(expression, name => inputs.TryGetValue(name, out var value) ? value : throw new TrainingValidationException($"Missing input: {name}."), new Budget(limits.MaximumOperations));
        }
        catch (OverflowException) { throw new TrainingValidationException("Formula numeric overflow."); }
        catch (DivideByZeroException) { throw new TrainingValidationException("Division by zero."); }
    }

    public IReadOnlyDictionary<string, Quantity> EvaluateGraph(IReadOnlyDictionary<string, string> expressions, IReadOnlyDictionary<string, Quantity> inputs)
    {
        if (expressions.Count > limits.MaximumGraphNodes || inputs.Count > limits.MaximumGraphNodes)
            throw new TrainingValidationException("Formula dependency graph is too large.");
        if (expressions.Keys.Any(inputs.ContainsKey))
            throw new TrainingValidationException("Formula and input names overlap.");
        var results = new Dictionary<string, Quantity>(inputs, StringComparer.Ordinal);
        var visiting = new HashSet<string>(StringComparer.Ordinal);
        var budget = new Budget(limits.MaximumOperations);
        Quantity Resolve(string name)
        {
            if (results.TryGetValue(name, out var result))
                return result;
            if (!expressions.TryGetValue(name, out var expression))
                throw new TrainingValidationException($"Missing input: {name}.");
            if (!visiting.Add(name))
                throw new TrainingValidationException("Cyclic formula dependency.");
            if (visiting.Count > limits.MaximumDepth)
                throw new TrainingValidationException("Formula dependency depth exceeded.");
            result = Parse(expression, Resolve, budget);
            visiting.Remove(name);
            results.Add(name, result);
            return result;
        }
        try
        {
            foreach (var name in expressions.Keys)
                Resolve(name);
            return results;
        }
        catch (OverflowException) { throw new TrainingValidationException("Formula numeric overflow."); }
        catch (DivideByZeroException) { throw new TrainingValidationException("Division by zero."); }
    }

    private Quantity Parse(string expression, Func<string, Quantity> resolve, Budget budget, bool typesOnly = false)
    {
        if (string.IsNullOrWhiteSpace(expression) || expression.Length > limits.MaximumLength)
            throw new TrainingValidationException("Invalid formula length.");
        return new Parser(expression, limits, resolve, budget, typesOnly).Run();
    }

    /// <summary>Tracks formula evaluation cost and rejects expressions exceeding configured limits.</summary>
    private sealed class Budget(int maximum)
    {
        private int operations;
        public void Count()
        {
            if (++operations > maximum)
                throw new TrainingValidationException("Formula operation limit exceeded.");
        }
    }
    /// <summary>Parses a training expression and evaluates its typed terms within the formula complexity budget.</summary>
    private sealed class Parser(string expression, FormulaLimits limits, Func<string, Quantity> resolve, Budget budget, bool typesOnly)
    {
        private int position;
        private int depth;
        public Quantity Run()
        {
            var value = Comparison();
            Space();
            if (position != expression.Length)
                throw new TrainingValidationException($"Unexpected character at position {position}.");
            return value;
        }
        private void Count()
        {
            budget.Count();
        }
        private Quantity Comparison()
        {
            var value = Sum();
            foreach (var op in new[] { ">=", "<=", "==", "!=", ">", "<" })
            {
                if (!Take(op))
                    continue;
                Count();
                var right = Sum().In(value.Unit);
                if (typesOnly)
                    return new(1, Unit.Scalar);
                return new(op switch
                {
                    ">=" => value.Value >= right ? 1 : 0,
                    "<=" => value.Value <= right ? 1 : 0,
                    "==" => value.Value == right ? 1 : 0,
                    "!=" => value.Value != right ? 1 : 0,
                    ">" => value.Value > right ? 1 : 0,
                    _ => value.Value < right ? 1 : 0
                }, Unit.Scalar);
            }
            return value;
        }
        private Quantity Sum()
        {
            var value = Product();
            while (true)
            {
                var plus = Take("+");
                if (!plus && !Take("-"))
                    return value;
                Count();
                var right = Product().In(value.Unit);
                value = value with
                {
                    Value = typesOnly ? 1 : plus ? value.Value + right : value.Value - right
                };
            }
        }
        private Quantity Product()
        {
            var value = Unary();
            while (true)
            {
                var multiply = Take("*");
                if (!multiply && !Take("/"))
                    return value;
                Count();
                var right = Unary();
                var leftScalar = Quantity.Dimension(value.Unit) == "scalar";
                var rightScalar = Quantity.Dimension(right.Unit) == "scalar";
                if (multiply)
                {
                    if (!leftScalar && !rightScalar)
                        throw new TrainingValidationException("Multiplication requires a scalar operand.");
                    if (typesOnly)
                    {
                        value = new(1, leftScalar ? right.Unit : value.Unit);
                        continue;
                    }
                    value = leftScalar ? new(value.In(Unit.Scalar) * right.Value, right.Unit) : new(value.Value * right.In(Unit.Scalar), value.Unit);
                }
                else
                {
                    if (typesOnly)
                    {
                        if (rightScalar)
                            value = new(1, value.Unit);
                        else if (Quantity.Dimension(value.Unit) == Quantity.Dimension(right.Unit))
                            value = new(1, Unit.Scalar);
                        else
                            throw new TrainingValidationException("Invalid units in division.");
                        continue;
                    }
                    if (!typesOnly && right.Value == 0)
                        throw new TrainingValidationException("Division by zero.");
                    if (rightScalar)
                        value = new(value.Value / right.In(Unit.Scalar), value.Unit);
                    else if (Quantity.Dimension(value.Unit) == Quantity.Dimension(right.Unit))
                        value = new(value.Value / right.In(value.Unit), Unit.Scalar);
                    else
                        throw new TrainingValidationException("Invalid units in division.");
                }
            }
        }
        private Quantity Unary()
        {
            if (++depth > limits.MaximumDepth)
                throw new TrainingValidationException("Formula expression depth exceeded.");
            try
            {
                Count();
                if (Take("+"))
                    return Unary();
                if (Take("-"))
                {
                    var operand = Unary();
                    return operand with
                    {
                        Value = typesOnly ? 1 : -operand.Value
                    };
                }
                if (Take("("))
                {
                    var inner = Comparison();
                    Require(")");
                    return inner;
                }
                Space();
                if (position < expression.Length && (char.IsAsciiDigit(expression[position]) || expression[position] == '.'))
                {
                    var start = position;
                    while (position < expression.Length && (char.IsAsciiDigit(expression[position]) || expression[position] == '.'))
                        position++;
                    if (!decimal.TryParse(expression[start..position], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number))
                        throw new TrainingValidationException("Invalid numeric literal.");
                    Space();
                    var unit = Unit.Scalar;
                    if (Take("%"))
                        unit = Unit.Percent;
                    else if (position < expression.Length && char.IsAsciiLetter(expression[position]))
                    {
                        var text = Name();
                        unit = text switch
                        {
                            "kg" => Unit.Kg,
                            "lb" => Unit.Lb,
                            "s" => Unit.Seconds,
                            "min" => Unit.Minutes,
                            "m" => Unit.Meters,
                            "km" => Unit.Kilometers,
                            _ => throw new TrainingValidationException("Unknown literal unit.")
                        };
                    }
                    return new(typesOnly ? 1 : number, unit);
                }
                var name = Name();
                if (!Take("("))
                    return resolve(name);
                var args = new List<Quantity>();
                if (!Take(")"))
                {
                    do
                    {
                        args.Add(Comparison());
                    } while (Take(","));
                    Require(")");
                }
                return Function(name, args);
            }
            finally { depth--; }
        }
        private static Quantity Function(string name, List<Quantity> args)
        {
            name = name.ToUpperInvariant();
            if (name is "MIN" or "MAX" or "AVG")
            {
                if (args.Count is < 1 or > 32)
                    throw new TrainingValidationException("Aggregate requires 1 to 32 inputs.");
                var unit = args[0].Unit;
                var values = args.Select(x => x.In(unit)).ToArray();
                return new(name == "MIN" ? values.Min() : name == "MAX" ? values.Max() : values.Average(), unit);
            }
            if (name == "IF" && args.Count == 3)
            {
                var condition = args[0].In(Unit.Scalar);
                var alternative = args[2].In(args[1].Unit);
                return condition != 0 ? args[1] : new(alternative, args[1].Unit);
            }
            if (name is "ROUND_TO_STEP" or "ROUND_TO_STEP_LOWER" or "ROUND_TO_STEP_UPPER" && args.Count == 2)
            {
                // An unqualified step uses the result unit; explicit units still require compatibility.
                var step = args[1].Unit == Unit.Scalar ? args[1].Value : args[1].In(args[0].Unit);
                if (step <= 0)
                    throw new TrainingValidationException("Rounding step must be positive.");
                var quotient = args[0].Value / step;
                var rounded = name == "ROUND_TO_STEP_LOWER" ? decimal.Floor(quotient) : name == "ROUND_TO_STEP_UPPER" ? decimal.Ceiling(quotient) : decimal.Round(quotient, 0, MidpointRounding.AwayFromZero);
                return new(rounded * step, args[0].Unit);
            }
            throw new TrainingValidationException("Unknown function or wrong argument count.");
        }
        private string Name()
        {
            Space();
            var start = position;
            if (position >= expression.Length || !(char.IsAsciiLetter(expression[position]) || expression[position] == '_'))
                throw new TrainingValidationException($"Expected identifier at {position}.");
            position++;
            while (position < expression.Length && (char.IsAsciiLetterOrDigit(expression[position]) || expression[position] == '_'))
                position++;
            return expression[start..position];
        }
        private bool Take(string token)
        {
            Space();
            if (!expression.AsSpan(position).StartsWith(token, StringComparison.Ordinal))
                return false;
            position += token.Length;
            return true;
        }
        private void Require(string token)
        {
            if (!Take(token))
                throw new TrainingValidationException($"Expected {token}.");
        }
        private void Space()
        {
            while (position < expression.Length && char.IsWhiteSpace(expression[position]))
                position++;
        }
    }
}
