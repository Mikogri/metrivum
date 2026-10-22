using TrainFlow.Analytics.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Media.Contracts;
using TrainFlow.Messaging.Domain;
using TrainFlow.Messaging.Features;
using TrainFlow.Messaging.Infrastructure;
using System.Text.Json.Serialization;

namespace TrainFlow.Messaging;

public static class ModuleRegistration
{
    public static IServiceCollection AddMessaging(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<MessagingDbContext>("messaging");
        services.AddOptions<MessagingAbuseOptions>().Bind(configuration.GetSection("AbuseProtection:Messaging"))
            .Validate(x => x.StrangerContactsPerHour is > 0 and <= 100 && x.UnestablishedContactsPerDay is > 0 and <= 100
                && x.GroupsPerDay is > 0 and <= 100 && x.MaximumRecipients is > 0 and <= 100, "Invalid messaging abuse limits.").ValidateOnStart();
        services.AddScoped<MessagingService>();
        services.AddScoped<TrainFlow.Messaging.Contracts.IMcpMessageOperations>(p => p.GetRequiredService<MessagingService>());
        services.AddScoped<IMessagingAnalytics, MessagingAnalytics>();
        services.AddScoped<ICoachingMessagingObserver>(p => p.GetRequiredService<MessagingService>());
        services.AddScoped<ICoachingChatPublisher>(p => p.GetRequiredService<MessagingService>());
        services.AddScoped<IMessagingUploadAuthorization>(p => p.GetRequiredService<MessagingService>());
        services.AddScoped<MessagingDispatcher>();
        services.AddSingleton<MessagingHubAbuse>();
        services.AddSignalR(options => { options.MaximumReceiveMessageSize = 16384; options.MaximumParallelInvocationsPerClient = 1; options.AddFilter<MessagingHubAbuse>(); }).AddJsonProtocol(options =>
            options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        services.AddSingleton<IUserIdProvider, MessagingUserIdProvider>();
        services.TryAddSingleton(TimeProvider.System);
        services.Configure<MessagingOptions>(configuration.GetSection("Messaging"));
        foreach (var key in new[]
        {
            "messaging.direct",
            "messaging.groups",
            "messaging.group.manage",
            "messaging.attachments",
            "messaging.voice",
            "messaging.report"
        }

        )
            services.AddSingleton(new FeatureDefinition(key, "Messaging", key + ".title", key + ".description", [], []));
        return services;
    }

    public static IEndpointRouteBuilder MapMessaging(this IEndpointRouteBuilder endpoints)
    {
        var g = endpoints.MapGroup("/api/v1/messaging").WithTags("Messaging").RequireAuthorization();
        var preferences = endpoints.MapGroup("/api/v1/me/messaging-preferences").WithTags("Messaging").RequireAuthorization();
        preferences.MapGet("", (MessagingService s, CancellationToken ct) => s.PreferencesAsync(ct));
        preferences.MapPut("", (MessagingPreferenceDto input, MessagingService s, CancellationToken ct) => s.SavePreferencesAsync(input, ct));
        g.MapGet("/people", (string search, MessagingService s, CancellationToken ct) => s.SearchPeopleAsync(search, ct));
        g.MapGet("/conversations", (string? search, int? limit, int? page, MessagingService s, CancellationToken ct) => s.ListAsync(search, limit ?? 25, ct, page ?? 1));
        g.MapPost("/conversations/direct", (DirectRequest r, MessagingService s, CancellationToken ct) => s.DirectAsync(r.UserId, ct));
        g.MapPost("/conversations/group", (GroupRequest r, MessagingService s, CancellationToken ct) => s.GroupAsync(r, ct));
        g.MapGet("/conversations/{id:guid}", (Guid id, MessagingService s, CancellationToken ct) => s.GetAsync(id, ct));
        g.MapPatch("/conversations/{id:guid}", async (Guid id, RenameRequest r, MessagingService s, CancellationToken ct) =>
        {
            await s.RenameAsync(id, r.Title, ct);
            return Results.NoContent();
        });
        g.MapGet("/conversations/{id:guid}/messages", (Guid id, string? before, string? after, int? limit, MessagingService s, CancellationToken ct) => s.HistoryAsync(id, before, after, limit ?? 50, ct));
        g.MapPost("/conversations/{id:guid}/messages", (Guid id, SendMessageRequest r, HttpContext h, MessagingService s, CancellationToken ct) => s.SendAsync(id, r, h.Request.Headers["Idempotency-Key"].ToString(), ct));
        g.MapPost("/conversations/{id:guid}/read", async (Guid id, ReadRequest r, MessagingService s, CancellationToken ct) =>
        {
            await s.ReadAsync(id, r.MessageId, ct);
            return Results.NoContent();
        });
        g.MapGet("/conversations/{id:guid}/members", (Guid id, MessagingService s, CancellationToken ct) => s.MembersAsync(id, ct));
        g.MapPost("/conversations/{id:guid}/members", async (Guid id, AddMemberRequest r, MessagingService s, CancellationToken ct) =>
        {
            await s.MemberAsync(id, r.UserId, "add", ct);
            return Results.NoContent();
        });
        g.MapDelete("/conversations/{id:guid}/members/{userId:guid}", async (Guid id, Guid userId, MessagingService s, CancellationToken ct) =>
        {
            await s.MemberAsync(id, userId, "remove", ct);
            return Results.NoContent();
        });
        g.MapPost("/conversations/{id:guid}/members/{userId:guid}/ban", async (Guid id, Guid userId, MessagingService s, CancellationToken ct) =>
        {
            await s.MemberAsync(id, userId, "ban", ct);
            return Results.NoContent();
        });
        g.MapPost("/conversations/{id:guid}/members/{userId:guid}/unban", async (Guid id, Guid userId, MessagingService s, CancellationToken ct) =>
        {
            await s.MemberAsync(id, userId, "unban", ct);
            return Results.NoContent();
        });
        g.MapGet("/requests", (int? page, int? limit, MessagingService s, CancellationToken ct) => s.RequestsAsync(ct, page, limit));
        g.MapPost("/requests", (ContactRequest r, MessagingService s, CancellationToken ct) => s.RequestAsync(r, ct));
        g.MapPost("/requests/by-username", (UsernameContactRequest r, MessagingService s, CancellationToken ct) => s.RequestByUsernameAsync(r, ct));
        foreach (var (action, state) in new[]
        {
            ("accept", RequestState.Accepted),
            ("decline", RequestState.Declined),
            ("cancel", RequestState.Cancelled)
        }

        )
            g.MapPost("/requests/{id:guid}/" + action, (Guid id, MessagingService s, CancellationToken ct) => s.RespondAsync(id, state, ct));
        g.MapDelete("/messages/{id:guid}", (Guid id, MessagingService s, CancellationToken ct) => s.DeleteAsync(id, ct));
        g.MapPost("/messages/{id:guid}/report", async (Guid id, ReportRequest r, MessagingService s, CancellationToken ct) => Results.Ok(new ReportCreatedDto(await s.ReportAsync(id, r, ct)))).Produces<ReportCreatedDto>();
        g.MapGet("/messages/{messageId:guid}/attachments/{mediaId:guid}", async (Guid messageId, Guid mediaId, MessagingService s, HttpContext h, CancellationToken ct) =>
        {
            var file = await s.AttachmentAsync(messageId, mediaId, ct);
            h.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.Stream(file.Stream, file.ContentType, fileDownloadName: mediaId.ToString());
        });
        var me = endpoints.MapGroup("/api/v1/me/blocked-users").WithTags("Messaging").RequireAuthorization();
        me.MapGet("", (MessagingService s, CancellationToken ct) => s.BlocksAsync(ct));
        me.MapPost("/{userId:guid}", async (Guid userId, MessagingService s, CancellationToken ct) =>
        {
            await s.BlockAsync(userId, true, ct);
            return Results.NoContent();
        });
        me.MapDelete("/{userId:guid}", async (Guid userId, MessagingService s, CancellationToken ct) =>
        {
            await s.BlockAsync(userId, false, ct);
            return Results.NoContent();
        });
        var linked = endpoints.MapGroup("/api/v1/coaching/groups/{groupId:guid}/conversation").WithTags("Messaging").RequireAuthorization();
        linked.MapPost("", (Guid groupId, MessagingService s, CancellationToken ct) => s.LinkAsync(groupId, true, ct));
        linked.MapGet("", (Guid groupId, MessagingService s, CancellationToken ct) => s.LinkAsync(groupId, false, ct));
        endpoints.MapHub<MessagingHub>("/api/v1/messaging/hub", o => o.CloseOnAuthenticationExpiration = true).RequireAuthorization();
        return endpoints;
    }
}
