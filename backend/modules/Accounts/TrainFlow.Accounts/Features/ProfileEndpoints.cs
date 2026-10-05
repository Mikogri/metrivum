using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Domain;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Features;

public sealed record ProfileResponse(Guid Id, Guid WorkspaceId, string? Username, string DisplayName, DateOnly? BirthDate,
    string Locale, string TimeZone, bool Onboarded, long Version);
public sealed record OnboardingRequest(string Username, string DisplayName, DateOnly BirthDate, bool AcceptedTerms, string Locale, string TimeZone);
public sealed record UpdateProfileRequest(string DisplayName, string Locale, string TimeZone);

public static class ProfileEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/me").WithTags("Accounts");
        group.MapGet("", async (AccountContext account, AccountsDbContext db, HttpContext http, CancellationToken ct) =>
            await Response(await account.EnsureProfileAsync(ct), db, http, ct));
        group.MapPut("/onboarding", async (OnboardingRequest request, AccountContext account, AccountsDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
        {
            AccountRules.ValidateOnboarding(request.Username, request.DisplayName, request.BirthDate, request.AcceptedTerms,
                request.Locale, request.TimeZone, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime));
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({account.UserId.ToString()}, 0))", ct);
            var profile = await account.EnsureProfileAsync(ct);
            if (profile.Onboarded)
            {
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
                profile.Onboarded = true;
                profile.Version++;
                db.Roles.Add(new UserRole { UserId = account.UserId, Role = "Coach" });
                await db.SaveChangesAsync(ct);
            }
            await transaction.CommitAsync(ct);
            return await Response(profile, db, http, ct);
        });
        group.MapPatch("", async (UpdateProfileRequest request, AccountContext account, AccountsDbContext db, HttpContext http, CancellationToken ct) =>
        {
            AccountRules.ValidateSettings(request.DisplayName, request.Locale, request.TimeZone);
            var profile = await account.EnsureProfileAsync(ct);
            if (http.Request.Headers.IfMatch.Count == 0)
                throw new ApiException(428, "PRECONDITION_REQUIRED", "Send the current ETag in If-Match.");
            if (http.Request.Headers.IfMatch.ToString() != $"\"{profile.Version}\"")
                throw new ApiException(412, "VERSION_CONFLICT", "The profile changed. Reload and retry.");
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
        return new(profile.Id, workspace.Id, profile.Username, profile.DisplayName, profile.BirthDate, profile.Locale, profile.TimeZone, profile.Onboarded, profile.Version);
    }
}
