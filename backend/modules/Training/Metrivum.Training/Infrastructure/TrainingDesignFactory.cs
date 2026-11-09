using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Training.Infrastructure;

/// <summary>Creates the Training DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class TrainingDesignFactory : IDesignTimeDbContextFactory<TrainingDbContext>
{
    public TrainingDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=localhost;Database=trainflow_design;Username=design_only";
        return new(new DbContextOptionsBuilder<TrainingDbContext>().UseNpgsql(connection, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "training")).Options);
    }
}
