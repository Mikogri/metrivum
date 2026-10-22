using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Training.Contracts;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public static class VideoAnalysisModule
{
    public static IServiceCollection AddVideoAnalysis(this IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDatabase<VideoAnalysisDbContext>("video_analysis");
        services.AddOptions<AnalysisOptions>().Bind(config.GetSection("Analysis")).Validate(x => x.MaxConcurrentPerOwner is >= 1 and <= 100 && x.MaxQueuedJobs is >= 1 and <= 10000
            && x.MaxAttempts is >= 1 and <= 10 && x.LeaseSeconds is >= 15 and <= 600 && x.HeartbeatSeconds >= 1 && x.HeartbeatSeconds * 3 <= x.LeaseSeconds
            && x.PollSeconds is >= 1 and <= 60 && x.MaxRunSeconds is >= 10 and <= 14400 && x.MaxResultPoints is >= 2 and <= 100000
            && x.MaxResultBytes is >= 1024 and <= 16777216, "Invalid analysis limits.").ValidateOnStart();
        services.AddOptions<MotionTraceOptions>().Bind(config.GetSection("Analysis:MotionTrace"));
        services.TryAddSingleton<MotionTraceAnalyzer>();
        services.TryAddSingleton<IVideoAnalyzer>(provider =>
        {
            var analyzer = provider.GetRequiredService<MotionTraceAnalyzer>();
            return analyzer.IsConfigured ? analyzer : new UnavailableVideoAnalyzer();
        });
        services.AddScoped<AnalysisLibrary>();
        services.AddScoped<AnalysisQueue>();
        services.AddScoped<AnalysisSharing>();
        services.AddScoped<ILimitUsageProvider, AnalysisLimitUsage>();
        services.AddSingleton(new FeatureDefinition("video.analysis.run", "VideoAnalysis", "features.video.analysis.run.title", "features.video.analysis.run.description", ["video.library.manage"], ["analysis.concurrent"]));
        services.AddSingleton(new FeatureDefinition("video.analysis.compare", "VideoAnalysis", "features.video.analysis.compare.title", "features.video.analysis.compare.description", [], []));
        return services;
    }

    public static IServiceCollection AddClientAnalysis(this IServiceCollection services)
        => services.AddScoped<ClientAnalysisLibrary>().AddScoped<AnalysisWorkoutLinks>();

    public static IEndpointRouteBuilder MapVideoAnalysis(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/analyses").RequireAuthorization().WithTags("VideoAnalysis");
        group.MapPost("/client-results", async (SaveClientAnalysisRequest input, HttpRequest request, ClientAnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            var roles = await account.GetRolesAsync(ct);
            if (!roles.Contains(AccountRole.Client))
                await features.RequireAsync("video.analysis.run", ct);
            return Results.Ok(await library.SaveAsync(account.UserId, request.Headers["Idempotency-Key"].ToString(), input, ct));
        }).Produces<AnalysisDto>();
        group.MapPost("/", async (CreateAnalysisRequest input, HttpRequest request, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.analysis.run", ct);
            var job = await library.CreateAsync(account.UserId, request.Headers["Idempotency-Key"].ToString(), input, ct);
            return Results.Accepted($"/api/v1/analyses/{job.Id}", job);
        }).Produces<AnalysisDto>(StatusCodes.Status202Accepted);
        group.MapGet("/", async (AnalysisLibrary library, IAccountContext account, string? search, string? status, string? tag, string? sort, CancellationToken ct, int page = 1, int pageSize = 25) =>
        {
            var roles = await account.GetRolesAsync(ct);
            return Results.Ok(await library.ListAsync(account.UserId, search, status, tag, sort, page, pageSize, ct, !roles.Contains(AccountRole.Coach)));
        }).Produces<AnalysisDto[]>();
        group.MapGet("/{id:guid}", async (Guid id, AnalysisLibrary library, IAccountContext account, HttpResponse response, CancellationToken ct) =>
        {
            var job = await library.GetAsync(id, account.UserId, ct);
            await RequireReadAsync(job, account, ct);
            response.Headers.ETag = $"\"{job.Version}\"";
            return Results.Ok(job);
        }).Produces<AnalysisDto>();
        group.MapPut("/{id:guid}", async (Guid id, UpdateAnalysisRequest input, HttpRequest request, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.library.manage", ct);
            await library.UpdateAsync(id, account.UserId, Version(request), input, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        // The coach attaches the analysis to one logged set of a client (or a whole logged workout).
        group.MapGet("/{id:guid}/workout-link", async (Guid id, AnalysisWorkoutLinks links, IAccountContext account, CancellationToken ct) =>
        {
            var link = await links.GetAsync(id, account.UserId, ct);
            return link == null ? Results.NoContent() : Results.Ok(link);
        }).Produces<AnalysisWorkoutLinkDto>().Produces(StatusCodes.Status204NoContent);
        group.MapPut("/{id:guid}/workout-link", async (Guid id, AnalysisWorkoutLinkRequest input, HttpRequest request, HttpResponse response, AnalysisWorkoutLinks links, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            await features.RequireAsync("video.library.manage", ct);
            var (link, version) = await links.LinkAsync(id, account.UserId, Version(request), input, ct);
            response.Headers.ETag = $"\"{version}\"";
            return Results.Ok(link);
        }).Produces<AnalysisWorkoutLinkDto>();
        group.MapDelete("/{id:guid}/workout-link", async (Guid id, HttpRequest request, HttpResponse response, AnalysisWorkoutLinks links, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            await features.RequireAsync("video.library.manage", ct);
            var version = await links.UnlinkAsync(id, account.UserId, Version(request), ct);
            response.Headers.ETag = $"\"{version}\"";
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        // Analyses a coach shared with the signed-in client at one of their logged sets (read-only for the client).
        group.MapGet("/from-coach", async (Guid? executionId, AnalysisWorkoutLinks links, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await links.FromCoachAsync(account.UserId, executionId, ct))).Produces<CoachAnalysisDto[]>();
        group.MapGet("/from-coach/{id:guid}", async (Guid id, AnalysisWorkoutLinks links, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await links.SharedAsync(id, account.UserId, ct))).Produces<CoachAnalysisDto>();
        group.MapGet("/from-coach/{id:guid}/result", async (Guid id, int? repetition, AnalysisWorkoutLinks links, IAccountContext account, CancellationToken ct, int maxPoints = 1000) =>
            Results.Ok(await links.ResultAsync(id, account.UserId, repetition, maxPoints, ct))).Produces<AnalysisResult>();
        group.MapPost("/from-coach/{id:guid}/video-url", async (Guid id, AnalysisWorkoutLinks links, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await links.VideoUrlAsync(id, account.UserId, ct))).Produces<CoachAnalysisVideoUrl>();
        group.MapPost("/{id:guid}/cancel", async (Guid id, HttpRequest request, AnalysisLibrary library, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            await library.CancelAsync(id, account.UserId, Version(request), ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapGet("/{id:guid}/result", async (Guid id, int? repetition, AnalysisLibrary library, IAccountContext account, CancellationToken ct, int maxPoints = 1000) =>
        {
            await RequireReadAsync(await library.GetAsync(id, account.UserId, ct), account, ct);
            return Results.Ok(await library.ResultAsync(id, account.UserId, repetition, maxPoints, ct));
        }).Produces<AnalysisResult>();
        group.MapGet("/compare", async (Guid leftId, Guid rightId, int? leftRepetition, int? rightRepetition, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct, int maxPoints = 1000) =>
        {
            await features.RequireAsync("video.analysis.compare", ct);
            return Results.Ok(await library.CompareAsync(leftId, rightId, account.UserId, leftRepetition, rightRepetition, maxPoints, ct));
        }).Produces<AnalysisComparison>();
        // Read-only links: the owner creates or revokes one per completed analysis; any signed-in user with
        // the token may read the result and the video. Library features are not required to view.
        group.MapGet("/{id:guid}/share", async (Guid id, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
            await sharing.CurrentAsync(id, account.UserId, ct) is { } share ? Results.Ok(share) : Results.NoContent())
            .Produces<AnalysisShareDto>().Produces(StatusCodes.Status204NoContent);
        group.MapPost("/{id:guid}/share", async (Guid id, ShareRequest? input, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await sharing.ShareAsync(id, account.UserId, ct, input?.AllowSave))).Produces<AnalysisShareDto>();
        group.MapDelete("/{id:guid}/share", async (Guid id, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
        {
            await sharing.RevokeAsync(id, account.UserId, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapGet("/shared/{token}", async (string token, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await sharing.ReadAsync(token, account.UserId, ct))).Produces<SharedAnalysisDto>();
        // Keeping a shared analysis stores only a reference to the owner's analysis, never a copy.
        group.MapPost("/shared/{token}/save", async (string token, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
        {
            await sharing.SaveAsync(token, account.UserId, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapDelete("/shared/{token}/save", async (string token, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
        {
            await sharing.UnsaveAsync(token, account.UserId, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapGet("/saved", async (AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await sharing.SavedAsync(account.UserId, ct))).Produces<SavedAnalysisDto[]>();
        group.MapGet("/shared/{token}/result", async (string token, int? repetition, AnalysisSharing sharing, CancellationToken ct, int maxPoints = 1000) =>
            Results.Ok(await sharing.ResultAsync(token, repetition, maxPoints, ct))).Produces<AnalysisResult>();
        group.MapPost("/shared/{token}/video-url", async (string token, AnalysisSharing sharing, IAccountContext account, CancellationToken ct) =>
            Results.Ok(await sharing.VideoUrlAsync(token, account.UserId, ct))).Produces<SharedVideoUrl>();
        return endpoints;
    }

    private static long Version(HttpRequest request) => RequestPreconditions.RequireMediaVersion(request);
    private static async Task RequireReadAsync(AnalysisDto job, IAccountContext account, CancellationToken ct)
    {
        var roles = await account.GetRolesAsync(ct);
        if (job.ExecutionLocation != "client" && !roles.Contains(AccountRole.Coach))
            throw ApiException.NotFound();
    }
}
