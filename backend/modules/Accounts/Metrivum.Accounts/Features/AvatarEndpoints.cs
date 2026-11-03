using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;

namespace Metrivum.Accounts.Features;

public sealed record AvatarUploadRequest(string Name, string ContentType, long Size);
public sealed record AvatarRequest(Guid MediaId);

/// <summary>
/// The profile photo. Any signed-in person may set one; any signed-in viewer of an active profile may read it.
/// The file is kept in the owner's public media folder (shared with coach portfolio files) and released when replaced.
/// </summary>
public static class AvatarEndpoints
{
    private const long MaxBytes = 5 * 1024 * 1024;

    public static void Map(IEndpointRouteBuilder endpoints, RouteGroupBuilder own)
    {
        own.MapPost("/avatar/uploads", async (AvatarUploadRequest request, AccountContext account, IPortfolioMedia media, CancellationToken ct) =>
        {
            var profile = await account.EnsureProfileAsync(ct);
            if (request.ContentType is not ("image/png" or "image/jpeg" or "image/webp"))
                throw ApiException.Invalid("A profile photo must be a PNG, JPEG or WebP image.");
            if (request.Size is <= 0 or > MaxBytes)
                throw ApiException.Invalid("A profile photo can be at most 5 MB.");
            return await media.CreatePortfolioUploadAsync(profile.Id, request.Name, request.ContentType, request.Size, ct);
        }).Produces<DocumentUpload>();

        own.MapPut("/avatar", async (AvatarRequest request, AccountContext account, AccountsDbContext db, IPortfolioMedia media, HttpContext http, CancellationToken ct) =>
        {
            var profile = await account.EnsureProfileAsync(ct);
            var file = await media.AttachPortfolioAsync(profile.Id, request.MediaId, ct);
            if (file.ContentType is not ("image/png" or "image/jpeg" or "image/webp") || file.Size > MaxBytes)
            {
                await media.ReleasePortfolioAsync(profile.Id, file.Id, ct);
                throw ApiException.Invalid("A profile photo must be a PNG, JPEG or WebP image of at most 5 MB.");
            }
            var previous = profile.AvatarMediaId;
            profile.AvatarMediaId = file.Id;
            await db.SaveChangesAsync(ct);
            if (previous is { } old && old != file.Id)
                await media.ReleasePortfolioAsync(profile.Id, old, ct);
            return await ProfileEndpoints.Response(profile, db, http, ct);
        }).Produces<ProfileResponse>();

        own.MapDelete("/avatar", async (AccountContext account, AccountsDbContext db, IPortfolioMedia media, HttpContext http, CancellationToken ct) =>
        {
            var profile = await account.EnsureProfileAsync(ct);
            if (profile.AvatarMediaId is { } old)
            {
                profile.AvatarMediaId = null;
                await db.SaveChangesAsync(ct);
                await media.ReleasePortfolioAsync(profile.Id, old, ct);
            }
            return await ProfileEndpoints.Response(profile, db, http, ct);
        }).Produces<ProfileResponse>();

        // Inactive or unfinished accounts and people without a photo all answer 404 alike.
        endpoints.MapPost("/api/v1/accounts/people/{userId:guid}/avatar/read-url", async (Guid userId, AccountsDbContext db, IAccountContext account, IPortfolioMedia media, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            var avatar = await db.Profiles.AsNoTracking()
                .Where(x => x.Id == userId && x.Active && (x.Onboarded || x.Id == account.UserId))
                .Select(x => x.AvatarMediaId).SingleOrDefaultAsync(ct);
            if (avatar is null)
                throw ApiException.NotFound();
            return await media.ReadPortfolioAsync(userId, avatar.Value, account.UserId, ct);
        }).WithTags("Accounts").RequireAuthorization().RequireRateLimiting(AccountRateLimits.Directory).Produces<DocumentReadUrl>();
    }
}
