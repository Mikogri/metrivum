using TrainFlow.Notifications.Contracts;
using TrainFlow.Analytics.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.CheckIns.Domain;
using TrainFlow.CheckIns.Features;
using TrainFlow.CheckIns.Infrastructure;

namespace TrainFlow.CheckIns;

public static class ModuleRegistration
{
    public static IServiceCollection AddCheckIns(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TrainFlow.Coaching.Contracts.ITeamRelationshipLifecycle, TeamCheckInLifecycle>();
        services.AddModuleDatabase<CheckInsDbContext>("checkins");
        services.AddScoped<CheckInsService>();
        services.AddScoped<TrainFlow.Training.Contracts.IAssignedProgramScheduleObserver, AssignedProgramScheduleObserver>();
        services.AddScoped<INotificationDeliveryPolicy, CheckInNotificationPolicy>();
        services.AddScoped<ICheckInsAnalytics, CheckInsAnalytics>();
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "checkins.schedules.manage", "checkins.respond-own", "checkins.review" })
            services.AddSingleton(new FeatureDefinition(key, "CheckIns", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IServiceCollection AddCheckInsWorker(this IServiceCollection services)
    {
        services.AddHostedService<CheckInsWorker>();
        return services;
    }
    public static IEndpointRouteBuilder MapCheckIns(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/check-ins").WithTags("CheckIns").RequireAuthorization();
        group.MapGet("/assigned-programs", (Guid relationshipId, CheckInsService service, CancellationToken ct) => service.AssignedProgramsAsync(relationshipId, ct));
        group.MapGet("/calendar", (string? role, string? kind, DateTimeOffset from, DateTimeOffset to, int? page, int? pageSize, CheckInsService service, CancellationToken ct) => service.CalendarAsync(role ?? "client", kind ?? "Request", from, to, page ?? 1, pageSize ?? 100, ct));
        group.MapGet("/schedules", (int? page, int? pageSize, string? search, string? sort, ScheduleStatus? status, Guid? relationshipId, CheckInsService service, CancellationToken ct) => service.SchedulesAsync(page ?? 1, pageSize ?? 25, search, sort ?? "updated", status, ct, relationshipId));
        group.MapPost("/schedules", async (ScheduleRequest request, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CreateAsync(request, ct))).Produces<ScheduleDto>();
        group.MapGet("/schedules/{id:guid}", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ScheduleAsync(id, ct))).Produces<ScheduleDto>();
        group.MapPatch("/schedules/{id:guid}", async (Guid id, ScheduleRequest request, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.UpdateAsync(id, request, Version(http), ct))).Produces<ScheduleDto>();
        group.MapPost("/schedules/{id:guid}/pause", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, ScheduleStatus.Paused, Version(http), ct))).Produces<ScheduleDto>();
        group.MapPost("/schedules/{id:guid}/resume", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, ScheduleStatus.Active, Version(http), ct))).Produces<ScheduleDto>();
        group.MapPost("/schedules/{id:guid}/end", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, ScheduleStatus.Ended, Version(http), ct))).Produces<ScheduleDto>();
        group.MapGet("/requests", (int? page, int? pageSize, string? search, string? sort, RequestStatus? status, Guid? relationshipId, Guid? scheduleId, string? role, DateTimeOffset? from, DateTimeOffset? to, Guid? formTemplateId, CheckInsService service, CancellationToken ct) => service.RequestsAsync(page ?? 1, pageSize ?? 25, search, sort ?? "due", status, relationshipId, scheduleId, role ?? "client", ct, from, to, formTemplateId));
        group.MapGet("/relationships/{id:guid}/requests/{requestId:guid}", async (Guid id, Guid requestId, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.RelationshipDetailAsync(id, requestId, ct))).Produces<CheckInDetailDto>();
        group.MapGet("/relationships/{id:guid}/summary", (Guid id, CheckInsService service, CancellationToken ct) => service.SummaryAsync(id, ct));
        group.MapGet("/requests/{id:guid}", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.DetailAsync(id, ct))).Produces<CheckInDetailDto>();
        group.MapPost("/requests/{id:guid}/submit", async (Guid id, SubmitCheckInRequest request, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.SubmitAsync(id, request, Version(http), ct))).Produces<CheckInDetailDto>();
        group.MapPost("/requests/{id:guid}/review", async (Guid id, ReviewCheckInRequest request, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ReviewAsync(id, request, Version(http), ct))).Produces<CheckInDetailDto>();
        group.MapPost("/requests/{id:guid}/cancel", async (Guid id, CheckInsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CancelAsync(id, Version(http), ct))).Produces<CheckInDetailDto>();
        return endpoints;
    }
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, ScheduleDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
    private static IResult Versioned(HttpContext http, CheckInDetailDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Request.Version}\"";
        return Results.Ok(value);
    }
}
public sealed class CheckInsWorker(IServiceScopeFactory scopes, IConfiguration configuration, IHostEnvironment environment, ILogger<CheckInsWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!(configuration.GetValue<bool?>("CheckIns:Worker:Enabled") ?? !environment.IsEnvironment("Testing")))
            return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        // Poll only after startup so deployment migration commands can complete without racing this driver.
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<CheckInsService>().GenerateDueAsync(25, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { logger.LogError(ex, "Check-in generation polling failed; persisted schedules will be retried."); }
        }
    }
}
