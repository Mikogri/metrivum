using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Media.Infrastructure;

public sealed class MediaDesignTimeFactory : IDesignTimeDbContextFactory<MediaDbContext>
{
    public MediaDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<MediaDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=design", options => options.MigrationsHistoryTable("__EFMigrationsHistory", "media")).Options);
}
