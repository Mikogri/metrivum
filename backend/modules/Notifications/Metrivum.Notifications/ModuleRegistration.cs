using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Metrivum.Notifications;

public sealed record NotificationCountDto(int Count);

/// <summary>Registers Notifications services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddNotifications(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddNotificationPublishing(configuration);
        services.AddScoped<NotificationsService>();
        services.AddScoped<NotificationsDelivery>();
        services.AddScoped<PushDevices>();
        services.AddScoped<MobilePushDelivery>();
        services
            .AddOptions<ExpoPushOptions>()
            .Bind(configuration.GetSection("Notifications:ExpoPush"));
        services.AddHttpClient<ExpoPushTransport>(client =>
            client.Timeout = TimeSpan.FromSeconds(15)
        );
        services.AddSignalR();
        services.AddScoped<INotificationReadStore, NotificationReadStore>();
        return services;
    }

    public static IServiceCollection AddNotificationPublishing(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddModuleDatabase<NotificationsDbContext>("notifications");
        services.TryAddSingleton<WorkerWakeup<NotificationsWorker>>();
        services.AddScoped<INotificationPublisher, NotificationPublisher>();
        services.AddScoped<IProgramEndingAlertPreferences, ProgramEndingAlertPreferences>();
        services.TryAddSingleton(TimeProvider.System);
        return services;
    }

    public static IServiceCollection AddNotificationsWorker(this IServiceCollection services)
    {
        services.AddHostedService<NotificationsWorker>();
        return services;
    }

    public static IEndpointRouteBuilder MapNotifications(this IEndpointRouteBuilder e)
    {
        var g = e.MapGroup("/api/v1/me").WithTags("Notifications").RequireAuthorization();
        g.AddEndpointFilter(
            async (context, next) =>
            {
                var accounts =
                    context.HttpContext.RequestServices.GetRequiredService<IAccountContext>();
                await accounts.GetRolesAsync(context.HttpContext.RequestAborted);
                return await next(context);
            }
        );
        g.MapGet(
            "/notifications",
            (
                int? page,
                int? pageSize,
                bool? unread,
                Guid? activeConversation,
                NotificationsService s,
                CancellationToken ct
            ) => s.ListAsync(page ?? 1, pageSize ?? 25, unread ?? false, ct, activeConversation)
        );
        g.MapGet(
            "/notifications/{id:guid}",
            (Guid id, NotificationsService s, CancellationToken ct) => s.GetAsync(id, ct)
        );
        g.MapPut(
            "/notifications/devices/{installationId:guid}",
            (
                Guid installationId,
                RegisterPushDeviceRequest input,
                PushDevices devices,
                CancellationToken ct
            ) => devices.RegisterAsync(installationId, input, ct)
        );
        g.MapDelete(
            "/notifications/devices/{installationId:guid}",
            async (Guid installationId, PushDevices devices, CancellationToken ct) =>
            {
                await devices.RemoveAsync(installationId, ct);
                return Results.NoContent();
            }
        );
        g.MapGet(
            "/notifications/unread-count",
            async (Guid? activeConversation, NotificationsService s, CancellationToken ct) =>
                TypedResults.Ok(
                    new NotificationCountDto(await s.CountAsync(ct, activeConversation))
                )
        );
        g.MapPost(
            "/notifications/{id:guid}/read",
            async (Guid id, NotificationsService s, CancellationToken ct) =>
            {
                await s.ReadAsync(id, ct);
                return Results.NoContent();
            }
        );
        g.MapPost(
            "/notifications/read-target",
            async (
                NotificationTargetRequest request,
                NotificationsService s,
                CancellationToken ct
            ) => TypedResults.Ok(new NotificationCountDto(await s.ReadTargetAsync(request, ct)))
        );
        g.MapPost(
            "/notifications/read-all",
            async (NotificationsService s, CancellationToken ct) =>
            {
                await s.ReadAllAsync(ct);
                return Results.NoContent();
            }
        );
        g.MapGet(
            "/notification-preferences",
            (NotificationsService s, CancellationToken ct) => s.PreferencesAsync(ct)
        );
        g.MapPatch(
            "/notification-preferences",
            async (PreferenceRequest r, NotificationsService s, CancellationToken ct) =>
            {
                await s.UpdatePreferencesAsync(r, ct);
                return Results.NoContent();
            }
        );
        e.MapHub<NotificationsHub>(
                "/api/v1/notifications/hub",
                o => o.CloseOnAuthenticationExpiration = true
            )
            .RequireAuthorization();
        return e;
    }
}
