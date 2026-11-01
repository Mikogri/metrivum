using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;

namespace Metrivum.BuildingBlocks;

public static class DatabaseRegistration
{
    public static IServiceCollection AddModuleDatabase<T>(this IServiceCollection services, string schema) where T : DbContext
    {
        services.TryAddScoped<ModuleTransaction>();
        services.AddDbContext<T>((provider, options) => options.UseNpgsql(provider.GetRequiredService<ModuleTransaction>().Connection,
            npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema).CommandTimeout(30)));
        services.Replace(ServiceDescriptor.Scoped<T>(provider =>
        {
            var context = ActivatorUtilities.CreateInstance<T>(provider, provider.GetRequiredService<DbContextOptions<T>>());
            provider.GetRequiredService<ModuleTransaction>().Register(context);
            return context;
        }));
        return services;
    }
}
