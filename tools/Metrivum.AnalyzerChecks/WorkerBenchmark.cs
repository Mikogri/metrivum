using System.Diagnostics;
using System.Text.Json;
using Metrivum.MotionTraceBridge;
using Bridge = Metrivum.MotionTraceBridge.Program;

public static class WorkerBenchmark
{
    public static async Task Run(string folder, string motionTrace, string? settings = null)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(8));
        var references = new Dictionary<string, JsonElement>();
        var measurements = new List<object>();
        var run = Path.Combine(folder, Guid.NewGuid().ToString("N"));
        var configuration = new Configuration(
            "unspecified",
            new(.5, 1920, 1080, [new(800, 450), new(1100, 450)])
        );
        await using var worker = new PythonAnalysisSession();
        foreach (
            var (name, clip, persistent) in new[]
            {
                ("legacy-a", "a", false),
                ("legacy-b", "b", false),
                ("worker-cold-a", "a", true),
                ("worker-warm-b", "b", true),
                ("worker-warm-a", "a", true),
            }
        )
        {
            var target = Path.Combine(run, name);
            Directory.CreateDirectory(target);
            var request = new Request(
                Path.Combine(folder, clip + ".mp4"),
                configuration,
                motionTrace,
                SettingsPath: settings,
                CacheDirectory: Path.Combine(target, "cache")
            );
            var timer = Stopwatch.StartNew();
            var result = await Bridge.AnalyzeAsync(
                request,
                Path.Combine(target, "raw.json"),
                deadline.Token,
                worker: persistent ? worker : null
            );
            var data = JsonSerializer.SerializeToElement(result);
            if (!persistent)
                references[clip] = data;
            else
                foreach (var key in new[] { "trajectory", "repetitions" })
                    if (
                        data.GetProperty(key).GetRawText()
                        != references[clip].GetProperty(key).GetRawText()
                    )
                        throw new Exception($"{key} changed for {name}");
            var row = new
            {
                name,
                seconds = timer.Elapsed.TotalSeconds,
                points = data.GetProperty("trajectory").GetArrayLength(),
                reps = data.GetProperty("repetitions").GetArrayLength(),
            };
            measurements.Add(row);
            Console.WriteLine(JsonSerializer.Serialize(row));
        }
        await File.WriteAllTextAsync(
            Path.Combine(folder, "benchmark.json"),
            JsonSerializer.Serialize(
                new { exactTrajectoryAndRepParity = true, measurements },
                new JsonSerializerOptions { WriteIndented = true }
            )
        );
        Console.WriteLine(
            "PASS: full pipeline trajectories, velocities and repetitions match across different videos and reused weights."
        );
    }
}
