using Metrivum.Training.Purchases;
using Metrivum.Training.Generation;
using Metrivum.Training.Delivery;
using Metrivum.Training.Contracts;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Metrivum.Access.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training;

public static class ModuleRegistration
{
    public static IServiceCollection AddTraining(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<Metrivum.Coaching.Contracts.ITeamRelationshipLifecycle, TeamTrainingLifecycle>();
        services.AddModuleDatabase<TrainingDbContext>("training");
        services.AddScoped<TrainingService>();
        services.AddScoped<IMcpTrainingOperations, McpTrainingOperations>();
        services.AddScoped<TrainingPurchaseService>();
        services.AddScoped<ITrainingPurchases>(sp => sp.GetRequiredService<TrainingPurchaseService>());
        services.AddScoped<TrainingDeliveryService>();
        services.AddScoped<IAssignedProgramCycles, AssignedProgramCyclesReader>();
        services.AddScoped<IAnalysisWorkoutReferences>(p => p.GetRequiredService<TrainingDeliveryService>());
        services.AddScoped<Metrivum.Notifications.Contracts.INotificationDeliveryPolicy, TrainingNotificationPolicy>();
        services.AddScoped<ITrainingProgressReader>(p => p.GetRequiredService<TrainingDeliveryService>());
        foreach (var key in new[] { "training.assignments.manage", "training.executions.log-own", "training.executions.review", "training.progress.view-own", "training.progress.view-clients" })
            services.AddSingleton(new FeatureDefinition(key, "Training", key + ".title", key + ".description", [], []));
        services.AddSingleton(new FeatureDefinition("training.generator.use", "Training", "training.generator.use.title", "training.generator.use.description", ["training.programs.read"], []));
        services.TryAddSingleton(TimeProvider.System);
        services.AddOptions<TrainingOptions>().Bind(configuration.GetSection("Training"))
            .Validate(x => x.MaximumDocuments > 0 && x.MaximumFolders > 0 && x.MaximumFolderDepth is > 0 and <= 64 && x.MaximumFormulaRules > 0 && x.MaximumRevisionsPerDocument > 0 && x.MaximumImportBytes is > 0 and <= 10_485_760 && x.MaximumImportRows is > 0 and <= 50000 && x.MaximumActiveImports > 0 && x.ImportLifetimeMinutes is > 0 and <= 1440 && x.Document.MaximumBytes is > 0 and <= 10_485_760 && x.Document.MaximumNodes is > 0 and <= 50000 && x.Document.MaximumCycleDays > 0 && x.Document.MaximumSegments is >= 2 and <= 100 && x.Formula.MaximumDepth is > 0 and <= 64 && x.Formula.MaximumLength is > 0 and <= 8192 && x.Formula.MaximumOperations is > 0 and <= 4096 && x.Formula.MaximumGraphNodes is > 0 and <= 128, "Invalid training technical limits.").ValidateOnStart();
        services.AddScoped<ILimitUsageProvider, TrainingUsageProvider>();
        foreach (var key in new[] { "training.programs.read", "training.programs.create", "training.programs.manage", "training.folders.manage", "training.templates.manage", "training.sets.advanced", "training.formulas.custom", "training.import.csv", "training.export.csv", "training.export.pdf" })
            services.AddSingleton(new FeatureDefinition(key, "Training", key + ".title", key + ".description", key == "training.programs.read" ? [] : ["training.programs.read"], key == "training.programs.create" ? ["training.documents"] : key == "training.folders.manage" ? ["training.folders"] : key == "training.formulas.custom" ? ["training.formulas"] : []));
        return services;
    }
    public static IEndpointRouteBuilder MapTraining(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/training/purchases", (int? page, int? pageSize, TrainingPurchaseService service, CancellationToken ct) => service.ListAsync(page ?? 1, pageSize ?? 25, ct)).RequireAuthorization();
        var group = endpoints.MapGroup("/api/v1/training").WithTags("Training").RequireAuthorization();
        group.MapTrainingDelivery();
        group.MapGet("/clients/{relationshipId:guid}/variables", (Guid relationshipId, TrainingService s, CancellationToken ct) => s.ClientVariablesAsync(relationshipId, ct));
        group.MapPost("/clients/{relationshipId:guid}/exercise-maxes", (Guid relationshipId, ClientExerciseMaxRequest request, TrainingService s, CancellationToken ct) => s.SaveExerciseMaxAsync(relationshipId, null, request, null, ct));
        group.MapPut("/clients/{relationshipId:guid}/exercise-maxes/{id:guid}", (Guid relationshipId, Guid id, ClientExerciseMaxRequest request, HttpContext h, TrainingService s, CancellationToken ct) => s.SaveExerciseMaxAsync(relationshipId, id, request, Version(h), ct));
        group.MapPost("/programs/{id:guid}/client-preview", (Guid id, ClientPreviewRequest request, TrainingService s, CancellationToken ct) => s.PreviewClientAsync(id, request, ct));

        group.MapProgramGenerator();
        group.MapGet("/programs", (int? page, int? pageSize, string? search, string? sort, DocumentKind? kind, Guid? folderId, bool? rootOnly, bool? archived, TrainingService service, CancellationToken ct) =>
            service.ListAsync(new()
            {
                Page = page ?? 1,
                PageSize = pageSize ?? 25,
                Search = search,
                Sort = sort ?? "updated",
                Kind = kind,
                FolderId = folderId,
                RootOnly = rootOnly ?? false,
                Archived = archived ?? false
            }, ct));
        group.MapPost("/programs", async (CreatePlanRequest request, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CreateAsync(request, ct))).Produces<PlanDto>();
        group.MapGet("/programs/{id:guid}", async (Guid id, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.GetAsync(id, ct))).Produces<PlanDto>();
        group.MapPut("/programs/{id:guid}/draft", async (Guid id, SavePlanRequest request, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.SaveAsync(id, request, Version(http), ct))).Produces<PlanDto>();
        group.MapPost("/programs/{id:guid}/copy", async (Guid id, CopyPlanRequest request, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CopyAsync(id, request, ct))).Produces<PlanDto>();
        group.MapPut("/programs/{id:guid}/archive", async (Guid id, ArchiveRequest request, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ArchiveAsync(id, request.Archived, Version(http), ct))).Produces<PlanDto>();
        group.MapPost("/programs/{id:guid}/apply", (Guid id, TrainingService service, HttpContext http, CancellationToken ct) => service.ApplyAsync(id, Version(http), Key(http), ct));
        group.MapPost("/programs/{id:guid}/revisions", (Guid id, TrainingService service, HttpContext http, CancellationToken ct) => service.PublishAsync(id, Version(http), Key(http), ct));
        group.MapGet("/programs/{id:guid}/revisions", (Guid id, int? page, int? pageSize, TrainingService service, CancellationToken ct) => service.RevisionsAsync(id, page ?? 1, pageSize ?? 25, ct));
        group.MapGet("/programs/{id:guid}/revisions/{number:int}", (Guid id, int number, TrainingService service, CancellationToken ct) => service.RevisionAsync(id, number, ct));
        group.MapGet("/programs/{id:guid}/revisions/{number:int}/export", async (Guid id, int number, string format, string? scope, Guid? scopeId, string? delimiter, TrainingService service, CancellationToken ct) =>
        {
            var file = await service.ExportAsync(id, number, format, scope ?? "program", scopeId, delimiter ?? ",", ct);
            return Results.File(file.Content, file.ContentType, file.Name);
        }).Produces(200, contentType: "text/csv").Produces(200, contentType: "application/pdf");
        group.MapGet("/folders", (Guid? parentId, int? page, int? pageSize, TrainingService service, CancellationToken ct) => service.FoldersAsync(parentId, page ?? 1, pageSize ?? 25, ct));
        group.MapPost("/folders", async (FolderRequest request, TrainingService service, HttpContext http, CancellationToken ct) => FolderVersioned(http, await service.CreateFolderAsync(request, ct))).Produces<FolderDto>();
        group.MapPut("/folders/{id:guid}", async (Guid id, FolderRequest request, TrainingService service, HttpContext http, CancellationToken ct) => FolderVersioned(http, await service.UpdateFolderAsync(id, request, Version(http), ct))).Produces<FolderDto>();
        group.MapDelete("/folders/{id:guid}", async (Guid id, TrainingService service, HttpContext http, CancellationToken ct) => { await service.DeleteFolderAsync(id, Version(http), ct); return Results.NoContent(); });
        group.MapGet("/formulas", (string? search, int? page, int? pageSize, TrainingService service, CancellationToken ct) => service.FormulasAsync(search, page ?? 1, pageSize ?? 25, ct));
        group.MapGet("/formulas/built-in", async (IFeatureAccessService access, CancellationToken ct) => { await access.RequireAsync("training.programs.read", ct); return TrainingService.BuiltInFormulas.Select(x => new { Key = x.Key, Version = 1, Definition = x.Value }); });
        group.MapGet("/formulas/{id:guid}", async (Guid id, int? version, TrainingService service, HttpContext http, CancellationToken ct) => FormulaVersioned(http, await service.FormulaAsync(id, version, ct))).Produces<FormulaDto>();
        group.MapPost("/formulas", async (FormulaRequest request, TrainingService service, HttpContext http, CancellationToken ct) => FormulaVersioned(http, await service.CreateFormulaAsync(request, ct))).Produces<FormulaDto>();
        group.MapPut("/formulas/{id:guid}", async (Guid id, FormulaRequest request, TrainingService service, HttpContext http, CancellationToken ct) => FormulaVersioned(http, await service.UpdateFormulaAsync(id, request, Version(http), ct))).Produces<FormulaDto>();
        group.MapPost("/formulas/{id:guid}/copy", async (Guid id, FormulaCopyRequest request, TrainingService service, HttpContext http, CancellationToken ct) => FormulaVersioned(http, await service.DuplicateFormulaAsync(id, request.Name, ct))).Produces<FormulaDto>();
        group.MapPost("/formulas/evaluate", (FormulaUse request, TrainingService service, CancellationToken ct) => service.EvaluateFormulaAsync(request, ct));
        group.MapPost("/imports/csv", async (HttpContext http, string? delimiter, TrainingService service, IOptions<TrainingOptions> options, CancellationToken ct) =>
        {
            if (http.Request.ContentType?.Split(';')[0].Trim() != "text/csv")
                throw new ApiException(415, "UNSUPPORTED_MEDIA_TYPE", "Upload CSV as text/csv with UTF-8 encoding.");
            var maximum = options.Value.MaximumImportBytes;
            if (http.Request.ContentLength > maximum)
                throw new ApiException(413, "LIMIT_EXCEEDED", "CSV byte limit exceeded.");
            using var memory = new MemoryStream();
            var buffer = new byte[8192];
            int read;
            while ((read = await http.Request.Body.ReadAsync(buffer, ct)) > 0)
            {
                if (memory.Length + read > maximum)
                    throw new ApiException(413, "LIMIT_EXCEEDED", "CSV byte limit exceeded.");
                await memory.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            string content;
            try
            {
                content = new UTF8Encoding(false, true).GetString(memory.ToArray());
            }
            catch (DecoderFallbackException) { throw ApiException.Invalid("CSV must be valid UTF-8."); }
            return ImportVersioned(http, await service.PreviewImportAsync(content, delimiter ?? ",", ct));
        }).Accepts<string>("text/csv").Produces<ImportPreview>();
        group.MapGet("/imports/{id:guid}", async (Guid id, int? page, int? pageSize, TrainingService service, HttpContext http, CancellationToken ct) => ImportVersioned(http, await service.GetImportAsync(id, page ?? 1, pageSize ?? 100, ct))).Produces<ImportPreview>();
        group.MapPut("/imports/{id:guid}/mapping", async (Guid id, MapImportRequest request, TrainingService service, HttpContext http, CancellationToken ct) => ImportVersioned(http, await service.MapImportAsync(id, request, Version(http), ct))).Produces<ImportPreview>();
        group.MapPost("/imports/{id:guid}/validate", (Guid id, TrainingService service, CancellationToken ct) => service.ValidateImportAsync(id, ct));
        group.MapPost("/imports/{id:guid}/commit", async (Guid id, CommitImportRequest request, TrainingService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CommitImportAsync(id, request, Version(http), Key(http), ct))).Produces<PlanDto>();
        return endpoints;
    }
    private static string Key(HttpContext http) => http.Request.Headers["Idempotency-Key"].ToString();
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, PlanDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
    private static IResult FolderVersioned(HttpContext http, FolderDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
    private static IResult FormulaVersioned(HttpContext http, FormulaDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
    private static IResult ImportVersioned(HttpContext http, ImportPreview value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
}
public sealed record ArchiveRequest(bool Archived);
public sealed record FormulaCopyRequest(string Name);

internal sealed class TrainingUsageProvider(TrainingDbContext db, IOptions<TrainingOptions> options) : ILimitUsageProvider
{
    public async Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken ct) =>
    [
        new("training.documents", options.Value.MaximumDocuments, await db.Plans.LongCountAsync(x => x.OwnerId == ownerId, ct)),
        new("training.folders", options.Value.MaximumFolders, await db.Folders.LongCountAsync(x => x.OwnerId == ownerId, ct)),
        new("training.formulas", options.Value.MaximumFormulaRules, await db.Formulas.LongCountAsync(x => x.OwnerId == ownerId, ct))
    ];
}
