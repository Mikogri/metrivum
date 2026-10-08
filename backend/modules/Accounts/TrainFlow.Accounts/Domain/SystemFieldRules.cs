using System.Text.Json;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Domain;

public static class SystemFieldRules
{
    public static void Validate(IReadOnlyDictionary<SystemFieldKey, JsonElement> values)
    {
        if (values is null || values.Count > 14)
            throw ApiException.Invalid("Profile fields are required and bounded.");
        foreach (var (key, value) in values)
        {
            if (!Enum.IsDefined(key))
                throw ApiException.Invalid("Unknown system profile field.");
            if (value.ValueKind == JsonValueKind.Null)
                continue;
            switch (key)
            {
                case SystemFieldKey.Height:
                    Number(value, 30, 300);
                    break;
                case SystemFieldKey.Weight:
                    Number(value, 1, 600);
                    break;
                case SystemFieldKey.BodyFat:
                    Number(value, 0, 100);
                    break;
                case SystemFieldKey.HrMax:
                    Number(value, 30, 300);
                    break;
                case SystemFieldKey.SessionsPerWeek:
                    Number(value, 0, 21, true);
                    break;
                case SystemFieldKey.AvailableSessionDuration:
                    Number(value, 1, 1440, true);
                    break;
                case SystemFieldKey.Sleep:
                    Number(value, 0, 24);
                    break;
                case SystemFieldKey.Stress:
                    Number(value, 0, 10, true);
                    break;
                case SystemFieldKey.PreferredTrainingDays:
                    if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 7 || value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.Number || !x.TryGetInt32(out var day) || day < 1 || day > 7) || value.EnumerateArray().Select(x => x.GetInt32()).Distinct().Count() != value.GetArrayLength())
                        throw ApiException.Invalid("Preferred training days must be unique ISO weekday numbers 1–7.");
                    break;
                case SystemFieldKey.AvailableEquipment:
                    if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 50 || value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(x.GetString()) || x.GetString()!.Length > 100) || value.EnumerateArray().Select(x => x.GetString()).Distinct().Count() != value.GetArrayLength())
                        throw ApiException.Invalid("Available equipment must be a bounded list of unique names.");
                    break;
                default:
                    if (value.ValueKind != JsonValueKind.String || value.GetString()!.Length > 4000)
                        throw ApiException.Invalid("Profile text must be at most 4000 characters.");
                    break;
            }
        }
    }
    private static void Number(JsonElement value, decimal min, decimal max, bool integer = false)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetDecimal(out var number) || number < min || number > max || (integer && decimal.Truncate(number) != number))
            throw ApiException.Invalid("Profile number is outside the supported range or type.");
    }
}
