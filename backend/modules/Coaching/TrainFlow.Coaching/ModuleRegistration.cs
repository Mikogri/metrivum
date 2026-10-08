using TrainFlow.Analytics.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Features;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.Coaching;

public static class ModuleRegistration
{
    public static IServiceCollection AddCoaching(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<CoachingDbContext>("coaching");
        services.AddScoped<CoachingService>();
        services.AddScoped<TeamClientsService>();
        services.AddScoped<ITeamLifecycle>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<ITeamCaseAccess>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<INotificationDeliveryPolicy>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<ICoachingAnalytics, CoachingAnalytics>();
        services.AddScoped<IRelationshipAccessPolicy>(p => p.GetRequiredService<CoachingService>());
        services.AddScoped<IRelationshipActivation>(p => p.GetRequiredService<CoachingService>());
        services.AddScoped<IRelationshipRecipients, RelationshipRecipients>();
        services.AddScoped<ICoachingMessagingDirectory, CoachingMessagingDirectory>();
        services.AddScoped<ILimitUsageProvider, CoachingUsageProvider>();
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "coaching.clients.view", "coaching.clients.manage", "coaching.groups.manage", "coaching.relationships.read-own" })
            services.AddSingleton(new FeatureDefinition(key, "Coaching", key + ".title", key + ".description", key == "coaching.clients.manage" ? ["coaching.clients.view"] : [], []));
        return services;
    }
    public static IEndpointRouteBuilder MapCoaching(this IEndpointRouteBuilder endpoints)
    {
        MapTeamClients(endpoints);
        var group = endpoints.MapGroup("/api/v1/coaching").WithTags("Coaching").RequireAuthorization();
        group.MapGet("/clients", (int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, Guid[]? groupIds, Guid? teamId, CoachingService service, CancellationToken ct) => service.ClientsAsync(Query(page, pageSize, search, sort, status, groupIds, teamId), ct));
        group.MapGet("/clients/{id:guid}", async (Guid id, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ClientAsync(id, ct))).Produces<CoachRelationshipDto>();
        group.MapGet("/my-coaches", (int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, CoachingService service, CancellationToken ct) => service.MyCoachesAsync(Query(page, pageSize, search, sort, status, null), ct));
        group.MapGet("/relationships/{id:guid}", async (Guid id, CoachingService service, HttpContext http, CancellationToken ct) =>
        {
            var result = await service.RelationshipDetailsAsync(id, ct);
            if (result is CoachRelationshipDto coach)
                http.Response.Headers.ETag = $"\"{coach.Version}\"";
            return Results.Ok(result);
        }).Produces<ClientRelationshipDto>().Produces<CoachRelationshipDto>();
        group.MapPost("/relationships/{id:guid}/suspend", async (Guid id, StatusRequest request, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, RelationshipStatus.Suspended, request, Version(http), ct))).Produces<CoachRelationshipDto>();
        group.MapPost("/relationships/{id:guid}/resume", async (Guid id, StatusRequest request, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, RelationshipStatus.Active, request, Version(http), ct))).Produces<CoachRelationshipDto>();
        group.MapPost("/relationships/{id:guid}/complete", async (Guid id, StatusRequest request, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ChangeStatusAsync(id, RelationshipStatus.Completed, request, Version(http), ct))).Produces<CoachRelationshipDto>();
        group.MapGet("/groups", (int? page, int? pageSize, string? search, string? sort, bool? archived, Guid? teamId, CoachingService service, CancellationToken ct) => service.GroupsAsync(page ?? 1, pageSize ?? 25, search, sort ?? "updated", archived ?? false, ct, teamId));
        group.MapPost("/groups", async (GroupRequest request, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CreateGroupAsync(request, ct))).Produces<GroupDto>();
        group.MapGet("/groups/{id:guid}", async (Guid id, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.GroupAsync(id, ct))).Produces<GroupDto>();
        group.MapPatch("/groups/{id:guid}", async (Guid id, GroupRequest request, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.UpdateGroupAsync(id, request, Version(http), ct))).Produces<GroupDto>();
        group.MapPost("/groups/{id:guid}/archive", async (Guid id, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ArchiveGroupAsync(id, true, Version(http), ct))).Produces<GroupDto>();
        group.MapPost("/groups/{id:guid}/restore", async (Guid id, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ArchiveGroupAsync(id, false, Version(http), ct))).Produces<GroupDto>();
        group.MapGet("/groups/{id:guid}/members", (Guid id, int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, CoachingService service, CancellationToken ct) => service.MembersAsync(id, Query(page, pageSize, search, sort, status, null), ct));
        group.MapPut("/groups/{groupId:guid}/members/{relationshipId:guid}", async (Guid groupId, Guid relationshipId, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.MembershipAsync(groupId, relationshipId, true, Version(http), ct))).Produces<GroupDto>();
        group.MapDelete("/groups/{groupId:guid}/members/{relationshipId:guid}", async (Guid groupId, Guid relationshipId, CoachingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.MembershipAsync(groupId, relationshipId, false, Version(http), ct))).Produces<GroupDto>();
        return endpoints;
    }
    private static void MapTeamClients(IEndpointRouteBuilder endpoints)
    {
        var teams = endpoints.MapGroup("/api/v1/teams/{teamId:guid}").WithTags("TeamClients").RequireAuthorization();
        teams.MapGet("/clients", (Guid teamId, TeamClientsService service, CancellationToken ct) => service.ListAsync(teamId, ct)).Produces<TeamClientCaseDto[]>();
        teams.MapGet("/clients/{caseId:guid}", (Guid teamId, Guid caseId, TeamClientsService service, CancellationToken ct) => service.GetAsync(teamId, caseId, ct)).Produces<TeamClientCaseDto>();
        teams.MapPost("/clients/{caseId:guid}/assign-coach", (Guid teamId, Guid caseId, AssignTeamCoach input, TeamClientsService service, CancellationToken ct) => service.AssignAsync(teamId, caseId, input, ct)).Produces<TeamClientCaseDto>();
        teams.MapDelete("/clients/{caseId:guid}/assignments/{coachId:guid}", (Guid teamId, Guid caseId, Guid coachId, [Microsoft.AspNetCore.Mvc.FromBody] TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.UnassignAsync(teamId, caseId, coachId, input.Version, ct)).Produces<TeamClientCaseDto>();
        teams.MapPost("/client-transfer-requests", (Guid teamId, RequestTeamTransfer input, TeamClientsService service, CancellationToken ct) => service.RequestAsync(teamId, input, ct)).Produces<TeamClientTransferDto>();
        teams.MapGet("/client-transfer-requests", (Guid teamId, TeamClientsService service, CancellationToken ct) => service.RequestsAsync(teamId, ct)).Produces<TeamClientTransferDto[]>();
        var incoming = endpoints.MapGroup("/api/v1/me/team-client-transfer-requests").WithTags("TeamClients").RequireAuthorization();
        incoming.MapGet("/", (TeamClientsService service, CancellationToken ct) => service.IncomingAsync(ct)).Produces<TeamClientTransferDto[]>();
        incoming.MapPost("/{id:guid}/accept", (Guid id, TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.DecideAsync(id, true, input.Version, ct)).Produces<TeamClientTransferDto>();
        incoming.MapPost("/{id:guid}/decline", (Guid id, TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.DecideAsync(id, false, input.Version, ct)).Produces<TeamClientTransferDto>();
    }
    private static CoachingListQuery Query(int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, Guid[]? groupIds, Guid? teamId = null) => new() { Page = page ?? 1, PageSize = pageSize ?? 25, Search = search, Sort = sort ?? "updated", Status = status, GroupIds = groupIds ?? [], TeamId = teamId };
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, CoachRelationshipDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
    private static IResult Versioned(HttpContext http, GroupDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
}
internal sealed class CoachingUsageProvider(CoachingDbContext db) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken ct) => [new("coaching.active-clients", long.MaxValue, await db.Relationships.LongCountAsync(x => x.CoachId == ownerId && x.Status == RelationshipStatus.Active, ct))];
}
