using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public static class VideoAnalysisModule
{
    public static IServiceCollection AddVideoAnalysis(this IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDatabase<VideoAnalysisDbContext>("video_analysis");
        services.AddOptions<AnalysisOptions>().Bind(config.GetSection("Analysis")).Validate(x => x.MaxConcurrentPerOwner is >= 1 and <= 100
            && x.MaxAttempts is >= 1 and <= 10 && x.LeaseSeconds is >= 15 and <= 600 && x.HeartbeatSeconds >= 1 && x.HeartbeatSeconds * 3 <= x.LeaseSeconds
            && x.PollSeconds is >= 1 and <= 60 && x.MaxRunSeconds is >= 10 and <= 14400 && x.MaxResultPoints is >= 2 and <= 100000
            && x.MaxResultBytes is >= 1024 and <= 16777216, "Invalid analysis limits.").ValidateOnStart();
        services.TryAddSingleton<IVideoAnalyzer, UnavailableVideoAnalyzer>();
        services.AddScoped<AnalysisLibrary>();
        services.AddScoped<AnalysisQueue>();
        services.AddScoped<ILimitUsageProvider, AnalysisLimitUsage>();
        services.AddSingleton(new FeatureDefinition("video.analysis.run", "VideoAnalysis", "features.video.analysis.run.title", "features.video.analysis.run.description", ["video.library.manage"], ["analysis.concurrent"]));
        services.AddSingleton(new FeatureDefinition("video.analysis.compare", "VideoAnalysis", "features.video.analysis.compare.title", "features.video.analysis.compare.description", [], []));
        return services;
    }

    public static IEndpointRouteBuilder MapVideoAnalysis(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/analyses").RequireAuthorization().WithTags("VideoAnalysis");
        group.MapPost("/", async (CreateAnalysisRequest input, HttpRequest request, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.analysis.run", ct);
            var job = await library.CreateAsync(account.UserId, request.Headers["Idempotency-Key"].ToString(), input, ct);
            return Results.Accepted($"/api/v1/analyses/{job.Id}", job);
        }).Produces<AnalysisDto>(StatusCodes.Status202Accepted);
        group.MapGet("/", async (AnalysisLibrary library, IAccountContext account, string? search, string? status, string? tag, string? sort, CancellationToken ct, int page = 1, int pageSize = 25) =>
        {
            await account.RequireCoachAsync(ct);
            return Results.Ok(await library.ListAsync(account.UserId, search, status, tag, sort, page, pageSize, ct));
        }).Produces<AnalysisDto[]>();
        group.MapGet("/{id:guid}", async (Guid id, AnalysisLibrary library, IAccountContext account, HttpResponse response, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            var job = await library.GetAsync(id, account.UserId, ct);
            response.Headers.ETag = $"\"{job.Version}\"";
            return Results.Ok(job);
        }).Produces<AnalysisDto>();
        group.MapPut("/{id:guid}", async (Guid id, UpdateAnalysisRequest input, HttpRequest request, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct) =>
        {
            await features.RequireAsync("video.library.manage", ct);
            await library.UpdateAsync(id, account.UserId, Version(request), input, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapPost("/{id:guid}/cancel", async (Guid id, HttpRequest request, AnalysisLibrary library, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            await library.CancelAsync(id, account.UserId, Version(request), ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);
        group.MapGet("/{id:guid}/result", async (Guid id, int? repetition, AnalysisLibrary library, IAccountContext account, CancellationToken ct, int maxPoints = 1000) =>
        {
            await account.RequireCoachAsync(ct);
            return Results.Ok(await library.ResultAsync(id, account.UserId, repetition, maxPoints, ct));
        }).Produces<AnalysisResult>();
        group.MapGet("/compare", async (Guid leftId, Guid rightId, int? leftRepetition, int? rightRepetition, AnalysisLibrary library, IAccountContext account, IFeatureAccessService features, CancellationToken ct, int maxPoints = 1000) =>
        {
            await features.RequireAsync("video.analysis.compare", ct);
            return Results.Ok(await library.CompareAsync(leftId, rightId, account.UserId, leftRepetition, rightRepetition, maxPoints, ct));
        }).Produces<AnalysisComparison>();
        return endpoints;
    }

    private static long Version(HttpRequest request) => long.TryParse(request.Headers.IfMatch.ToString().Trim('"'), out var version)
        ? version : throw new ApiException(428, "IF_MATCH_REQUIRED", "Supply the current version in If-Match.");
}
