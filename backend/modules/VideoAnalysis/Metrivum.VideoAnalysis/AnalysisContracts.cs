using System.Text.Json;
using System.Text.Json.Serialization;
using Metrivum.BuildingBlocks;

namespace Metrivum.VideoAnalysis;

/// <summary>Contains the configured analysis settings and bounds for VideoAnalysis; does not itself access the database.</summary>
public sealed class AnalysisOptions
{
    // Technical safety limits are identical for Free and Pro.
    public int MaxConcurrentPerOwner { get; set; } = 2;
    public int MaxQueuedJobs { get; set; } = 100;
    public int MaxAttempts { get; set; } = 3;
    public int LeaseSeconds { get; set; } = 60;
    public int HeartbeatSeconds { get; set; } = 15;
    public int PollSeconds { get; set; } = 3;
    public int MaxRunSeconds { get; set; } = 1800;
    public int MaxResultPoints { get; set; } = 50000;
    public int MaxResultBytes { get; set; } = 8388608;
}

public sealed record AnalysisTrackingPoint(double X, double Y);
public sealed record AnalysisTracking(double TimestampSeconds, int VideoWidth, int VideoHeight, AnalysisTrackingPoint[] Points);
/// <summary>Movement is what the engine understands (squat, bench press, deadlift or unspecified); Exercise is the
/// catalog exercise the coach chose, shown as the label (any exercise, not only the three engine movements).</summary>
public sealed record AnalysisConfiguration(double? MetersPerPixel = null, string Movement = "unspecified",
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] AnalysisTracking? Tracking = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Exercise = null);
public sealed record CreateAnalysisRequest(string Name, string? Note, string[] Tags, Guid MediaId, AnalysisConfiguration Configuration,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Guid? TeamId = null);
public sealed record RepetitionReview(int Number, bool? Performed);
/// <summary>Movement null keeps the movement and exercise; otherwise both are replaced (a null Exercise clears it).
/// It relabels the analysis; the result is not recalculated.</summary>
public sealed record UpdateAnalysisRequest(string Name, string? Note, string[] Tags, string? Movement = null, string? Exercise = null,
    RepetitionReview[]? RepetitionReviews = null);
public sealed record AnalysisPhase(string Kind, double StartSeconds, double EndSeconds,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? MeanSpeed = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? PeakSpeed = null);
public sealed record AnalysisRepetition(int Number, double StartSeconds, double EndSeconds, AnalysisPhase[] Phases,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? MeanSpeed = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? PeakSpeed = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Performed = null);
public sealed record TrajectoryPoint(double Seconds, double X, double Y, double? Velocity, double Quality, bool Occluded,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Segment = null);
public sealed record AnalysisResult(int SchemaVersion, string EngineVersion, string ModelVersion, string Method,
    string PositionUnit, double? MetersPerPixel, AnalysisRepetition[] Repetitions, TrajectoryPoint[] Trajectory, string[] Warnings);
public sealed record AnalysisDto(Guid Id, string Name, string? Note, string[] Tags, Guid? MediaId, AnalysisConfiguration Configuration,
    string Status, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, string? FailureCode, int Attempts, long Version, string ExecutionLocation = "server", Guid? LocalAnalysisId = null,
    AnalysisSourceVideo? SourceVideo = null, Guid? WorkoutExecutionId = null, Guid? SetId = null);
public sealed record AnalysisComparison(AnalysisResult Left, AnalysisResult Right);

public interface IVideoAnalyzer
{
    bool IsConfigured
    {
        get;
    }
    Task<AnalysisResult> AnalyzeAsync(Stream source, AnalysisConfiguration configuration, CancellationToken ct);
    void ValidateConfiguration(AnalysisConfiguration configuration)
    {
    }
}

/// <summary>Rejects analysis requests when no executable analyzer implementation is configured.</summary>
public sealed class UnavailableVideoAnalyzer : IVideoAnalyzer
{
    public bool IsConfigured => false;
    public Task<AnalysisResult> AnalyzeAsync(Stream source, AnalysisConfiguration configuration, CancellationToken ct) =>
        Task.FromException<AnalysisResult>(new ApiException(503, "ANALYZER_NOT_CONFIGURED", "No video analysis engine is configured."));
}

/// <summary>Validates and projects analyzer output without performing inference or database writes.</summary>
public static class AnalysisResults
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Human review is separate from measured phases/speeds; old results remain unreviewed.
    public static AnalysisResult Review(AnalysisResult result, RepetitionReview[] reviews)
    {
        var numbers = result.Repetitions.Select(x => x.Number).ToHashSet();
        if (reviews.Length > 1000 || reviews.Any(x => x == null)
            || reviews.Select(x => x.Number).Distinct().Count() != reviews.Length
            || reviews.Any(x => !numbers.Contains(x.Number)))
            throw ApiException.Invalid("Review each detected repetition at most once, using its original number.");
        var byNumber = reviews.ToDictionary(x => x.Number);
        return result with { Repetitions = result.Repetitions.Select(rep => byNumber.TryGetValue(rep.Number, out var review)
            ? rep with { Performed = review.Performed } : rep).ToArray() };
    }

    public static void Validate(AnalysisResult result, AnalysisOptions options)
    {
        static bool Text(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 200;
        static bool Time(double value) => double.IsFinite(value) && value >= 0;
        static bool Speed(double? value) => value is null || (double.IsFinite(value.Value) && value >= 0);
        var invalid = result.SchemaVersion != 1 || !Text(result.EngineVersion) || !Text(result.ModelVersion) || !Text(result.Method)
            || result.PositionUnit is not ("px" or "m") || result.Repetitions == null || result.Trajectory == null || result.Warnings == null
            || (result.PositionUnit == "m" && (result.MetersPerPixel is not > 0 || !double.IsFinite(result.MetersPerPixel.Value)))
            || (result.PositionUnit == "px" && result.MetersPerPixel != null);
        if (invalid)
            throw Invalid();
        if (result.Trajectory!.Length > options.MaxResultPoints || result.Repetitions!.Length > 1000 || result.Warnings!.Length > 100 || result.Warnings.Any(x => x == null || x.Length > 500))
            throw Invalid();
        var previous = -1d;
        foreach (var point in result.Trajectory)
        {
            if (point == null || !Time(point.Seconds) || point.Seconds < previous || !double.IsFinite(point.X) || !double.IsFinite(point.Y)
                || (point.Velocity.HasValue && !double.IsFinite(point.Velocity.Value)) || !double.IsFinite(point.Quality) || point.Quality is < 0 or > 1 || point.Segment is < 0)
                throw Invalid();
            previous = point.Seconds;
        }
        var numbers = new HashSet<int>();
        foreach (var rep in result.Repetitions)
        {
            if (rep == null || rep.Number < 1 || !numbers.Add(rep.Number) || !Time(rep.StartSeconds) || !Time(rep.EndSeconds) || rep.EndSeconds <= rep.StartSeconds || rep.Phases == null || rep.Phases.Length > 20 || !Speed(rep.MeanSpeed) || !Speed(rep.PeakSpeed))
                throw Invalid();
            var phaseEnd = rep.StartSeconds;
            foreach (var phase in rep.Phases)
            {
                if (phase == null || !Text(phase.Kind) || !Time(phase.StartSeconds) || !Time(phase.EndSeconds) || phase.StartSeconds < phaseEnd || phase.EndSeconds <= phase.StartSeconds || phase.EndSeconds > rep.EndSeconds || !Speed(phase.MeanSpeed) || !Speed(phase.PeakSpeed))
                    throw Invalid();
                phaseEnd = phase.EndSeconds;
            }
        }
        if (JsonSerializer.SerializeToUtf8Bytes(result, Json).Length > options.MaxResultBytes)
            throw Invalid();
    }

    private static ApiException Invalid() => new(422, "ANALYSIS_RESULT_INVALID", "The analyzer returned an invalid or oversized result.");

    public static void RequireCompatible(AnalysisResult left, AnalysisResult right)
    {
        if (left.PositionUnit != right.PositionUnit || left.Method != right.Method || left.EngineVersion != right.EngineVersion || left.ModelVersion != right.ModelVersion
            || (left.MetersPerPixel.HasValue != right.MetersPerPixel.HasValue))
            throw new ApiException(409, "ANALYSIS_INCOMPATIBLE", "Comparison requires matching units, calibration mode, method and engine/model versions.");
    }

    public static TrajectoryPoint[] Sample(TrajectoryPoint[] points, int maxPoints)
    {
        if (maxPoints is < 2 or > 5000)
            throw ApiException.Invalid("maxPoints must be between 2 and 5000.");
        if (points.Length <= maxPoints)
            return points;
        return Enumerable.Range(0, maxPoints).Select(i => points[(int)((long)i * (points.Length - 1) / (maxPoints - 1))]).ToArray();
    }

    public static AnalysisResult Select(AnalysisResult result, int? repetition, int maxPoints)
    {
        var selected = result;
        if (repetition.HasValue)
        {
            var rep = result.Repetitions.SingleOrDefault(x => x.Number == repetition) ?? throw ApiException.NotFound();
            selected = result with
            {
                Repetitions = [rep],
                Trajectory = result.Trajectory.Where(x => x.Seconds >= rep.StartSeconds && x.Seconds <= rep.EndSeconds).ToArray()
            };
        }
        return selected with
        {
            Trajectory = Sample(selected.Trajectory, maxPoints)
        };
    }
}
