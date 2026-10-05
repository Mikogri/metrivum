using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media.Contracts;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.Media;

public static class MediaModule
{
    public static IServiceCollection AddMedia(this IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDatabase<MediaDbContext>("media");
        services.AddOptions<StorageOptions>().Bind(config.GetSection("Storage"))
            .Validate(x => x.MaxVideoBytes is > 0 and <= 2147483648 && x.MaxPendingUploadsPerOwner is > 0 and <= 100 && x.ReadUrlSeconds is >= 30 and <= 600, "Invalid storage limits.").ValidateOnStart();
        services.AddHttpClient<IPrivateObjectStorage, SupabaseObjectStorage>(client => client.Timeout = TimeSpan.FromSeconds(30)).RemoveAllLoggers();
        services.AddScoped<MediaLibrary>();
        services.AddScoped<IMediaLibrary>(provider => provider.GetRequiredService<MediaLibrary>());
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
            if (!long.TryParse(request.Headers.IfMatch.ToString().Trim('"'), out var version))
                throw new ApiException(428, "IF_MATCH_REQUIRED", "Supply the current version in If-Match.");
            await library.DeleteAsync(id, account.UserId, version, ct);
            return Results.Accepted();
        }).Produces(StatusCodes.Status202Accepted);
        return endpoints;
    }
}
