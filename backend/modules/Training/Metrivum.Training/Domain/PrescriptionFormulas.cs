using System.Security.Cryptography;
using System.Text;

namespace Metrivum.Training.Domain;

/// <summary>One field contract for validation, frozen delivery and purchased copies.</summary>
public static class PrescriptionFormulas
{
    public static Unit UnitFor(string field) =>
        field switch
        {
            "Sets" or "Reps" => Unit.Scalar,
            "WorkTime" or "Rest" => Unit.Seconds,
            _ => throw new TrainingValidationException("Unknown prescription formula field."),
        };

    public static IEnumerable<FormulaUse> Uses(Prescription p) =>
        (p.LoadFormula == null ? Enumerable.Empty<FormulaUse>() : [p.LoadFormula]).Concat(
            p.FieldFormulas?.Values ?? Enumerable.Empty<FormulaUse>()
        );

    public static Quantity ValidateValue(string field, Quantity value)
    {
        var number = value.In(UnitFor(field));
        var count = field is "Sets" or "Reps";
        var maximum =
            field == "Sets" ? 50
            : count ? DocumentRules.MaximumRepetitions
            : 86400;

        if (
            number < (count ? 1 : 0)
            || number > maximum
            || count && decimal.Truncate(number) != number
        )
            throw new TrainingValidationException(
                $"{field} formula must produce {(count ? "a whole number" : "a duration in seconds")} from {(count ? 1 : 0)} to {maximum}."
            );
        return new(number, UnitFor(field));
    }

    public static Prescription Freeze(Prescription p, FormulaEvaluation? evaluation)
    {
        var value = p with { FieldFormulas = null, LoadFormula = null };

        if (p.LoadFormula != null && evaluation != null)
            value = value with
            {
                Load = new(evaluation.Result, evaluation.Result),
                LoadPercent = null,
                BaseValue = null,
            };
        foreach (var (field, result) in evaluation?.FieldValues ?? [])
            value = field switch
            {
                "Reps" => value with { Reps = new((int)result.Value, (int)result.Value) },
                "WorkTime" => value with { WorkTime = result },
                "Rest" => value with { Rest = result },
                _ => value,
            };
        return value;
    }

    public static Workout Freeze(
        Workout workout,
        IReadOnlyDictionary<Guid, FormulaEvaluation> evaluations
    ) =>
        workout with
        {
            Exercises = workout
                .Exercises.Select(exercise =>
                {
                    var sets = exercise.Sets;
                    var first = sets.FirstOrDefault();

                    if (
                        first != null
                        && evaluations
                            .GetValueOrDefault(first.Id)
                            ?.FieldValues?.TryGetValue("Sets", out var count) == true
                    )
                    {
                        var size = (int)ValidateValue("Sets", count).Value;
                        sets = Enumerable
                            .Range(0, size)
                            .Select(i =>
                                i < sets.Length
                                    ? sets[i]
                                    : first with
                                    {
                                        // Stable IDs keep unstarted occurrences and refreshed formulas consistent.
                                        Id = new Guid(
                                            SHA256.HashData(
                                                Encoding.UTF8.GetBytes(
                                                    $"{first.Id:N}:formula-set:{i}"
                                                )
                                            )[..16]
                                        ),
                                    }
                            )
                            .ToArray();
                    }
                    return exercise with
                    {
                        Sets = sets.Select(set =>
                                set with
                                {
                                    Prescription = Freeze(
                                        set.Prescription,
                                        evaluations.GetValueOrDefault(set.Id)
                                            ?? (
                                                first == null
                                                || exercise.Sets.Any(original =>
                                                    original.Id == set.Id
                                                )
                                                    ? null
                                                    : evaluations.GetValueOrDefault(first.Id)
                                            )
                                    ),
                                    Segments = set
                                        .Segments?.Select(segment =>
                                            segment with
                                            {
                                                Prescription = Freeze(
                                                    segment.Prescription,
                                                    evaluations.GetValueOrDefault(segment.Id)
                                                ),
                                            }
                                        )
                                        .ToArray(),
                                }
                            )
                            .ToArray(),
                    };
                })
                .ToArray(),
        };
}
