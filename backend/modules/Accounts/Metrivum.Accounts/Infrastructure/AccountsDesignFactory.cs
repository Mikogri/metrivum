using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Accounts.Infrastructure;

/// <summary>Creates the Accounts DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class AccountsDesignFactory : IDesignTimeDbContextFactory<AccountsDbContext>
{
    public AccountsDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AccountsDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured",
            options => options.MigrationsHistoryTable("__EFMigrationsHistory", "accounts")).Options);
}
