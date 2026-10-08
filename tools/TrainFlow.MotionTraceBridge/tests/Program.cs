using System.Text.Json;
using MotionTrace.Core.Analysis;
using MotionTrace.Core.Athletes;
using MotionTrace.Core.Exercise;
using MotionTrace.Core.Motion;
using MotionTrace.Core.PoseCorrection;
using MotionTrace.Infrastructure.AI;
using Bridge = TrainFlow.MotionTraceBridge.Program;

static void Check(bool value, string description) { if (!value) throw new Exception(description); }
static JsonElement Convert(AnalysisResult raw, string movement) => JsonSerializer.SerializeToElement(Bridge.Convert(raw, movement, "fixture.mp4"));
var frames = Enumerable.Range(0, 121).Select(i =>
{
    var y = 200 + 70 * Math.Sin(i / 120d * 4 * Math.PI);
    TrackedObject Point(int index) => new($"point-{index}", 1, null, null, .95, i == 60 && index == 1 ? TrackingState.Lost : TrackingState.Tracked,
        i == 60 && index == 1 ? null : new(new(100 + index * 100, y), "tapnextpp", AnalysisQuality.Reduced, false, false, false))
        { MeasurementGroupId = "pair", PointIndex = index };
    return new PoseFrame(i / 30d, []) { Objects = [Point(0), Point(1)] };
}).ToArray();
var raw = new AnalysisResult(4, new("fixture.mp4", 4.04, 400, 400, 30),
    new("fixture", "unavailable", "tap-points-5") { BarbellProvider = "tapnextpp" }, [new AthleteTrack(1, "Marked barbell")], frames, []);
var result = Convert(raw, "squat");
var trajectory = result.GetProperty("trajectory").EnumerateArray().ToArray();
Check(trajectory.Length == 120, "Lost endpoint must remove entire midpoint, not use surviving endpoint.");
Check(trajectory.All(p => p.GetProperty("x").GetDouble() == 150), "Midpoint coordinates must be exact.");
Check(trajectory[59].GetProperty("segment").GetInt32() != trajectory[60].GetProperty("segment").GetInt32(), "Single-frame visibility gap must split continuity.");
Check(trajectory.All(p => p.GetProperty("seconds").GetDouble() != 2), "Lost frame must not be fabricated.");
var unknown = Convert(raw, "unspecified");
Check(unknown.GetProperty("repetitions").GetArrayLength() == 0, "Unknown movement must not invent rep rules.");
Check(unknown.GetProperty("trajectory")[0].GetProperty("velocity").ValueKind == JsonValueKind.Null, "Unknown movement velocity is unavailable.");
VerifyParity(raw);
Console.WriteLine("PASS: exact midpoint, lost endpoint, continuity, classifier abstention, helper parity.");
if (args.Length >= 1)
{
    await using var stream = File.OpenRead(args[0]);
    var cached = await AnalysisJson.ReadAsync(stream);
    VerifyParity(cached);
    if (args.Length == 2) await File.WriteAllTextAsync(args[1], Convert(cached, "bench-press").GetRawText());
    Console.WriteLine($"PASS: cached tracker fixture parity ({cached.Frames.Count} frames).");
}

static void VerifyParity(AnalysisResult raw)
{
    var owner = raw.Frames.SelectMany(f => f.Objects).First(o => o.MeasurementGroupId is not null).AthleteId!.Value;
    foreach (var (name, exercise) in new[] { ("squat", ExerciseType.Squat), ("deadlift", ExerciseType.Deadlift), ("bench-press", ExerciseType.BenchPress) })
    {
        var corrected = new TemporalPoseCorrector(new(), new LightPoseSmoother()).Correct(raw);
        var expected = ProviderPreparation.Prepare(corrected, "fixture.mp4").FindMovement(new(owner, exercise, MovementSource.Barbell, 1.5))!.Analysis;
        var actual = Convert(raw, name);
        var reps = actual.GetProperty("repetitions");
        Check(reps.GetArrayLength() == expected.Reps.Count, "Repetition counts differ from MotionTrace.");
        for (var i = 0; i < expected.Reps.Count; i++)
        {
            Check(reps[i].GetProperty("startSeconds").GetDouble() == expected.Reps[i].Start, "Repetition boundaries differ.");
            Check(reps[i].GetProperty("peakSpeed").GetDouble() == expected.Reps[i].Lifting.PeakSpeed, "Repetition metrics differ.");
            var phases = reps[i].GetProperty("phases").EnumerateArray().ToArray();
            Check(phases.Count(p => p.GetProperty("kind").GetString() == "pause") == (expected.Reps[i].PauseSeconds > 0 ? 1 : 0), "Pause interval missing.");
            Check(phases.Select(p => p.GetProperty("startSeconds").GetDouble()).SequenceEqual(phases.Select(p => p.GetProperty("startSeconds").GetDouble()).Order()), "Phase chronology differs.");
        }
        var points = actual.GetProperty("trajectory").EnumerateArray().ToDictionary(p => p.GetProperty("seconds").GetDouble());
        foreach (var p in expected.Points)
            Check(points[p.Time].GetProperty("velocity").GetDouble() == p.Velocity, "Velocity differs from MotionTrace.");
        Console.WriteLine($"  {name}: {expected.Reps.Count} reps, {expected.Points.Count} velocity samples match.");
    }
}
