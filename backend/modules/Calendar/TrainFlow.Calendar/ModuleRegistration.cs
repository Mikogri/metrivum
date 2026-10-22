using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Calendar.Features;
using TrainFlow.Calendar.Infrastructure;

namespace TrainFlow.Calendar;

public static class ModuleRegistration
{
    public static IServiceCollection AddCalendar(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TrainFlow.Coaching.Contracts.ITeamRelationshipLifecycle, TeamCalendarLifecycle>();
        services.AddModuleDatabase<CalendarDbContext>("calendar");
        services.AddScoped<CalendarService>();
        services.AddScoped<TrainFlow.Calendar.Contracts.IMcpCalendarOperations, McpCalendarOperations>();
        services.AddScoped<TrainFlow.Notifications.Contracts.INotificationDeliveryPolicy, CalendarNotificationPolicy>();
        foreach (var key in new[] { "calendar.events.manage", "calendar.events.read-own", "calendar.invitations.respond-own" })
            services.AddSingleton(new FeatureDefinition(key, "Calendar", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IEndpointRouteBuilder MapCalendar(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/calendar").WithTags("Calendar").RequireAuthorization();
        group.MapGet("/events", (string? role, DateTimeOffset from, DateTimeOffset to, string? timeZone, int? page, int? pageSize, CalendarService service, CancellationToken ct) => service.List(role ?? "client", from, to, timeZone ?? "UTC", page ?? 1, pageSize ?? 100, ct));
        group.MapGet("/events/{id:guid}", async (Guid id, string? role, CalendarService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.Detail(id, role ?? "client", ct))).Produces<EventDto>();
        group.MapPost("/events", async (EventWrite request, CalendarService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.Write(null, request, 0, ct))).Produces<EventDto>();
        group.MapPatch("/events/{id:guid}", async (Guid id, EventWrite request, CalendarService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.Write(id, request, Version(http), ct))).Produces<EventDto>();
        group.MapPost("/events/{id:guid}/cancel", async (Guid id, CalendarService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.Cancel(id, Version(http), ct))).Produces<EventDto>();
        group.MapPost("/events/{id:guid}/response", async (Guid id, EventResponse request, CalendarService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.Respond(id, request, Version(http), ct))).Produces<EventDto>();
        return endpoints;
    }
    private static IResult Versioned(HttpContext http, EventDto dto)
    {
        http.Response.Headers.ETag = $"\"{dto.ResponseVersion ?? dto.Version}\"";
        return Results.Ok(dto);
    }
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
}
