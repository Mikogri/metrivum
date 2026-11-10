using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.VideoAnalysis.Infrastructure;

/// <summary>Creates the VideoAnalysis DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class VideoAnalysisDesignTimeFactory
    : IDesignTimeDbContextFactory<VideoAnalysisDbContext>
{
    public VideoAnalysisDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<VideoAnalysisDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=127.0.0.1;Database=trainflow_design;Username=design",
                    options =>
                        options.MigrationsHistoryTable("__EFMigrationsHistory", "video_analysis")
                )
                .Options
        );
}
