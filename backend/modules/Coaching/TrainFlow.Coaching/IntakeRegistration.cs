using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Features;
using TrainFlow.Coaching.Contracts;

namespace TrainFlow.Coaching;

public static class IntakeRegistration
{
    public static IServiceCollection AddCoachingIntake(this IServiceCollection services)
    {
        services.AddScoped<CoachingIntakeService>();
        foreach (var key in new[] { "coaching.applications.submit-own", "coaching.applications.manage", "coaching.invitations.send", "coaching.invitations.respond-own", "coaching.services.read-own", "coaching.services.manage" })
            services.AddSingleton(new FeatureDefinition(key, "Coaching", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IEndpointRouteBuilder MapCoachingIntake(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/coaching").WithTags("Coaching intake").RequireAuthorization();
        group.MapPost("/form-shares", (ShareOfferFormRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => service.ShareFormAsync(request, http.Request.Headers["Idempotency-Key"].ToString(), ct)).Produces<CoachingChatDelivery>();
        group.MapGet("/applications", (int? page, int? pageSize, string? search, string? sort, ApplicationStatus? status, Guid? offerId, CoachingIntakeService service, CancellationToken ct) => service.ApplicationsAsync(false, page ?? 1, pageSize ?? 25, search, sort ?? "updated", status, offerId, ct));
        group.MapPost("/applications", async (StartApplicationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.StartApplicationAsync(request, ct))).Produces<ApplicationDetailDto>();
        group.MapGet("/applications/{id:guid}", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) =>
        {
            var value = await service.ApplicationAsync(id, ct);
            var version = value is ApplicationDetailDto client ? client.Application.Version : ((CoachApplicationDetailDto)value).Detail.Application.Version;
            http.Response.Headers.ETag = Quote(version);
            return Results.Ok(value);
        }).Produces<ApplicationDetailDto>().Produces<CoachApplicationDetailDto>();
        group.MapPut("/applications/{id:guid}", async (Guid id, SaveApplicationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.SaveDraftAsync(id, request, Version(http), ct))).Produces<ApplicationDetailDto>();
        group.MapPost("/applications/{id:guid}/submit", async (Guid id, SubmitApplicationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.SubmitAsync(id, request, Version(http), ct))).Produces<ApplicationDetailDto>();
        group.MapPost("/applications/{id:guid}/withdraw", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.WithdrawAsync(id, Version(http), ct))).Produces<ApplicationDto>();
        group.MapPost("/applications/{id:guid}/accept", async (Guid id, AcceptApplicationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.AcceptAsync(id, request, Version(http), ct))).Produces<ApplicationDto>();
        group.MapPost("/applications/{id:guid}/reject", async (Guid id, RejectApplicationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.RejectAsync(id, request, Version(http), ct))).Produces<ApplicationDto>();
        group.MapGet("/leads", (int? page, int? pageSize, string? search, string? sort, ApplicationStatus? status, Guid? offerId, CoachingIntakeService service, CancellationToken ct) => service.ApplicationsAsync(true, page ?? 1, pageSize ?? 25, search, sort ?? "updated", status ?? ApplicationStatus.Submitted, offerId, ct));
        group.MapPost("/invitations", async (CreateInvitationRequest request, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CreateInvitationAsync(request, ct, http.Request.Headers["Idempotency-Key"].ToString()))).Produces<InvitationDto>();
        group.MapGet("/invitations", (int? page, int? pageSize, string? search, string? sort, InvitationStatus? status, CoachingIntakeService service, CancellationToken ct) => service.InvitationsAsync(true, page ?? 1, pageSize ?? 25, search, sort ?? "created", status, ct));
        group.MapGet("/my-invitations", (int? page, int? pageSize, string? search, string? sort, InvitationStatus? status, CoachingIntakeService service, CancellationToken ct) => service.InvitationsAsync(false, page ?? 1, pageSize ?? 25, search, sort ?? "created", status, ct));
        group.MapGet("/invitations/{id:guid}", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.InvitationAsync(id, ct))).Produces<InvitationDto>();
        group.MapPost("/invitations/{id:guid}/accept", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.RespondInvitationAsync(id, InvitationStatus.Accepted, Version(http), ct))).Produces<InvitationDto>();
        group.MapPost("/invitations/{id:guid}/decline", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.RespondInvitationAsync(id, InvitationStatus.Declined, Version(http), ct))).Produces<InvitationDto>();
        group.MapPost("/invitations/{id:guid}/revoke", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.RespondInvitationAsync(id, InvitationStatus.Revoked, Version(http), ct))).Produces<InvitationDto>();
        group.MapGet("/relationships/{id:guid}/applications/{applicationId:guid}", (Guid id, Guid applicationId, CoachingIntakeService service, CancellationToken ct) => service.RelationshipApplicationAsync(id, applicationId, ct)).Produces<CoachApplicationDetailDto>();
        group.MapGet("/relationships/{id:guid}/profile", (Guid id, CoachingIntakeService service, CancellationToken ct) => service.RelationshipProfileAsync(id, ct));
        group.MapGet("/relationships/{id:guid}/applications", (Guid id, int? page, int? pageSize, CoachingIntakeService service, CancellationToken ct) => service.RelationshipApplicationsAsync(id, page ?? 1, pageSize ?? 25, ct));
        group.MapGet("/relationships/{id:guid}/services", (Guid id, int? page, int? pageSize, string? search, string? sort, ServiceStatus? status, CoachingIntakeService service, CancellationToken ct) => service.ServicesAsync(id, page ?? 1, pageSize ?? 25, search, sort ?? "updated", status, ct));
        group.MapGet("/services/current", (Guid[] relationshipIds, CoachingIntakeService service, CancellationToken ct) => service.CurrentServicesAsync(relationshipIds, ct)).Produces<CurrentRelationshipServiceDto[]>();
        group.MapGet("/services/{id:guid}", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ServiceAsync(id, ct))).Produces<RelationshipServiceDto>();
        group.MapPost("/services/{id:guid}/complete", async (Guid id, CoachingIntakeService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CompleteServiceAsync(id, Version(http), ct))).Produces<RelationshipServiceDto>();
        return endpoints;
    }
    private static string Quote(long version) => $"\"{version}\"";
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, ApplicationDetailDto value)
    {
        http.Response.Headers.ETag = Quote(value.Application.Version);
        return Results.Ok(value);
    }
    private static IResult Versioned(HttpContext http, ApplicationDto value)
    {
        http.Response.Headers.ETag = Quote(value.Version);
        return Results.Ok(value);
    }
    private static IResult Versioned(HttpContext http, InvitationDto value)
    {
        http.Response.Headers.ETag = Quote(value.Version);
        return Results.Ok(value);
    }
    private static IResult Versioned(HttpContext http, RelationshipServiceDto value)
    {
        http.Response.Headers.ETag = Quote(value.Version);
        return Results.Ok(value);
    }
}
