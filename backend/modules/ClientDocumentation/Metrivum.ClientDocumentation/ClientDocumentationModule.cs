using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Access.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.ClientDocumentation.Contracts;
using Metrivum.ClientDocumentation.Infrastructure;
using Metrivum.Media.Contracts;
using Metrivum.Notifications.Contracts;

namespace Metrivum.ClientDocumentation;

/// <summary>Registers ClientDocumentation services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ClientDocumentationModule
{
    public static IServiceCollection AddClientDocumentation(this IServiceCollection services)
    {
        services.AddModuleDatabase<DocumentationDbContext>("client_documentation");
        services.AddScoped<DocumentationService>();
        services.AddScoped<INotificationDeliveryPolicy>(p => p.GetRequiredService<DocumentationService>());
        foreach (var key in new[] { "coaching.documentation.manage", "coaching.documentation.view-shared" })
            services.AddSingleton(new FeatureDefinition(key, "ClientDocumentation", $"features.{key}.title", $"features.{key}.description", [], []));
        return services;
    }
    private static long Version(HttpRequest request) => RequestPreconditions.RequireVersion(request);
    public static IEndpointRouteBuilder MapClientDocumentation(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/coaching/relationships/{relationshipId:guid}/documentation").RequireAuthorization().WithTags("Client documentation");
        group.MapGet("/", async (Guid relationshipId, DocumentationService s, CancellationToken ct) => await s.Access(relationshipId, ct)).Produces<DocumentationAccess>();
        group.MapGet("/measurement-definitions", async (Guid relationshipId, DocumentationService s, CancellationToken ct) => { await s.Access(relationshipId, ct); return DocumentationService.Definitions; }).Produces<MeasurementDefinition[]>();
        group.MapGet("/measurements", async (Guid relationshipId, DateTimeOffset from, DateTimeOffset to, DocumentationService s, CancellationToken ct, int page = 1, int pageSize = 25, string? key = null) => await s.Measurements(relationshipId, from, to, page, pageSize, ct, key)).Produces<DocumentationPage<MeasurementDto>>();
        group.MapPost("/measurements", async (Guid relationshipId, MeasurementInput input, DocumentationService s, CancellationToken ct) => await s.AddMeasurement(relationshipId, input, ct)).Produces<MeasurementDto>();
        group.MapPatch("/measurements/{measurementId:guid}", async (Guid relationshipId, Guid measurementId, MeasurementInput input, HttpRequest request, DocumentationService s, CancellationToken ct) => await s.EditMeasurement(relationshipId, measurementId, input, Version(request), ct)).Produces<MeasurementDto>();
        group.MapGet("/measurements/trend", async (Guid relationshipId, string key, string unit, DateTimeOffset from, DateTimeOffset to, DocumentationService s, CancellationToken ct) => await s.Trend(relationshipId, key, unit, from, to, ct)).Produces<MeasurementTrend>();
        group.MapGet("/notes", async (Guid relationshipId, string? search, DocumentationService s, CancellationToken ct, int page = 1, int pageSize = 25) => await s.Notes(relationshipId, search, page, pageSize, ct)).Produces<DocumentationPage<NoteDto>>();
        group.MapPost("/notes", async (Guid relationshipId, NoteInput input, DocumentationService s, CancellationToken ct) => await s.SaveNote(relationshipId, null, input, 0, ct)).Produces<NoteDto>();
        group.MapPatch("/notes/{noteId:guid}", async (Guid relationshipId, Guid noteId, NoteInput input, HttpRequest request, DocumentationService s, CancellationToken ct) => await s.SaveNote(relationshipId, noteId, input, Version(request), ct)).Produces<NoteDto>();
        group.MapGet("/documents", async (Guid relationshipId, string? search, string? category, DocumentationService s, CancellationToken ct, int page = 1, int pageSize = 25) => await s.Documents(relationshipId, search, category, page, pageSize, ct)).Produces<DocumentationPage<DocumentDto>>();
        group.MapPost("/documents", async (Guid relationshipId, DocumentInput input, DocumentationService s, CancellationToken ct) => await s.AddDocument(relationshipId, input, ct)).Produces<DocumentDto>();
        group.MapPatch("/documents/{documentId:guid}", async (Guid relationshipId, Guid documentId, DocumentEdit input, HttpRequest request, DocumentationService s, CancellationToken ct) => await s.EditDocument(relationshipId, documentId, input, Version(request), ct)).Produces<DocumentDto>();
        group.MapPost("/documents/{documentId:guid}/share", async (Guid relationshipId, Guid documentId, VisibilityInput input, HttpRequest request, DocumentationService s, CancellationToken ct) => await s.Share(relationshipId, documentId, input, Version(request), ct)).Produces<DocumentDto>();
        group.MapPost("/documents/{documentId:guid}/read-url", async (Guid relationshipId, Guid documentId, DocumentationService s, CancellationToken ct) => await s.ReadFile(relationshipId, documentId, ct)).Produces<DocumentReadUrl>();
        group.MapDelete("/documents/{documentId:guid}", async (Guid relationshipId, Guid documentId, HttpRequest request, DocumentationService s, CancellationToken ct) => { await s.DeleteDocument(relationshipId, documentId, Version(request), ct); return Results.NoContent(); });
        group.MapPost("/uploads", async (Guid relationshipId, DocumentationUploadInput input, DocumentationService s, CancellationToken ct) => await s.Upload(relationshipId, input, ct)).Produces<DocumentUpload>();
        group.MapPost("/uploads/{mediaId:guid}/finalize", async (Guid relationshipId, Guid mediaId, DocumentationService s, CancellationToken ct) => { await s.FinalizeUpload(relationshipId, mediaId, ct); return Results.NoContent(); });
        return endpoints;
    }
}
