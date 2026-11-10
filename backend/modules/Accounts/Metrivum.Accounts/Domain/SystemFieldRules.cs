using System.Text.Json;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.Accounts.Domain;

/// <summary>Validates typed profile fields and numeric bounds before their values enter storage.</summary>
public static class SystemFieldRules
{
    public static void Validate(IReadOnlyDictionary<SystemFieldKey, JsonElement> values)
    {
        if (values is null || values.Count > 20)
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
                case SystemFieldKey.Vo2Max:
                    Number(value, 10, 100);
                    break;
                case SystemFieldKey.Stress:
                    Number(value, 0, 10, true);
                    break;
                case SystemFieldKey.Sex:
                    if (
                        value.ValueKind != JsonValueKind.String
                        || value.GetString() is not ("Male" or "Female" or "Other")
                    )
                        throw ApiException.Invalid("Sex must be Male, Female, or Other.");
                    break;
                case SystemFieldKey.Country:
                    if (
                        value.ValueKind != JsonValueKind.String
                        || value.GetString() is not { Length: 2 } code
                        || !code.All(char.IsAsciiLetterUpper)
                    )
                        throw ApiException.Invalid("Country must be an ISO 3166-1 alpha-2 code.");
                    break;
                case SystemFieldKey.Region or SystemFieldKey.City:
                    if (
                        value.ValueKind != JsonValueKind.String
                        || string.IsNullOrWhiteSpace(value.GetString())
                        || value.GetString()!.Length > 100
                    )
                        throw ApiException.Invalid(
                            "Region and city must be at most 100 characters."
                        );
                    break;
                case SystemFieldKey.PostalCode:
                    if (
                        value.ValueKind != JsonValueKind.String
                        || string.IsNullOrWhiteSpace(value.GetString())
                        || value.GetString()!.Length > 16
                    )
                        throw ApiException.Invalid("Postal code must be at most 16 characters.");
                    break;
                case SystemFieldKey.PreferredTrainingDays:
                    if (
                        value.ValueKind != JsonValueKind.Array
                        || value.GetArrayLength() > 7
                        || value
                            .EnumerateArray()
                            .Any(x =>
                                x.ValueKind != JsonValueKind.Number
                                || !x.TryGetInt32(out var day)
                                || day < 1
                                || day > 7
                            )
                        || value.EnumerateArray().Select(x => x.GetInt32()).Distinct().Count()
                            != value.GetArrayLength()
                    )
                        throw ApiException.Invalid(
                            "Preferred training days must be unique ISO weekday numbers 1–7."
                        );
                    break;
                case SystemFieldKey.AvailableEquipment:
                    if (
                        value.ValueKind != JsonValueKind.Array
                        || value.GetArrayLength() > 50
                        || value
                            .EnumerateArray()
                            .Any(x =>
                                x.ValueKind != JsonValueKind.String
                                || string.IsNullOrWhiteSpace(x.GetString())
                                || x.GetString()!.Length > 100
                            )
                        || value.EnumerateArray().Select(x => x.GetString()).Distinct().Count()
                            != value.GetArrayLength()
                    )
                        throw ApiException.Invalid(
                            "Available equipment must be a bounded list of unique names."
                        );
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
        if (
            value.ValueKind != JsonValueKind.Number
            || !value.TryGetDecimal(out var number)
            || number < min
            || number > max
            || (integer && decimal.Truncate(number) != number)
        )
            throw ApiException.Invalid("Profile number is outside the supported range or type.");
    }
}
