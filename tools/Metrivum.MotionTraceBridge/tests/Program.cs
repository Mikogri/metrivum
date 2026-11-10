using System.Text.Json;
using Metrivum.MotionTraceBridge;
using MotionTrace.Core.Analysis;
using MotionTrace.Core.Athletes;
using MotionTrace.Core.Exercise;
using MotionTrace.Core.Motion;
using MotionTrace.Core.PoseCorrection;
using MotionTrace.Infrastructure.AI;
using Bridge = Metrivum.MotionTraceBridge.Program;

static void Check(bool value, string description)
{
    if (!value)
        throw new Exception(description);
}
static JsonElement Convert(AnalysisResult raw, string movement) =>
    JsonSerializer.SerializeToElement(
        Bridge.Convert(raw, movement, "fixture.mp4"),
        new JsonSerializerOptions(JsonSerializerDefaults.Web)
    );
foreach (var strokes in new[] { 2, 3 })
{
    // Multiple catches remain above the starting floor; only the final return ends the sequence.
    var levels =
        strokes == 2
            ? new double[] { 500, 280, 330, 100, 500 }
            : [500, 300, 340, 200, 240, 100, 500];
    var signal = new List<MovementPoint>();
    for (int leg = 0; leg < levels.Length - 1; leg++)
    for (int tick = 0; tick < 20; tick++)
        signal.Add(
            new(
                signal.Count * .05,
                levels[leg] + (levels[leg + 1] - levels[leg]) * tick / 20,
                levels[leg + 1] - levels[leg],
                0
            )
        );
    signal.Add(new(signal.Count * .05, levels[^1], 0, 0));
    var sequences = DirectionalSequences.Detect(signal, 1080);
    Check(sequences.Length == 1, "Intermediate catches must not split a compound sequence.");
    Check(
        sequences[0].Phases.Count(p => p.Kind == "concentric") == strokes,
        "Every lifting stroke must survive."
    );
    Check(
        sequences[0].Phases.Count(p => p.Kind == "eccentric") == strokes,
        "Every lowering stroke must survive."
    );
    var second = signal.Select(p => p with { Time = p.Time + signal[^1].Time + .05 }).ToArray();
    Check(
        DirectionalSequences.Detect(signal.Concat(second).ToArray(), 1080).Length == 2,
        "Two complete cycles must remain two sequences."
    );
}
Check(
    DirectionalSequences
        .Detect(
            Enumerable
                .Range(0, 20)
                .Select(i => new MovementPoint(i * .05, 500 + Math.Sin(i) * .3, 0, 0))
                .ToArray(),
            1080
        )
        .Length == 0,
    "Tracking shimmer is not a phase."
);
var paused = Enumerable
    .Range(0, 81)
    .Select(i =>
    {
        double t = i * .05;
        return new MovementPoint(
            t,
            t < 1 ? 500 - 200 * t
                : t < 2 ? 300
                : t < 3 ? 300 - 200 * (t - 2)
                : 100 + 400 * (t - 3),
            t < 1 ? -200
                : t < 2 ? 0
                : t < 3 ? -200
                : 400,
            0
        );
    })
    .ToArray();
var pausedSequence = DirectionalSequences.Detect(paused, 1080).Single();
Check(
    pausedSequence.Phases.Count(p => p.Kind == "concentric") == 2
        && pausedSequence.Phases.Any(p => p.Kind == "pause"),
    "A rack pause must separate two upward strokes even without a downward dip."
);
var gapped = paused.Select((p, i) => p with { Segment = i < 40 ? 0 : 1 }).ToArray();
Check(
    DirectionalSequences
        .Detect(gapped, 1080)
        .All(sequence =>
            sequence.Phases.All(p => p.EndSeconds <= 1.95)
            || sequence.Phases.All(p => p.StartSeconds >= 2)
        ),
    "Visibility gaps cannot join sequences."
);
var frames = Enumerable
    .Range(0, 121)
    .Select(i =>
    {
        var y = 200 + 70 * Math.Sin(i / 120d * 4 * Math.PI);
        TrackedObject Point(int index) =>
            new(
                $"point-{index}",
                1,
                null,
                null,
                .95,
                i == 60 && index == 1 ? TrackingState.Lost : TrackingState.Tracked,
                i == 60 && index == 1
                    ? null
                    : new(
                        new(100 + index * 100, y),
                        "tapnextpp",
                        AnalysisQuality.Reduced,
                        false,
                        false,
                        false
                    )
            )
            {
                MeasurementGroupId = "pair",
                PointIndex = index,
            };
        return new PoseFrame(i / 30d, []) { Objects = [Point(0), Point(1)] };
    })
    .ToArray();
var raw = new AnalysisResult(
    4,
    new("fixture.mp4", 4.04, 400, 400, 30),
    new("fixture", "unavailable", "tap-points-5") { BarbellProvider = "tapnextpp" },
    [new AthleteTrack(1, "Marked barbell")],
    frames,
    []
);
var result = Convert(raw, "squat");
var trajectory = result.GetProperty("trajectory").EnumerateArray().ToArray();
Check(
    trajectory.Length == 120,
    "Lost endpoint must remove entire midpoint, not use surviving endpoint."
);
Check(
    trajectory.All(p => p.GetProperty("x").GetDouble() == 150),
    "Midpoint coordinates must be exact."
);
Check(
    trajectory[59].GetProperty("segment").GetInt32()
        != trajectory[60].GetProperty("segment").GetInt32(),
    "Single-frame visibility gap must split continuity."
);
Check(
    trajectory.All(p => p.GetProperty("seconds").GetDouble() != 2),
    "Lost frame must not be fabricated."
);
var unknown = Convert(raw, "unspecified");

// No classifier: an unspecified movement is measured from the points' motion like any down-then-up lift.
Check(
    unknown.GetProperty("repetitions").GetArrayLength() > 0,
    "Unspecified movement must retain directional sequences."
);
VerifyParity(raw);
Console.WriteLine(
    "PASS: exact midpoint, lost endpoint, continuity, points-only reps, helper parity."
);
if (args.Length == 2 && args[0] == "--trajectory")
{
    using var document = JsonDocument.Parse(File.ReadAllText(args[1]));
    var points = document
        .RootElement.GetProperty("trajectory")
        .EnumerateArray()
        .Select(p => new MovementPoint(
            p.GetProperty("seconds").GetDouble(),
            p.GetProperty("y").GetDouble(),
            p.GetProperty("velocity").GetDouble(),
            p.GetProperty("segment").GetInt32()
        ))
        .ToArray();
    foreach (var sequence in DirectionalSequences.Detect(points, 1080))
        Console.WriteLine(
            JsonSerializer.Serialize(
                sequence,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)
            )
        );
    return;
}

if (args.Length >= 1)
{
    await using var stream = File.OpenRead(args[0]);
    var cached = await AnalysisJson.ReadAsync(stream);
    VerifyParity(cached);
    if (args.Length >= 2)
        await File.WriteAllTextAsync(
            args[1],
            Convert(cached, args.Length >= 3 ? args[2] : "bench-press").GetRawText()
        );
    Console.WriteLine($"PASS: cached tracker fixture parity ({cached.Frames.Count} frames).");
}

static void VerifyParity(AnalysisResult raw)
{
    var owner = raw
        .Frames.SelectMany(f => f.Objects)
        .First(o => o.MeasurementGroupId is not null)
        .AthleteId!.Value;
    foreach (
        var (name, exercise) in new[]
        {
            ("squat", ExerciseType.Squat),
            ("deadlift", ExerciseType.Deadlift),
            ("bench-press", ExerciseType.BenchPress),
        }
    )
    {
        var corrected = new TemporalPoseCorrector(new(), new LightPoseSmoother()).Correct(raw);
        var expected = ProviderPreparation
            .Prepare(corrected, "fixture.mp4")
            .FindMovement(new(owner, exercise, MovementSource.Barbell, 1.5))!
            .Analysis;
        var actual = Convert(raw, name);
        var reps = actual.GetProperty("repetitions");
        Check(
            reps.GetArrayLength() == expected.Reps.Count,
            "Repetition counts differ from MotionTrace."
        );
        for (var i = 0; i < expected.Reps.Count; i++)
        {
            Check(
                reps[i].GetProperty("startSeconds").GetDouble() == expected.Reps[i].Start,
                "Repetition boundaries differ."
            );
            Check(
                reps[i].GetProperty("peakSpeed").GetDouble() == expected.Reps[i].Lifting.PeakSpeed,
                "Repetition metrics differ."
            );
            var phases = reps[i].GetProperty("phases").EnumerateArray().ToArray();
            Check(
                phases.Count(p => p.GetProperty("kind").GetString() == "pause")
                    == (expected.Reps[i].PauseSeconds > 0 ? 1 : 0),
                "Pause interval missing."
            );
            Check(
                phases
                    .Select(p => p.GetProperty("startSeconds").GetDouble())
                    .SequenceEqual(
                        phases.Select(p => p.GetProperty("startSeconds").GetDouble()).Order()
                    ),
                "Phase chronology differs."
            );
        }
        var points = actual
            .GetProperty("trajectory")
            .EnumerateArray()
            .ToDictionary(p => p.GetProperty("seconds").GetDouble());
        foreach (var p in expected.Points)
            Check(
                points[p.Time].GetProperty("velocity").GetDouble() == p.Velocity,
                "Velocity differs from MotionTrace."
            );
        Console.WriteLine(
            $"  {name}: {expected.Reps.Count} reps, {expected.Points.Count} velocity samples match."
        );
    }
}
