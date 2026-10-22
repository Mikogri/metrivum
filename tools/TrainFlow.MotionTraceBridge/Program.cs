using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using MotionTrace.Core.Analysis;
using MotionTrace.Core.Athletes;
using MotionTrace.Core.Exercise;
using MotionTrace.Core.Motion;
using MotionTrace.Core.PoseCorrection;
using MotionTrace.Infrastructure.AI;

namespace TrainFlow.MotionTraceBridge;

public static class Program
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static async Task<int> Main(string[] args)
    {
        using var cancellation = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
        try
        {
            if (args.Length != 4 || args[0] != "--request" || args[2] != "--output")
                throw new ArgumentException("Usage: dotnet TrainFlow.MotionTraceBridge.dll --request request.json --output result.json");
            var request = JsonSerializer.Deserialize<Request>(await File.ReadAllTextAsync(args[1], cancellation.Token), Json)
                ?? throw new InvalidDataException("Empty request.");
            cancellation.CancelAfter(TimeSpan.FromSeconds(request.TimeoutSeconds));
            var result = await AnalyzeAsync(request, Path.GetFullPath(args[3]), cancellation.Token);
            await File.WriteAllTextAsync(args[3], JsonSerializer.Serialize(result, Json), cancellation.Token);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"MotionTrace analysis failed: {error.Message}");
            return 1;
        }
    }

    public static async Task<object> AnalyzeAsync(Request request, string output, CancellationToken token, IProgress<AnalysisProgress>? progress = null)
    {
        var tracking = request.Configuration.Tracking;
        if (tracking.Points.Length != 2 || tracking.Points[0] == tracking.Points[1] || tracking.VideoWidth <= 0 || tracking.VideoHeight <= 0 ||
            !double.IsFinite(tracking.TimestampSeconds) || tracking.TimestampSeconds < 0 || tracking.Points.Any(p => !double.IsFinite(p.X) || !double.IsFinite(p.Y) || p.X < 0 || p.Y < 0 || p.X >= tracking.VideoWidth || p.Y >= tracking.VideoHeight))
            throw new InvalidDataException("Two distinct physical points and valid source video dimensions/timestamp are required.");
        _ = Exercise(request.Configuration.Movement);
        if (!File.Exists(request.VideoPath)) throw new FileNotFoundException("Video does not exist.");
        var root = Path.GetFullPath(request.MotionTraceRoot);
        var options = LoadOptions(root, request.SettingsPath);
        var directory = Path.GetDirectoryName(output)!;
        Directory.CreateDirectory(directory);
        var target = output + ".target.json";
        var session = output + ".session.json";
        // The expected size travels with the target: the points-only preparation checks it while it reads the video anyway,
        // instead of a separate Python start just to probe the dimensions.
        await File.WriteAllTextAsync(target, JsonSerializer.Serialize(new { tracking.TimestampSeconds, tracking.Points, tracking.VideoWidth, tracking.VideoHeight }, Json), token);
        var arguments = new List<string> { "-u", options.ComparisonScriptPath };
        void Add(string name, string value) { arguments.Add("--" + name); arguments.Add(value); }
        Add("input", Path.GetFullPath(request.VideoPath)); Add("output", session); Add("target", target);
        // The web result consumes TAPNext++ only; comparison trackers would waste local GPU/RAM.
        Add("providers", "tapnextpp");
        // Only the two marked points are measured: no lifter detection, no exercise classification.
        arguments.Add("--points-only");
        Add("cache", request.CacheDirectory ?? Path.Combine(directory, "motiontrace-cache"));
        Add("pose-python", options.ExecutablePath); Add("vision-python", options.VisionExecutablePath);
        Add("samurai-python", options.SamuraiExecutablePath); Add("points-python", options.PointsExecutablePath);
        Add("models-root", options.ModelsRoot); Add("samurai-models-root", options.EffectiveSamuraiModelsRoot); Add("points-models-root", options.EffectivePointsModelsRoot);
        Add("device", options.Device); Add("pose-model", options.PoseModel); Add("pose-weights", options.PoseWeights);
        Add("crop-padding", options.CropPadding.ToString(CultureInfo.InvariantCulture)); Add("tapnext-resolution", options.TapNextResolution.ToString(CultureInfo.InvariantCulture));
        if (!string.IsNullOrWhiteSpace(options.EffectiveTapNextCheckpoint)) Add("tapnext-checkpoint", options.EffectiveTapNextCheckpoint);
        progress?.Report(new("Preparing the analysis", 0));
        await Process(options.VisionExecutablePath, arguments, root, token, progress is null ? null : SessionProgress(progress));
        progress?.Report(new("Measuring repetitions", .97));
        using var manifest = JsonDocument.Parse(await File.ReadAllTextAsync(session, token));
        var provider = manifest.RootElement.GetProperty("providers").EnumerateArray().Single(p => p.GetProperty("providerId").GetString() == "tapnextpp");
        if (provider.GetProperty("status").GetString() is not ("TrackingReady" or "Ready"))
            throw new InvalidDataException(provider.TryGetProperty("error", out var error) ? error.ToString() : "Point tracker did not produce a ready result.");
        await using var stream = File.OpenRead(provider.GetProperty("resultPath").GetString()!);
        var raw = await AnalysisJson.ReadAsync(stream, token);
        return Convert(raw, request.Configuration.Movement, request.VideoPath, token, options.Correction);
    }

    /// <summary>Trims and/or stabilizes the video (aligned to the marked frame, so the marked points stay valid). See preprocess.py.</summary>
    public static async Task<PreprocessResult> PreprocessAsync(PreprocessRequest request, CancellationToken token, IProgress<AnalysisProgress>? progress = null)
    {
        if (!File.Exists(request.VideoPath)) throw new FileNotFoundException("Video does not exist.");
        var root = Path.GetFullPath(request.MotionTraceRoot);
        var options = LoadOptions(root, request.SettingsPath);
        var script = Path.Combine(AppContext.BaseDirectory, "preprocess.py");
        if (!File.Exists(script)) throw new FileNotFoundException("The video preprocessing script is missing.");
        var arguments = new List<string> { "-u", script, Path.Combine(root, "ai"), Path.GetFullPath(request.VideoPath), Path.GetFullPath(request.OutputPath), Path.GetFullPath(request.ReportPath),
            "--start", request.StartSeconds.ToString(CultureInfo.InvariantCulture), "--reference", request.ReferenceSeconds.ToString(CultureInfo.InvariantCulture) };
        if (request.EndSeconds is { } end) { arguments.Add("--end"); arguments.Add(end.ToString(CultureInfo.InvariantCulture)); }
        if (request.Stabilize) arguments.Add("--stabilize");
        await Process(options.VisionExecutablePath, arguments, root, token, progress is null ? null : line =>
        {
            if (!line.StartsWith('{')) return;
            using var document = JsonDocument.Parse(line);
            if (document.RootElement.TryGetProperty("stage", out var stage) && document.RootElement.TryGetProperty("fraction", out var fraction))
                progress.Report(new(stage.GetString() ?? "Preparing the video", fraction.GetDouble()));
        });
        using var report = JsonDocument.Parse(await File.ReadAllTextAsync(request.ReportPath, token));
        var value = report.RootElement;
        return new(value.GetProperty("startSeconds").GetDouble(), value.GetProperty("durationSeconds").GetDouble(),
            value.TryGetProperty("maxShiftPixels", out var shift) ? shift.GetDouble() : null);
    }

    public static PythonOptions LoadOptions(string root, string? settingsPath = null)
    {
        if (settingsPath is not null && (!File.Exists(settingsPath) || Path.GetFileName(settingsPath) != "settings.json"))
            throw new InvalidDataException("settingsPath must reference an existing MotionTrace settings.json.");
        var options = PythonOptions.Load(settingsPath is null ? null : Path.GetDirectoryName(Path.GetFullPath(settingsPath)));
        options.ScriptPath = Path.Combine(root, "ai", "pipeline.py");
        if (settingsPath is null && Directory.Exists(Path.Combine(root, ".models", "vision")))
            options.ModelsRoot = Path.Combine(root, ".models", "vision");
        foreach (var path in new[] { options.ComparisonScriptPath, options.ExecutablePath, options.VisionExecutablePath, options.PointsExecutablePath })
            if (!File.Exists(path)) throw new FileNotFoundException($"Required local MotionTrace component is missing: {path}");
        return options;
    }

    public static object Convert(MotionTrace.Core.Analysis.AnalysisResult raw, string movement, string videoPath, CancellationToken token = default, PoseCorrectionOptions? correction = null)
    {
        raw = new TemporalPoseCorrector(correction ?? new(), new LightPoseSmoother()).Correct(raw, token);
        var owners = raw.Frames.SelectMany(f => f.Objects).Where(o => o.MeasurementGroupId is not null).Select(o => o.AthleteId).Distinct().ToArray();
        if (owners.Length != 1 || owners[0] is not { } owner) throw new InvalidDataException("Expected exactly one owned pair of tracked points.");
        var samples = new ObjectTrajectoryProvider().Extract(raw.Frames, owner, Joint.LeftWrist, token);
        if (samples.Count == 0) throw new InvalidDataException("No frames have two visible, usable tracked points.");
        var exercise = Exercise(movement);
        var prepared = ProviderPreparation.Prepare(raw, videoPath, token: token);
        // No exercise classifier: an unspecified movement is split into reps as "down, then up" (most lifts). Phases
        // themselves come from the direction the points move, whatever the exercise.
        if (exercise == ExerciseType.Unknown) exercise = ExerciseType.Squat;
        var analysis = exercise is ExerciseType.BenchPress or ExerciseType.Squat or ExerciseType.Deadlift
            ? prepared.FindMovement(new(owner, exercise, MovementSource.Barbell, 1.5))?.Analysis : null;
        var points = analysis?.Points.ToDictionary(p => p.FrameIndex);
        var warnings = raw.Limitations.ToList();
        warnings.Add("Vertical image-space velocity is measured in px/s; camera motion is not removed and no metric calibration is applied.");
        if (analysis is null) warnings.Add("No repetitions were found in the motion of the marked points.");
        if (samples.Count < raw.Frames.Count) warnings.Add("Frames without two visible points are omitted; segments prevent bridging visibility gaps.");
        return new
        {
            schemaVersion = 1, engineVersion = raw.Versions.EngineVersion + "/" + ProviderPreparation.Version,
            modelVersion = raw.Versions.BarbellModelVersion, method = "tapnextpp-two-point-midpoint", positionUnit = "px", metersPerPixel = (double?)null,
            repetitions = analysis?.Reps.Select(rep => new
            {
                number = rep.Number, startSeconds = rep.Start, endSeconds = rep.End, meanSpeed = rep.Lifting.MeanSpeed, peakSpeed = rep.Lifting.PeakSpeed,
                phases = Phases(rep)
            }).ToArray() ?? [],
            trajectory = samples.Select(sample =>
            {
                MovementPoint? point = null;
                points?.TryGetValue(sample.FrameIndex, out point);
                return new { seconds = sample.TimestampSeconds, x = sample.Position.X, y = sample.Position.Y, velocity = point?.Velocity,
                    quality = sample.Confidence, occluded = false, segment = point?.Segment ?? sample.ContinuityId };
            }).ToArray(), warnings = warnings.ToArray()
        };
    }

    private static object[] Phases(MovementRep rep)
    {
        var moving = new[] { rep.Lowering, rep.Lifting }.OfType<MovementPhase>().OrderBy(p => p.Start).ToArray();
        var phases = new List<object>();
        for (var i = 0; i < moving.Length; i++)
        {
            if (i > 0 && moving[i].Start > moving[i - 1].End)
                phases.Add(new { kind = "pause", startSeconds = moving[i - 1].End, endSeconds = moving[i].Start, meanSpeed = (double?)null, peakSpeed = (double?)null });
            var phase = moving[i];
            phases.Add(new { kind = phase.Upward ? "concentric" : "eccentric", startSeconds = phase.Start, endSeconds = phase.End,
                meanSpeed = (double?)phase.MeanSpeed, peakSpeed = (double?)phase.PeakSpeed });
        }
        return phases.ToArray();
    }

    private static ExerciseType Exercise(string movement) => movement switch
    { "squat" => ExerciseType.Squat, "deadlift" => ExerciseType.Deadlift, "bench-press" => ExerciseType.BenchPress, "unspecified" => ExerciseType.Unknown, _ => throw new InvalidDataException("Unsupported movement.") };

    private static async Task<string> Process(string executable, IEnumerable<string> arguments, string root, CancellationToken token, Action<string>? onLine = null)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = root };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        start.Environment["PYTHONDONTWRITEBYTECODE"] = "1";
        start.Environment["PYTHONIOENCODING"] = "utf-8";
        start.Environment["HF_HUB_OFFLINE"] = "1"; start.Environment["TRANSFORMERS_OFFLINE"] = "1";
        var pythonDirectory = Path.GetDirectoryName(executable)!;
        start.Environment["PATH"] = pythonDirectory + Path.PathSeparator + Path.Combine(pythonDirectory, "Library", "bin") + Path.PathSeparator + start.Environment["PATH"];
        using var process = System.Diagnostics.Process.Start(start) ?? throw new InvalidOperationException("Could not start Python.");
        using var registration = token.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } });
        var stdout = onLine is null ? Tail(process.StandardOutput) : Lines(process.StandardOutput, onLine); var stderr = Tail(process.StandardError);
        await process.WaitForExitAsync(token);
        var output = await stdout; var errors = await stderr;
        if (process.ExitCode != 0) throw new InvalidOperationException($"Python exited {process.ExitCode}: {errors}");
        return output;
    }

    private static async Task<string> Lines(StreamReader reader, Action<string> onLine)
    {
        var tail = new StringBuilder(); string? line;
        while ((line = await reader.ReadLineAsync()) is not null)
        {
            tail.AppendLine(line); if (tail.Length > 32768) tail.Remove(0, tail.Length - 32768);
            try { onLine(line); } catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException) { }
        }
        return tail.ToString();
    }

    /// <summary>
    /// Maps the MotionTrace session's JSON progress lines ({"stage", "fraction", "providerId"}) to one bar:
    /// reading the video's timeline, then tracking the two marked points, which takes almost all of the time.
    /// </summary>
    private static Action<string> SessionProgress(IProgress<AnalysisProgress> progress)
    {
        var phase = (Name: "Preparing the analysis", Start: 0d, End: .05);
        var debug = Environment.GetEnvironmentVariable("TRAINFLOW_PROGRESS_LOG");
        return line =>
        {
            if (debug is not null) File.AppendAllText(debug, line + Environment.NewLine);
            if (!line.StartsWith('{')) return;
            using var document = JsonDocument.Parse(line);
            var data = document.RootElement;
            var stage = data.TryGetProperty("stage", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() ?? "" : "";
            var provider = data.TryGetProperty("providerId", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            double? fraction = data.TryGetProperty("fraction", out var f) && f.ValueKind == JsonValueKind.Number ? f.GetDouble() : null;
            // Points only: a short look at the video's timeline, then tracking the two points takes the rest.
            if (stage.StartsWith("Preparing the video timeline", StringComparison.Ordinal)) phase = ("Reading the video", .02, .06);
            // "tapnextpp: Queued" comes first, before any work: switch only once tracking reports progress.
            else if (provider == "tapnextpp" && fraction is not null && phase.Start < .06) phase = ("Tracking the points", .06, .95);
            else if (provider == "tapnextpp") return;
            else if (stage.StartsWith("Session complete", StringComparison.Ordinal)) { progress.Report(new("Measuring repetitions", .97)); return; }
            var within = fraction is { } value && double.IsFinite(value) ? Math.Clamp(value, 0, 1) : 0;
            progress.Report(new(phase.Name, phase.Start + (phase.End - phase.Start) * within));
        };
    }

    private static async Task<string> Tail(StreamReader reader)
    {
        var buffer = new char[4096]; var tail = new StringBuilder(); int count;
        while ((count = await reader.ReadAsync(buffer)) > 0) { tail.Append(buffer, 0, count); if (tail.Length > 32768) tail.Remove(0, tail.Length - 32768); }
        return tail.ToString();
    }
}

public sealed record PreprocessRequest(string VideoPath, string OutputPath, string MotionTraceRoot, string? SettingsPath, double StartSeconds, double? EndSeconds,
    double ReferenceSeconds, bool Stabilize, string ReportPath);
/// <summary>Where a step is: a short human stage and its 0..1 fraction.</summary>
public sealed record AnalysisProgress(string Stage, double Fraction);
public sealed record PreprocessResult(double StartSeconds, double DurationSeconds, double? MaxShiftPixels);
public sealed record Request(string VideoPath, Configuration Configuration, string MotionTraceRoot, string? SettingsPath = null, string? CacheDirectory = null, int TimeoutSeconds = 7200);
public sealed record Configuration(string Movement, Tracking Tracking);
public sealed record Tracking(double TimestampSeconds, int VideoWidth, int VideoHeight, Point[] Points);
public sealed record Point(double X, double Y);
