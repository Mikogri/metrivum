using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace TrainFlow.ExerciseCatalog.Infrastructure;

public sealed class ExerciseCatalogDesignTimeFactory : IDesignTimeDbContextFactory<ExerciseCatalogDbContext>
{
    public ExerciseCatalogDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
            ?? throw new InvalidOperationException("Set TRAINFLOW_MIGRATION_DATABASE explicitly to the migration connection string.");
        return new(new DbContextOptionsBuilder<ExerciseCatalogDbContext>().UseNpgsql(connection,
            options => options.MigrationsHistoryTable("__EFMigrationsHistory", "exercise_catalog")).Options);
    }
}
