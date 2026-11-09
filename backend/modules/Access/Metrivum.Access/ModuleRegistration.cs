using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.Access.Features;
using Metrivum.Access.Infrastructure;
using Metrivum.BuildingBlocks;

namespace Metrivum.Access;

/// <summary>Registers Access services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddAccess(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddUsageReservations();
        services.AddSingleton<IAbuseCounterStore>(_ => new PostgresAbuseCounterStore(
            configuration.GetConnectionString("Database") ?? throw new InvalidOperationException("Database configuration is required for distributed admission.")));
        services.AddSingleton<FeatureCatalog>();
        services.AddScoped<IFeatureAccessService, FeatureAccessService>();
        services.AddScoped<IFeatureAudience, FeatureAudience>();
        services.AddScoped<ILimitUsageProvider>(p => p.GetRequiredService<UsageReservations>());
        foreach (var key in new[] { "training.builder.advanced", "exercises.custom.create", "video.analysis.local", "video.analysis.cloud", "analytics.advanced", "automation.advanced", "organization.workspace.manage" })
            services.AddSingleton(new FeatureDefinition(key, "Access", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IServiceCollection AddUsageReservations(this IServiceCollection services)
    {
        services.AddModuleDatabase<AccessDbContext>("access");
        services.AddScoped<UsageReservations>();
        services.AddScoped<IUsageReservations>(p => p.GetRequiredService<UsageReservations>());
        return services;
    }
    public static void MapAccess(this IEndpointRouteBuilder endpoints) => AccessEndpoints.Map(endpoints);
}
