using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.VideoAnalysis;
using Microsoft.Extensions.Options;

namespace Metrivum.UnitTests;

public sealed class AnalysisTrackingTests
{
    [Fact]
    public void Absent_tracking_preserves_legacy_configuration_hash_input()
    {
        Assert.Equal(
            "{\"metersPerPixel\":null,\"movement\":\"unspecified\"}",
            JsonSerializer.Serialize(new AnalysisConfiguration(), AnalysisResults.Json)
        );
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("[{\"x\":10,\"y\":20},{\"x\":10,\"y\":20}]")]
    [InlineData("[{\"x\":640,\"y\":20},{\"x\":15,\"y\":20}]")]
    public async Task Invalid_tracking_is_rejected_before_database_access(string points)
    {
        var configuration = JsonSerializer.Deserialize<AnalysisConfiguration>(
            "{\"movement\":\"squat\",\"tracking\":{\"timestampSeconds\":0,\"videoWidth\":640,\"videoHeight\":480,\"points\":"
                + points
                + "}}",
            AnalysisResults.Json
        )!;
        var library = new AnalysisLibrary(
            null!,
            null!,
            new UnavailableVideoAnalyzer(),
            Options.Create(new AnalysisOptions())
        );
        await Assert.ThrowsAsync<ApiException>(() =>
            library.CreateAsync(
                Guid.NewGuid(),
                "test",
                new("Lift", null, [], Guid.NewGuid(), configuration),
                default
            )
        );
    }

    [Fact]
    public void Negative_phase_metrics_are_rejected()
    {
        var phase = JsonSerializer.Deserialize<AnalysisPhase>(
            "{\"kind\":\"Lifting\",\"startSeconds\":0,\"endSeconds\":1,\"meanSpeed\":-2}",
            AnalysisResults.Json
        )!;
        var result = new AnalysisResult(
            1,
            "engine",
            "model",
            "method",
            "px",
            null,
            [new(1, 0, 1, [phase])],
            [],
            []
        );
        Assert.Throws<ApiException>(() => AnalysisResults.Validate(result, new()));
    }

    [Fact]
    public void Negative_continuity_segments_are_rejected()
    {
        var point = JsonSerializer.Deserialize<TrajectoryPoint>(
            "{\"seconds\":0,\"x\":10,\"y\":20,\"quality\":1,\"occluded\":false,\"segment\":-1}",
            AnalysisResults.Json
        )!;
        var result = new AnalysisResult(
            1,
            "engine",
            "model",
            "method",
            "px",
            null,
            [],
            [point],
            []
        );
        Assert.Throws<ApiException>(() => AnalysisResults.Validate(result, new()));
    }
}
