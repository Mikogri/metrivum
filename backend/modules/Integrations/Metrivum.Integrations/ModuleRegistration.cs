using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Metrivum.Access.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Features;
using Metrivum.Integrations.Infrastructure;

namespace Metrivum.Integrations;

public static class ModuleRegistration
{
    public static IServiceCollection AddIntegrations(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<IntegrationsDbContext>("integrations");
        services.AddScoped<IntegrationAccess>();
        services.AddScoped<IntegrationService>();
        services.TryAddSingleton(TimeProvider.System);
        services.AddHttpClient<SupabaseOAuthConsent>(client => client.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        foreach (var grant in IntegrationGrants.All.Prepend("connect"))
        {
            var key = IntegrationGrants.Feature(grant);
            services.AddSingleton(new FeatureDefinition(key, "Integrations", key + ".title", key + ".description", [], []));
        }
        return services;
    }

    public static IEndpointRouteBuilder MapIntegrations(this IEndpointRouteBuilder endpoints)
    {
        var connections = endpoints.MapGroup("/api/v1/me/ai-integrations").WithTags("Integrations").RequireAuthorization();
        connections.MapGet("", (IntegrationService service, CancellationToken ct) => service.ConnectionsAsync(ct));
        endpoints.MapGet("/api/v1/me/ai-activity", (IntegrationService service, CancellationToken ct) => service.ActivityAsync(ct))
            .WithTags("Integrations").RequireAuthorization();
        connections.MapGet("/{id:guid}", (Guid id, IntegrationService service, CancellationToken ct) => service.ConnectionAsync(id, ct));
        connections.MapPatch("/{id:guid}/grants", (Guid id, GrantUpdate request, IntegrationService service, CancellationToken ct) => service.UpdateGrantsAsync(id, request, ct));
        connections.MapPost("/{id:guid}/revoke", (Guid id, IntegrationService service, CancellationToken ct) => service.RevokeAsync(id, ct));
        var consent = endpoints.MapGroup("/api/v1/me/ai-consent").WithTags("Integrations").RequireAuthorization();
        consent.MapGet("/{authorizationId}", (string authorizationId, IntegrationService service, CancellationToken ct) => service.ConsentAsync(authorizationId, ct));
        consent.MapPost("/{authorizationId}", (string authorizationId, ConsentRequest request, IntegrationService service, CancellationToken ct) => service.AcceptConsentAsync(authorizationId, request, ct));
        consent.MapPost("/{authorizationId}/deny", (string authorizationId, IntegrationService service, CancellationToken ct) => service.DenyConsentAsync(authorizationId, ct));
        var actions = endpoints.MapGroup("/api/v1/me/ai-actions").WithTags("Integrations").RequireAuthorization();
        actions.MapGet("", (string? status, IntegrationService service, CancellationToken ct) => service.ActionsAsync(status, ct));
        actions.MapGet("/{id:guid}", (Guid id, IntegrationService service, CancellationToken ct) => service.ActionAsync(id, ct));
        actions.MapPost("/{id:guid}/approve", (Guid id, ActionDecision request, IntegrationService service, CancellationToken ct) => service.DecideActionAsync(id, request, true, ct));
        actions.MapPost("/{id:guid}/reject", (Guid id, ActionDecision request, IntegrationService service, CancellationToken ct) => service.DecideActionAsync(id, request, false, ct));
        var preferences = endpoints.MapGroup("/api/v1/me/ai-programming-preferences").WithTags("Integrations").RequireAuthorization();
        preferences.MapGet("", (IntegrationService service, CancellationToken ct) => service.ProgrammingPreferencesAsync(ct));
        preferences.MapPatch("", (PreferencesUpdate request, IntegrationService service, CancellationToken ct) => service.SaveProgrammingPreferencesAsync(request, ct));
        return endpoints;
    }
}
