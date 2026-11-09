using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Metrivum.Access.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Forms.Infrastructure;

namespace Metrivum.Forms;

/// <summary>Registers Forms services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddForms(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<FormsDbContext>("forms");
        services.AddScoped<FormsService>();
        services.AddScoped<IMcpFormOperations, Metrivum.Forms.Features.McpFormOperations>();
        services.AddScoped<IFormLibrary>(p => p.GetRequiredService<FormsService>());
        services.AddScoped<Metrivum.Accounts.Contracts.ICoachOnboardingObserver, Metrivum.Forms.Features.StarterFormOnboarding>();
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "forms.application.manage", "forms.checkin.manage" })
            services.AddSingleton(new FeatureDefinition(key, "Forms", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IEndpointRouteBuilder MapForms(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/forms").WithTags("Forms").RequireAuthorization();
        group.MapGet("", (int? page, int? pageSize, FormPurpose purpose, bool? archived, string? search, string? sort, FormsService service, CancellationToken ct) => service.ListAsync(page ?? 1, pageSize ?? 25, purpose, archived ?? false, search, sort ?? "updated", ct));
        group.MapGet("/summaries", (int? page, int? pageSize, FormPurpose purpose, bool? archived, string? search, string? sort, FormsService service, CancellationToken ct) => service.SummariesAsync(page ?? 1, pageSize ?? 25, purpose, archived ?? false, search, sort ?? "updated", ct));
        group.MapPost("", async (FormTemplateRequest request, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.CreateAsync(request, ct))).Produces<FormTemplateDto>();
        group.MapGet("/{id:guid}", async (Guid id, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.DetailAsync(id, ct))).Produces<FormTemplateDto>();
        group.MapPatch("/{id:guid}", async (Guid id, FormTemplateRequest request, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.UpdateAsync(id, request, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapPost("/{id:guid}/publish", async (Guid id, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.PublishAsync(id, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapPost("/{id:guid}/unpublish", async (Guid id, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.UnpublishAsync(id, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapPost("/{id:guid}/duplicate", async (Guid id, DuplicateFormRequest request, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.DuplicateAsync(id, request.IdempotencyKey, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapPost("/{id:guid}/archive", async (Guid id, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ArchiveAsync(id, true, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapPost("/{id:guid}/restore", async (Guid id, FormsService service, HttpContext http, CancellationToken ct) => Versioned(http, await service.ArchiveAsync(id, false, Version(http), ct))).Produces<FormTemplateDto>();
        group.MapGet("/versions/{id:guid}", (Guid id, FormsService service, CancellationToken ct) => service.OwnedVersionAsync(id, ct)).Produces<FormVersionDto>();
        return endpoints;
    }
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, FormTemplateDto value)
    {
        http.Response.Headers.ETag = $"\"{value.Version}\"";
        return Results.Ok(value);
    }
}
