using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Access.Infrastructure;

/// <summary>Creates the Access DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class AccessDesignFactory : IDesignTimeDbContextFactory<AccessDbContext>
{
    public AccessDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<AccessDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured",
                    options => options.MigrationsHistoryTable("__EFMigrationsHistory", "access")
                )
                .Options
        );
}
