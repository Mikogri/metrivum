using Metrivum.Analytics.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Notifications.Contracts;

namespace Metrivum.Coaching;

/// <summary>Registers Coaching services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddCoaching(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<CoachingDbContext>("coaching");
        services.AddScoped<CoachingService>();
        services.AddScoped<ClientCapacity>();
        services.AddScoped<IMcpClientOperations, Metrivum.Coaching.Features.McpClientOperations>();
        services.AddScoped<TeamClientsService>();
        services.AddScoped<CoachShowcaseService>();
        services.AddScoped<CoachDiscoveryService>();
        services.AddScoped<CoachSpecializationsService>();
        services.AddScoped<ITeamLifecycle>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<ITeamCaseAccess>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<INotificationDeliveryPolicy>(p => p.GetRequiredService<TeamClientsService>());
        services.AddScoped<ICoachingAnalytics, CoachingAnalytics>();
        services.AddScoped<Metrivum.Offers.Contracts.IOfferUsage, CoachingOfferUsage>();
        services.AddScoped<IRelationshipAccessPolicy>(p => p.GetRequiredService<CoachingService>());
        services.AddScoped<IRelationshipActivation>(p => p.GetRequiredService<CoachingService>());
        services.AddScoped<IRelationshipRecipients, RelationshipRecipients>();
        services.AddScoped<ICoachingMessagingDirectory, CoachingMessagingDirectory>();
        services.AddScoped<ILimitUsageProvider, CoachingUsageProvider>();
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "coaching.clients.view", "coaching.clients.manage", "coaching.groups.manage", "coaching.relationships.read-own" })
            services.AddSingleton(new FeatureDefinition(key, "Coaching", key + ".title", key + ".description", key == "coaching.clients.manage" ? ["coaching.clients.view"] : [], []));
        foreach (var key in new[] { "discovery.coaches.search", "discovery.coach-profile.publish", "discovery.ranking.priority" })
            services.AddSingleton(new FeatureDefinition(key, "Coaching", key + ".title", key + ".description", [], []));
        return services;
    }
    /// <summary>The coach's public profile extras and portfolio: read by any signed-in person, edited by the coach.</summary>
    private static void MapShowcase(IEndpointRouteBuilder endpoints)
    {
        var coaches = endpoints.MapGroup("/api/v1/coaches/{coachId:guid}/showcase").WithTags("Coach showcase").RequireAuthorization();
        coaches.MapGet("", (Guid coachId, CoachShowcaseService service, CancellationToken ct) => service.GetAsync(coachId, ct)).Produces<CoachShowcaseDto>();
        coaches.MapPost("/cover/read-url", (Guid coachId, CoachShowcaseService service, CancellationToken ct) => service.ReadCoverAsync(coachId, ct)).Produces<Metrivum.Media.Contracts.DocumentReadUrl>();
        coaches.MapPost("/portfolio/{itemId:guid}/read-url", (Guid coachId, Guid itemId, CoachShowcaseService service, CancellationToken ct) => service.ReadAsync(coachId, itemId, ct)).Produces<Metrivum.Media.Contracts.DocumentReadUrl>();
        var own = endpoints.MapGroup("/api/v1/me/coach-showcase").WithTags("Coach showcase").RequireAuthorization();
        own.MapPut("", (ShowcaseRequest request, CoachShowcaseService service, CancellationToken ct) => service.UpdateAsync(request, ct)).Produces<CoachShowcaseDto>();
        own.MapPost("/cover/uploads", (PortfolioUploadRequest request, CoachShowcaseService service, CancellationToken ct) => service.StartCoverUploadAsync(request, ct)).Produces<Metrivum.Media.Contracts.DocumentUpload>();
        own.MapPut("/cover", (CoverRequest request, CoachShowcaseService service, CancellationToken ct) => service.SetCoverAsync(request, ct)).Produces<CoachShowcaseDto>();
        own.MapDelete("/cover", (CoachShowcaseService service, CancellationToken ct) => service.RemoveCoverAsync(ct)).Produces<CoachShowcaseDto>();
        own.MapPost("/portfolio/uploads", (PortfolioUploadRequest request, CoachShowcaseService service, CancellationToken ct) => service.StartUploadAsync(request, ct)).Produces<Metrivum.Media.Contracts.DocumentUpload>();
        own.MapPost("/portfolio", (PortfolioItemRequest request, CoachShowcaseService service, CancellationToken ct) => service.AddAsync(request, ct)).Produces<PortfolioItemDto>();
        own.MapDelete("/portfolio/{itemId:guid}", async (Guid itemId, CoachShowcaseService service, CancellationToken ct) => { await service.RemoveAsync(itemId, ct); return Results.NoContent(); });
    }

    public static IEndpointRouteBuilder MapCoaching(this IEndpointRouteBuilder endpoints)
    {
        MapTeamClients(endpoints);
        MapShowcase(endpoints);
        endpoints.MapGet("/api/v1/coaching/specializations", (CoachSpecializationsService service, CancellationToken ct) => service.TaxonomyAsync(ct)).RequireAuthorization().WithTags("Coaching specializations").Produces<IReadOnlyList<SpecializationCategoryDto>>();
        var specializations = endpoints.MapGroup("/api/v1/me/coaching-specializations").RequireAuthorization().WithTags("Coaching specializations");
        specializations.MapGet("", (CoachSpecializationsService service, CancellationToken ct) => service.OwnAsync(ct)).Produces<CoachSpecializationsDto>();
        specializations.MapPut("", (CoachSpecializationsRequest request, CoachSpecializationsService service, CancellationToken ct) => service.SaveAsync(request, ct)).Produces<CoachSpecializationsDto>();
        var discovery = endpoints.MapGroup("/api/v1/discovery").WithTags("Discovery").RequireAuthorization().RequireRateLimiting("account-directory");
        discovery.MapGet("/coaches", (int? page, int? pageSize, string? search, string? specialization, string? specializations, string? mode, string? language, string? location, bool? hasOffers, string? offerCategory, CoachDiscoveryService service, CancellationToken ct) =>
            service.SearchAsync(page ?? 1, pageSize ?? 20, search, specialization, mode, language, location, hasOffers ?? false, offerCategory, ct, specializations)).Produces<CoachDiscoveryPage>();
        var ownDiscovery = endpoints.MapGroup("/api/v1/me/discovery").WithTags("Discovery").RequireAuthorization();
        ownDiscovery.MapGet("", (CoachDiscoveryService service, CancellationToken ct) => service.OwnAsync(ct)).Produces<DiscoveryProfileDto>();
        ownDiscovery.MapPut("", (DiscoveryProfileRequest request, CoachDiscoveryService service, CancellationToken ct) => service.SaveAsync(request, ct)).Produces<DiscoveryProfileDto>();
        var group = endpoints.MapGroup("/api/v1/coaching").WithTags("Coaching").RequireAuthorization();
        group.MapGet("/clients", (int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, Guid[]? groupIds, Guid? teamId, Guid? offerId, string? offerCategory, CoachingService service, CancellationToken ct) => service.ClientsAsync(Query(page, pageSize, search, sort, status, groupIds, teamId, offerId, offerCategory), ct));
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
        group.MapGet("/groups", (int? page, int? pageSize, string? search, string? sort, bool? archived, Guid? teamId, Guid? relationshipId, CoachingService service, CancellationToken ct) => service.GroupsAsync(page ?? 1, pageSize ?? 25, search, sort ?? "updated", archived ?? false, ct, teamId, relationshipId));
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
        teams.MapGet("/clients", (Guid teamId, int? page, int? pageSize, TeamClientsService service, CancellationToken ct) => service.ListAsync(teamId, ct, page, pageSize)).Produces<TeamClientCaseDto[]>();
        teams.MapGet("/clients/{caseId:guid}", (Guid teamId, Guid caseId, TeamClientsService service, CancellationToken ct) => service.GetAsync(teamId, caseId, ct)).Produces<TeamClientCaseDto>();
        teams.MapPost("/clients/{caseId:guid}/assign-coach", (Guid teamId, Guid caseId, AssignTeamCoach input, TeamClientsService service, CancellationToken ct) => service.AssignAsync(teamId, caseId, input, ct)).Produces<TeamClientCaseDto>();
        teams.MapDelete("/clients/{caseId:guid}/assignments/{coachId:guid}", (Guid teamId, Guid caseId, Guid coachId, [Microsoft.AspNetCore.Mvc.FromBody] TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.UnassignAsync(teamId, caseId, coachId, input.Version, ct)).Produces<TeamClientCaseDto>();
        teams.MapPost("/client-transfer-requests", (Guid teamId, RequestTeamTransfer input, TeamClientsService service, CancellationToken ct) => service.RequestAsync(teamId, input, ct)).Produces<TeamClientTransferDto>();
        teams.MapGet("/client-transfer-requests", (Guid teamId, int? page, int? pageSize, TeamClientsService service, CancellationToken ct) => service.RequestsAsync(teamId, ct, page, pageSize)).Produces<TeamClientTransferDto[]>();
        var incoming = endpoints.MapGroup("/api/v1/me/team-client-transfer-requests").WithTags("TeamClients").RequireAuthorization();
        incoming.MapGet("/", (int? page, int? pageSize, TeamClientsService service, CancellationToken ct) => service.IncomingAsync(ct, page, pageSize)).Produces<TeamClientTransferDto[]>();
        incoming.MapPost("/{id:guid}/accept", (Guid id, TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.DecideAsync(id, true, input.Version, ct)).Produces<TeamClientTransferDto>();
        incoming.MapPost("/{id:guid}/decline", (Guid id, TeamConsentDecision input, TeamClientsService service, CancellationToken ct) => service.DecideAsync(id, false, input.Version, ct)).Produces<TeamClientTransferDto>();
    }
    private static CoachingListQuery Query(int? page, int? pageSize, string? search, string? sort, RelationshipStatus? status, Guid[]? groupIds, Guid? teamId = null, Guid? offerId = null, string? offerCategory = null) => new() { Page = page ?? 1, PageSize = pageSize ?? 25, Search = search, Sort = sort ?? "updated", Status = status, GroupIds = groupIds ?? [], TeamId = teamId, OfferId = offerId, OfferCategory = offerCategory };
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
/// <summary>Reads and aggregates coaching usage provider information for authorized Coaching reporting and quota contracts.</summary>
internal sealed class CoachingUsageProvider(CoachingDbContext db, IPlanEntitlementsProvider plans) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetScopedUsageAsync(Guid ownerId, Guid? teamId, CancellationToken ct)
    {
        if (teamId == null) return await GetUsageAsync(ownerId, ct);
        var plan = await plans.GetForTeamAsync(ownerId, teamId.Value, ct);
        var count = await db.Set<TeamClientCase>().Where(x => x.TeamId == teamId && x.Status == "Active").Select(x => x.ClientId).Distinct().LongCountAsync(ct);
        return [new("coaching.active_clients", plan.Limits["coaching.active_clients"], count)];
    }
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken ct)
    {
        var plan = await plans.GetAsync(ownerId, ct);
        var count = await db.Relationships.Where(x => x.CoachId == ownerId && x.TeamId == null && x.Status == RelationshipStatus.Active).Select(x => x.ClientId).Distinct().LongCountAsync(ct);
        return [new("coaching.active-clients", plan.Limits["coaching.active_clients"], count), new("coaching.active_clients", plan.Limits["coaching.active_clients"], count)];
    }
}
