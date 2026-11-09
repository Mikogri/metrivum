using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Metrivum.Media.Infrastructure;

namespace Metrivum.Media;

/// <summary>Registers Media services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class MediaModule
{
    public static IServiceCollection AddMedia(this IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDatabase<MediaDbContext>("media");
        services.AddOptions<MediaQuotaOptions>().Bind(config.GetSection("AbuseProtection:Media"))
            .Validate(x => x.UploadStartsPerHour is > 0 and <= 1000 && x.DailyBytes > 0 && x.GlobalStorageBytes >= x.DailyBytes
                && x.StorageAlertPercent is > 0 and < 100 && x.CleanupBatchSize is > 0 and <= 100, "Invalid media quotas.").ValidateOnStart();
        services.AddOptions<StorageOptions>().Bind(config.GetSection("Storage"))
            .Validate(x => x.MaxAttachmentBytes is > 0 and <= 67108864 && x.MaxVoiceDurationMs is > 0 and <= 3600000 && x.AllowedAttachmentTypes.Length > 0, "Invalid messaging attachment limits.")
            .Validate(x => x.MaxVideoBytes is > 0 and <= 2147483648 && x.MaxPendingUploadsPerOwner is > 0 and <= 100 && x.ReadUrlSeconds is >= 30 and <= 600, "Invalid storage limits.").ValidateOnStart();
        services.AddHttpClient<IPrivateObjectStorage, SupabaseObjectStorage>(client => client.Timeout = TimeSpan.FromSeconds(30)).RemoveAllLoggers();
        services.AddScoped<MediaLibrary>();
        services.AddScoped<IMediaLibrary>(provider => provider.GetRequiredService<MediaLibrary>());
        services.AddScoped<IDocumentMedia>(provider => provider.GetRequiredService<MediaLibrary>());
        services.AddScoped<IPortfolioMedia>(provider => provider.GetRequiredService<MediaLibrary>());
        services.AddScoped<ILimitUsageProvider, MediaLimitUsage>();
        services.AddSingleton(new FeatureDefinition("video.library.manage", "Media", "features.video.library.title", "features.video.library.description", [], ["media.maxVideoBytes", "media.maxPendingUploads"]));
        return services;
    }

    public static IEndpointRouteBuilder MapMedia(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/media").RequireAuthorization().WithTags("Media");
        group.MapPost("/uploads", async (UploadRequest input, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.library.manage", ct);
            var ticket = await library.CreateAsync(account.UserId, input, ct);
            return Results.Created($"/api/v1/media/{ticket.File.Id}", ticket);
        }).Produces<UploadTicket>(StatusCodes.Status201Created);
        group.MapGet("/", async (MediaLibrary library, IAccountContext account, string? search, string? state, string? sort, CancellationToken ct, int page = 1, int pageSize = 25) =>
        {
            await account.RequireCoachAsync(ct);
            return Results.Ok(await library.ListAsync(account.UserId, search, state, sort, page, pageSize, ct));
        }).Produces<MediaDto[]>();
        group.MapGet("/{id:guid}", async (Guid id, MediaLibrary library, IAccountContext account, HttpResponse response, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            var file = await library.GetAsync(id, account.UserId, ct);
            response.Headers.ETag = $"\"{file.Version}\"";
            return Results.Ok(file);
        }).Produces<MediaDto>();
        group.MapPost("/{id:guid}/finalize", async (Guid id, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.library.manage", ct);
            return Results.Ok(await library.FinalizeAsync(id, account.UserId, ct));
        }).Produces<MediaDto>();
        group.MapPost("/{id:guid}/read-url", async (Guid id, MediaLibrary library, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            return Results.Ok(await library.ReadUrlAsync(id, account.UserId, ct));
        }).Produces<MediaReadTicket>();
        group.MapDelete("/{id:guid}", async (Guid id, HttpRequest request, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.library.manage", ct);
            var version = RequestPreconditions.RequireMediaVersion(request);
            await library.DeleteAsync(id, account.UserId, version, ct);
            return Results.Accepted();
        }).Produces(StatusCodes.Status202Accepted);
        var uploads = endpoints.MapGroup("/api/v1/messaging/uploads").RequireAuthorization().WithTags("Messaging attachments");
        uploads.MapPost("/", async (UploadRequest input, Guid? conversationId, IMessagingUploadAuthorization authorization, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            if (conversationId.HasValue) await authorization.RequireUploadAsync(conversationId.Value, ct);
            await features.RequireAsync("messaging.attachments", ct);
            if (input.ContentType.StartsWith("audio/", StringComparison.Ordinal))
                await features.RequireAsync("messaging.voice", ct);
            return Results.Ok(await library.CreateMessagingAsync(account.UserId, input, ct));
        }).Produces<UploadTicket>();
        uploads.MapPost("/{id:guid}/finalize", async (Guid id, Guid? conversationId, IMessagingUploadAuthorization authorization, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            if (conversationId.HasValue) await authorization.RequireUploadAsync(conversationId.Value, ct);
            await features.RequireAsync("messaging.attachments", ct);
            var file = await library.GetMessagingAsync(id, account.UserId, ct);
            if (file.ContentType.StartsWith("audio/", StringComparison.Ordinal))
                await features.RequireAsync("messaging.voice", ct);
            return Results.Ok(await library.FinalizeMessagingAsync(id, account.UserId, ct));
        }).Produces<MediaDto>();
        uploads.MapDelete("/{id:guid}", async (Guid id, HttpRequest request, MediaLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("messaging.attachments", ct);
            var version = RequestPreconditions.RequireMediaVersion(request);
            await library.DeleteMessagingAsync(id, account.UserId, version, ct);
            return Results.Accepted();
        });
        return endpoints;
    }
}
