using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.Access.Domain;
using TrainFlow.Access.Features;
using TrainFlow.Access.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Access;

public static class ModuleRegistration
{
    public static IServiceCollection AddAccess(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<AccessDbContext>("access");
        services.AddSingleton<FeatureCatalog>();
        services.AddScoped<IFeatureAccessService, FeatureAccessService>();
        return services;
    }
    public static void MapAccess(this IEndpointRouteBuilder endpoints) => AccessEndpoints.Map(endpoints);
}
