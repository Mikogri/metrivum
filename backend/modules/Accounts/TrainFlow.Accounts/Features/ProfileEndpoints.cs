using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Accounts.Domain;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Features;

public sealed record ProfileResponse(Guid Id, Guid WorkspaceId, string? Username, string DisplayName, DateOnly? BirthDate,
    string Locale, string TimeZone, bool Onboarded, long Version, IReadOnlyList<AccountRole> Roles, IReadOnlyList<AccountRole> Contexts, string? Phone, bool PhoneVisibleToCoach, string? Bio = null);
/// <summary>What any signed-in person may see about another account: no birth date, phone, email or body data.</summary>
public sealed record PersonProfileResponse(Guid UserId, string Username, string DisplayName, string? Bio, IReadOnlyList<AccountRole> Roles, bool IsSelf);
public sealed record OnboardingRequest(string Username, string DisplayName, DateOnly BirthDate, bool AcceptedTerms, string Locale, string TimeZone, AccountRole Role = AccountRole.Coach, string? Phone = null, bool? PhoneVisibleToCoach = null);
public sealed record UpdateProfileRequest(string DisplayName, string Locale, string TimeZone, string? Phone = null, bool? PhoneVisibleToCoach = null, string? Bio = null);

/// <summary>Rate-limit policy names registered by the API host for identity-sensitive endpoints.</summary>
public static class AccountRateLimits
{
    /// <summary>Onboarding and role onboarding: 10 per user per minute.</summary>
    public const string Identity = "account-identity";
    /// <summary>People search: 30 per user per minute.</summary>
    public const string Directory = "account-directory";
}

public static class ProfileEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/accounts/people", async (string search, IAccountDirectory directory, IAccountContext account, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            return (await directory.SearchAsync(search, ct)).Where(person => person.UserId != account.UserId).ToArray();
        }).WithTags("Accounts").RequireAuthorization().RequireRateLimiting(AccountRateLimits.Directory);
        // One public profile by exact username. Missing, inactive and unfinished accounts all answer 404 alike.
        endpoints.MapGet("/api/v1/accounts/people/{username}", async (string username, AccountsDbContext db, IAccountContext account, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            var normalized = username.Trim().TrimStart('@').ToUpperInvariant();
            if (normalized.Length is < 3 or > 32)
                throw ApiException.NotFound();
            var person = await db.Profiles.AsNoTracking()
                .Where(x => x.NormalizedUsername == normalized && x.Active && x.Onboarded && x.Username != null)
                .Select(x => new { x.Id, x.Username, x.DisplayName, x.Bio }).SingleOrDefaultAsync(ct)
                ?? throw ApiException.NotFound();
            var roles = (await db.Roles.AsNoTracking().Where(x => x.UserId == person.Id && (x.Role == "Coach" || x.Role == "Client"))
                .Select(x => x.Role).ToArrayAsync(ct)).Select(Enum.Parse<AccountRole>).Order().ToArray();
            return new PersonProfileResponse(person.Id, person.Username!, person.DisplayName, person.Bio, roles, person.Id == account.UserId);
        }).WithTags("Accounts").RequireAuthorization().RequireRateLimiting(AccountRateLimits.Directory).Produces<PersonProfileResponse>();
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
                if (profile.NormalizedUsername != AccountIdentityPolicy.NormalizeUsername(request.Username) || profile.BirthDate != request.BirthDate)
                    throw ApiException.Conflict("Onboarding is already complete. Use profile settings for editable fields.");
            }
            else
            {
                var normalizedUsername = AccountIdentityPolicy.NormalizeUsername(request.Username);
                // A clear answer for the common case; the unique index below still decides concurrent claims.
                if (await db.Profiles.AnyAsync(x => x.NormalizedUsername == normalizedUsername && x.Id != account.UserId, ct))
                    throw UsernameTaken();
                profile.Username = request.Username;
                profile.NormalizedUsername = normalizedUsername;
                profile.DisplayName = AccountIdentityPolicy.NormalizeDisplayName(request.DisplayName);
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
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: UsernameIndex })
                {
                    throw UsernameTaken();
                }
            }
            await transaction.CommitAsync(ct);
            return await Response(profile, db, http, ct);
        }).RequireRateLimiting(AccountRateLimits.Identity);
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
            if (profile.NormalizedUsername != AccountIdentityPolicy.NormalizeUsername(request.Username) || profile.BirthDate != request.BirthDate)
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
        }).RequireRateLimiting(AccountRateLimits.Identity);
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
            if (request.Bio is not null)
                profile.Bio = AccountIdentityPolicy.NormalizeBio(request.Bio);
            profile.DisplayName = AccountIdentityPolicy.NormalizeDisplayName(request.DisplayName);
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
        return new(profile.Id, workspace.Id, profile.Username, profile.DisplayName, profile.BirthDate, profile.Locale, profile.TimeZone, profile.Onboarded, profile.Version, roles, roles, profile.Phone, profile.PhoneVisibleToCoach, profile.Bio);
    }
    /// <summary>The unique index on the normalized username (see the Accounts migrations).</summary>
    private const string UsernameIndex = "IX_profiles_NormalizedUsername";
    private static ApiException UsernameTaken() => new(409, "USERNAME_TAKEN", "This username is already taken.",
        new Dictionary<string, string[]> { ["username"] = ["This username is already taken."] });
    private static long ProfileFieldsVersion(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static AccountProfileFields ProfileFieldsResponse(HttpContext http, AccountProfileFields fields)
    {
        http.Response.Headers.ETag = $"\"{fields.Version}\"";
        return fields;
    }
}
public sealed record ProfileFieldsRequest(IReadOnlyDictionary<SystemFieldKey, System.Text.Json.JsonElement> Values);
public sealed record CurrencyRequest(string Currency);
