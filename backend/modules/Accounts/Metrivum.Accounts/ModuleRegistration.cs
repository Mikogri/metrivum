using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Features;
using Metrivum.Accounts.Infrastructure;
using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.Accounts;

/// <summary>Registers Accounts services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddAccounts(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddModuleDatabase<AccountsDbContext>("accounts");
        services.AddScoped<AccountContext>();
        services.AddScoped<IAccountDirectory, AccountDirectory>();
        services.AddScoped<ICoachDiscoveryDirectory, CoachDiscoveryDirectory>();
        services.AddScoped<IAccountProfileFields, AccountProfileFieldsService>();
        services.AddScoped<IAccountContext>(provider =>
            provider.GetRequiredService<AccountContext>()
        );
        return services;
    }

    public static void MapAccounts(this IEndpointRouteBuilder endpoints) =>
        ProfileEndpoints.Map(endpoints);
}
