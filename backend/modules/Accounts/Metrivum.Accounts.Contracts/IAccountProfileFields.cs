using System.Text.Json;
using System.Text.Json.Serialization;

namespace Metrivum.Accounts.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<SystemFieldKey>))]
public enum SystemFieldKey
{
    Height, Weight, BodyFat, HrMax, TrainingExperience, ActivityLevel, AvailableEquipment,
    PreferredTrainingDays, SessionsPerWeek, AvailableSessionDuration, Sleep, Stress,
    InjuriesLimitationsPainNotes, AdditionalNotes, Sex,
    // Where the account is based: used to find coaches nearby.
    Country, Region, City, PostalCode,
    // Maximal oxygen uptake in ml/kg/min, from a test or a watch estimate.
    Vo2Max
}

public sealed record AccountProfileFields(string Currency, IReadOnlyDictionary<SystemFieldKey, JsonElement> Values, long Version);

public interface IAccountProfileFields
{
    Task<AccountProfileFields> GetOwnAsync(CancellationToken cancellationToken);
    // Trusted workflow callers authorize coach/client context before reading this private allowlisted view.
    Task<AccountProfileFields> GetAllowedForUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<AccountProfileFields> UpdateOwnAsync(IReadOnlyDictionary<SystemFieldKey, JsonElement> values, long expectedVersion, CancellationToken cancellationToken);
    Task<AccountProfileFields> UpdateCurrencyOwnAsync(string currency, long expectedVersion, CancellationToken cancellationToken);
    Task<string> GetCurrencyAsync(Guid userId, CancellationToken cancellationToken);
}
