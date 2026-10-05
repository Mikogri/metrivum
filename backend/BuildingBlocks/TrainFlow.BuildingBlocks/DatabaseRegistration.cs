using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace TrainFlow.BuildingBlocks;

public static class DatabaseRegistration
{
    public static IServiceCollection AddModuleDatabase<T>(this IServiceCollection services, string schema) where T : DbContext
    {
        services.AddDbContext<T>((provider, options) => options.UseNpgsql(provider.GetRequiredService<NpgsqlDataSource>(),
            npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema).CommandTimeout(30)));
        return services;
    }
}
