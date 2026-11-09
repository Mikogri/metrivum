using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;

namespace Metrivum.Accounts.Infrastructure;

/// <summary>Reads and updates authorized profile field values in the Accounts database.</summary>
public sealed class AccountProfileFieldsService(AccountsDbContext db, IAccountContext account) : IAccountProfileFields
{
    public async Task<AccountProfileFields> GetOwnAsync(CancellationToken cancellationToken) => Dto(await Own(cancellationToken));
    public async Task<AccountProfileFields> GetAllowedForUserAsync(Guid userId, CancellationToken cancellationToken) => Dto(await db.Profiles.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId && x.Active && x.Onboarded, cancellationToken) ?? throw ApiException.NotFound());
    public async Task<string> GetCurrencyAsync(Guid userId, CancellationToken cancellationToken) => await db.Profiles.AsNoTracking().Where(x => x.Id == userId && x.Active && x.Onboarded).Select(x => x.Currency).SingleOrDefaultAsync(cancellationToken) ?? throw ApiException.NotFound();
    public async Task<AccountProfileFields> UpdateOwnAsync(IReadOnlyDictionary<SystemFieldKey, JsonElement> values, long expectedVersion, CancellationToken cancellationToken)
    {
        SystemFieldRules.Validate(values);
        var profile = await Own(cancellationToken);
        Check(profile, expectedVersion);
        var merged = JsonSerializer.Deserialize<Dictionary<SystemFieldKey, JsonElement>>(profile.SystemValues)!;
        foreach (var (key, value) in values)
        {
            if (value.ValueKind == JsonValueKind.Null)
                merged.Remove(key);
            else
                merged[key] = value.Clone();
        }
        profile.SystemValues = JsonSerializer.Serialize(merged);
        profile.Version++;
        await db.SaveChangesAsync(cancellationToken);
        return Dto(profile);
    }
    public async Task<AccountProfileFields> UpdateCurrencyOwnAsync(string currency, long expectedVersion, CancellationToken cancellationToken)
    {
        if (currency is not ("EUR" or "PLN" or "USD" or "GBP" or "CHF" or "CZK" or "SEK" or "NOK" or "DKK" or "CAD" or "AUD"))
            throw ApiException.Invalid("Unsupported account currency.");
        await account.RequireCoachAsync(cancellationToken);
        var profile = await Own(cancellationToken);
        Check(profile, expectedVersion);
        profile.Currency = currency;
        profile.Version++;
        await db.SaveChangesAsync(cancellationToken);
        return Dto(profile);
    }
    private async Task<Profile> Own(CancellationToken ct)
    {
        await account.GetRolesAsync(ct);
        var profile = await db.Profiles.SingleOrDefaultAsync(x => x.Id == account.UserId && x.Active && x.Onboarded, ct) ?? throw ApiException.NotFound();
        await db.Entry(profile).ReloadAsync(ct);
        return profile;
    }
    private static void Check(Profile profile, long version)
    {
        if (profile.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The profile changed. Reload and retry.");
    }
    private static AccountProfileFields Dto(Profile profile) => new(profile.Currency, JsonSerializer.Deserialize<Dictionary<SystemFieldKey, JsonElement>>(profile.SystemValues)!, profile.Version);
}
