using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Accounts.Domain;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Features;

public sealed record ProfileResponse(Guid Id, Guid WorkspaceId, string? Username, string DisplayName, DateOnly? BirthDate,
    string Locale, string TimeZone, bool Onboarded, long Version, IReadOnlyList<AccountRole> Roles, IReadOnlyList<AccountRole> Contexts, string? Phone, bool PhoneVisibleToCoach);
public sealed record OnboardingRequest(string Username, string DisplayName, DateOnly BirthDate, bool AcceptedTerms, string Locale, string TimeZone, AccountRole Role = AccountRole.Coach, string? Phone = null, bool? PhoneVisibleToCoach = null);
public sealed record UpdateProfileRequest(string DisplayName, string Locale, string TimeZone, string? Phone = null, bool? PhoneVisibleToCoach = null);

public static class ProfileEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/accounts/people", async (string search, IAccountDirectory directory, IAccountContext account, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            return (await directory.SearchAsync(search, ct)).Where(person => person.UserId != account.UserId).ToArray();
        }).WithTags("Accounts").RequireAuthorization();
        var group = endpoints.MapGroup("/api/v1/me").WithTags("Accounts");
        group.MapGet("/profile-fields", async (IAccountProfileFields fields, HttpContext http, CancellationToken ct) => ProfileFieldsResponse(http, await fields.GetOwnAsync(ct)));
        group.MapPatch("/profile-fields", async (ProfileFieldsRequest request, IAccountProfileFields fields, HttpContext http, CancellationToken ct) => ProfileFieldsResponse(http, await fields.UpdateOwnAsync(request.Values, ProfileFieldsVersion(http), ct)));
        group.MapPatch("/currency", async (CurrencyRequest request, IAccountProfileFields fields, HttpContext http, CancellationToken ct) => ProfileFieldsResponse(http, await fields.UpdateCurrencyOwnAsync(request.Currency, ProfileFieldsVersion(http), ct)));
        group.MapGet("", async (AccountContext account, AccountsDbContext db, HttpContext http, CancellationToken ct) =>
            await Response(await account.EnsureProfileAsync(ct), db, http, ct));
        group.MapPut("/onboarding", async (OnboardingRequest request, AccountContext account, AccountsDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
        {
            if (!Enum.IsDefined(request.Role))
                throw ApiException.Invalid("Supported onboarding roles are Coach and Client.");
            AccountRules.ValidatePhone(request.Phone);
            AccountRules.ValidateOnboarding(request.Username, request.DisplayName, request.BirthDate, request.AcceptedTerms,
                request.Locale, request.TimeZone, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime));
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({account.UserId.ToString()}, 0))", ct);
            var profile = await account.EnsureProfileAsync(ct);
            if (profile.Onboarded)
            {
                if (!await db.Roles.AnyAsync(x => x.UserId == account.UserId && x.Role == request.Role.ToString(), ct))
                    throw ApiException.Conflict("Use the explicit role onboarding operation to add a role.");
                if (profile.NormalizedUsername != request.Username.ToUpperInvariant() || profile.BirthDate != request.BirthDate)
                    throw ApiException.Conflict("Onboarding is already complete. Use profile settings for editable fields.");
            }
            else
            {
                profile.Username = request.Username;
                profile.NormalizedUsername = request.Username.ToUpperInvariant();
                profile.DisplayName = request.DisplayName.Trim();
                profile.BirthDate = request.BirthDate;
                profile.Locale = request.Locale;
                profile.TimeZone = request.TimeZone;
                profile.TermsAcceptedAt = clock.GetUtcNow();
                profile.TermsVersion = "v1";
                profile.Phone = request.Phone;
                profile.PhoneVisibleToCoach = request.PhoneVisibleToCoach ?? false;
                profile.Onboarded = true;
                profile.Version++;
                db.Roles.Add(new UserRole { UserId = account.UserId, Role = request.Role.ToString() });
                await db.SaveChangesAsync(ct);
            }
            await transaction.CommitAsync(ct);
            return await Response(profile, db, http, ct);
        });
        group.MapPost("/roles/client", async (AccountContext account, AccountsDbContext db, HttpContext http, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({account.UserId.ToString()}, 0))", ct);
            var profile = await account.EnsureProfileAsync(ct);
            await db.Entry(profile).ReloadAsync(ct);
            if (!await db.Roles.AnyAsync(x => x.UserId == account.UserId && x.Role == "Client", ct))
            {
                db.Roles.Add(new UserRole { UserId = account.UserId, Role = "Client" });
                profile.Version++;
                await db.SaveChangesAsync(ct);
            }
            await transaction.CommitAsync(ct);
            return await Response(profile, db, http, ct);
        });
        group.MapPut("/roles/coach/onboarding", async (OnboardingRequest request, AccountContext account, AccountsDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
        {
            if (request.Role != AccountRole.Coach)
                throw ApiException.Invalid("This operation only activates Coach.");
            AccountRules.ValidateOnboarding(request.Username, request.DisplayName, request.BirthDate, request.AcceptedTerms,
                request.Locale, request.TimeZone, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime));
            await account.GetRolesAsync(ct);
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({account.UserId.ToString()}, 0))", ct);
            var profile = await account.EnsureProfileAsync(ct);
            await db.Entry(profile).ReloadAsync(ct);
            if (profile.NormalizedUsername != request.Username.ToUpperInvariant() || profile.BirthDate != request.BirthDate)
                throw ApiException.Conflict("Coach onboarding must match the existing account identity.");
            if (!await db.Roles.AnyAsync(x => x.UserId == account.UserId && x.Role == "Coach", ct))
            {
                db.Roles.Add(new UserRole { UserId = account.UserId, Role = "Coach" });
                profile.TermsAcceptedAt = clock.GetUtcNow();
                profile.TermsVersion = "v1";
                profile.Version++;
                await db.SaveChangesAsync(ct);
            }
            await transaction.CommitAsync(ct);
            return await Response(profile, db, http, ct);
        });
        group.MapPatch("", async (UpdateProfileRequest request, AccountContext account, AccountsDbContext db, HttpContext http, CancellationToken ct) =>
        {
            AccountRules.ValidatePhone(request.Phone);
            AccountRules.ValidateSettings(request.DisplayName, request.Locale, request.TimeZone);
            var profile = await account.EnsureProfileAsync(ct);
            if (http.Request.Headers.IfMatch.Count == 0)
                throw new ApiException(428, "PRECONDITION_REQUIRED", "Send the current ETag in If-Match.");
            if (http.Request.Headers.IfMatch.ToString() != $"\"{profile.Version}\"")
                throw new ApiException(412, "VERSION_CONFLICT", "The profile changed. Reload and retry.");
            if (request.Phone is not null)
                profile.Phone = request.Phone.Length == 0 ? null : request.Phone;
            if (request.PhoneVisibleToCoach is { } visible)
                profile.PhoneVisibleToCoach = visible;
            profile.DisplayName = request.DisplayName.Trim();
            profile.Locale = request.Locale;
            profile.TimeZone = request.TimeZone;
            profile.Version++;
            await db.SaveChangesAsync(ct);
            return await Response(profile, db, http, ct);
        });
    }

    private static async Task<ProfileResponse> Response(Profile profile, AccountsDbContext db, HttpContext http, CancellationToken ct)
    {
        http.Response.Headers.ETag = $"\"{profile.Version}\"";
        var workspace = await db.Workspaces.SingleAsync(x => x.OwnerId == profile.Id, ct);
        var roles = (await db.Roles.AsNoTracking().Where(x => x.UserId == profile.Id && (x.Role == "Coach" || x.Role == "Client")).Select(x => x.Role).ToArrayAsync(ct)).Select(Enum.Parse<AccountRole>).Order().ToArray();
        return new(profile.Id, workspace.Id, profile.Username, profile.DisplayName, profile.BirthDate, profile.Locale, profile.TimeZone, profile.Onboarded, profile.Version, roles, roles, profile.Phone, profile.PhoneVisibleToCoach);
    }
    private static long ProfileFieldsVersion(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static AccountProfileFields ProfileFieldsResponse(HttpContext http, AccountProfileFields fields)
    {
        http.Response.Headers.ETag = $"\"{fields.Version}\"";
        return fields;
    }
}
public sealed record ProfileFieldsRequest(IReadOnlyDictionary<SystemFieldKey, System.Text.Json.JsonElement> Values);
public sealed record CurrencyRequest(string Currency);
