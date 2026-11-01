using System.Text.Json;
using Metrivum.MotionTraceBridge;

var root = Path.GetFullPath(args[0]);
if (!root.StartsWith(Path.GetFullPath(".local") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Use an isolated .local test directory.");
Directory.CreateDirectory(root);
if (args.Length > 2 && args[1] == "--benchmark")
{
    await WorkerBenchmark.Run(root, Path.GetFullPath(args[2]), args.Length > 3 ? Path.GetFullPath(args[3]) : null);
    return;
}
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
AnalysisJob Add(JobQueue queue) {
    var job = new AnalysisJob { Id = Guid.NewGuid().ToString(), Account = "test-account", Name = "Test", FileName = "test.mp4",
        ContentType = "video/mp4", Size = 1, SourceVideo = new(1, 100, 100), CreatedAt = DateTimeOffset.UtcNow,
        Configuration = new("unspecified", new(0, 100, 100, [new(10, 10), new(30, 30)])) };
    Check(queue.TryReserve(), "Could not reserve test job");
    queue.Add(job);
    File.WriteAllBytes(queue.VideoPath(job), [0]);
    return job;
}
async Task WaitFor(Func<bool> ready) {
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
    while (!ready()) await Task.Delay(10, deadline.Token);
}

var queue = new JobQueue(root, json);
var failed = Add(queue);
var cache = Path.Combine(queue.Folder(failed.Id), "cache");
using (var stop = new CancellationTokenSource()) {
    var run = queue.RunAsync((job, folder, _) => {
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "completed-stage.json"), "verified fixture");
        throw new InvalidDataException("Fixture failure after a completed stage");
    }, stop.Token);
    await WaitFor(() => failed.State == "failed" && !queue.Busy);
    stop.Cancel(); await run;
}
Check(File.Exists(Path.Combine(cache, "completed-stage.json")), "Failed attempts must retain reusable stages");
Check(queue.Retry(failed), "Failed job must be retryable");
using (var stop = new CancellationTokenSource()) {
    var run = queue.RunAsync((job, folder, _) => {
        Check(File.ReadAllText(Path.Combine(folder, "completed-stage.json")) == "verified fixture", "Retry lost its completed stage");
        return Task.FromResult<object>(new { schemaVersion = 1 });
    }, stop.Token);
    await WaitFor(() => failed.State == "done" && !Directory.Exists(cache));
    stop.Cancel(); await run;
}
Check(File.Exists(queue.ResultPath(failed)), "Completed result must survive cache cleanup");

var expiring = Add(queue);
var oldCache = Path.Combine(queue.Folder(expiring.Id), "cache");
Directory.CreateDirectory(oldCache);
var oldStage = Path.Combine(oldCache, "stage.json");
File.WriteAllText(oldStage, "old");
File.SetLastWriteTimeUtc(oldStage, DateTime.UtcNow.AddDays(-2));
Directory.SetLastWriteTimeUtc(oldCache, DateTime.UtcNow.AddDays(-2));
_ = new JobQueue(root, json);
Check(!Directory.Exists(oldCache), "Expired cache must be removed on restart");
Check(File.Exists(queue.VideoPath(expiring)), "Cache expiry must preserve the source video");

var oversized = Add(queue);
var largeCache = Path.Combine(queue.Folder(oversized.Id), "cache");
Directory.CreateDirectory(largeCache);
using (var large = File.Create(Path.Combine(largeCache, "stage.bin"))) large.SetLength(512L * 1024 * 1024 + 1);
_ = new JobQueue(root, json);
Check(!Directory.Exists(largeCache), "Retained cache must respect the global disk budget");
Check(File.Exists(queue.VideoPath(oversized)), "Disk budget must preserve source videos");
queue.Remove(oversized); queue.Remove(expiring); queue.Remove(failed);
Console.WriteLine($"{checks} analyzer queue checks passed.");
if (args.Length > 1) await WorkerChecks.Run(root, Path.GetFullPath(args[1]));
