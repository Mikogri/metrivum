using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Accounts.Features;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts;

public static class ModuleRegistration
{
    public static IServiceCollection AddAccounts(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<AccountsDbContext>("accounts");
        services.AddScoped<AccountContext>();
        services.AddScoped<IAccountDirectory, AccountDirectory>();
        services.AddScoped<ICoachDiscoveryDirectory, CoachDiscoveryDirectory>();
        services.AddScoped<IAccountProfileFields, AccountProfileFieldsService>();
        services.AddScoped<IAccountContext>(provider => provider.GetRequiredService<AccountContext>());
        return services;
    }
    public static void MapAccounts(this IEndpointRouteBuilder endpoints) => ProfileEndpoints.Map(endpoints);
}
