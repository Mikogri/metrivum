using System.Collections.Concurrent;
using System.Text.Json;
using Metrivum.MotionTraceBridge;

public sealed record SourceVideo(double DurationSeconds, int Width, int Height);
/// <summary>The part of the video to analyze, in the original video's seconds.</summary>
public sealed record Trim(double StartSeconds, double EndSeconds);
/// <summary>The trimmed/stabilized clip that was analyzed: its length and the marked frame's time inside it.</summary>
public sealed record Processed(double DurationSeconds, double TimestampSeconds, double? MaxShiftPixels);

/// <summary>What the browser sends with each queued video (URI-encoded JSON header, so names may use any language).</summary>
public sealed record JobRequest(string? Movement, Tracking? Tracking, string? Name, string? Account, SourceVideo? SourceVideo, string? FileName,
    Trim? Trim = null, bool Stabilize = false);

/// <summary>One queued video. Kept as job.json next to the video, so the queue survives restarts and closed browsers.</summary>
public sealed class AnalysisJob
{
    public required string Id { get; init; }
    public required string Account { get; init; }
    public required string Name { get; init; }
    public required string FileName { get; init; }
    public required string ContentType { get; init; }
    public required long Size { get; set; }
    public required Configuration Configuration { get; init; }
    public required SourceVideo SourceVideo { get; init; }
    public Trim? Trim { get; init; }
    public bool Stabilize { get; init; }
    /// <summary>Set once the clip is trimmed/stabilized; the analysis, the result and the saved video all use that clip.</summary>
    public Processed? Processed { get; set; }
    public bool NeedsPreprocessing => Trim is not null || Stabilize;
    public DateTimeOffset CreatedAt { get; init; }
    public string State { get; set; } = "queued";
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public string? Error { get; set; }
    /// <summary>What the analyzer is doing now and how far it is (real progress from the pipeline; not saved to disk).</summary>
    [System.Text.Json.Serialization.JsonIgnore] public string? Stage { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public double? Fraction { get; set; }
    /// <summary>Set by the browser once the video is uploaded, so a later save never uploads it twice.</summary>
    public string? MediaId { get; set; }
}

/// <summary>
/// Up to <see cref="Limit"/> videos waiting, analyzing or finished on this computer. One worker analyzes them in
/// order; finished results stay on disk until a signed-in browser saves them to the library and removes them.
/// </summary>
public sealed class JobQueue
{
    public const int Limit = 10;
    public const long MaxVideoBytes = 268435456;
    private const long RetainedCacheBytes = 512L * 1024 * 1024;
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromHours(24);
    private readonly string root;
    private readonly JsonSerializerOptions json;
    private readonly ConcurrentDictionary<string, AnalysisJob> jobs = new();
    private readonly SemaphoreSlim wake = new(0);
    private readonly object sync = new();
    private int reserved;
    private bool updating;
    private CancellationTokenSource? running;
    private string? runningId;

    public JobQueue(string root, JsonSerializerOptions json)
    {
        this.root = root;
        this.json = json;
        Directory.CreateDirectory(root);
        foreach (var folder in Directory.EnumerateDirectories(root))
        {
            try
            {
                var job = JsonSerializer.Deserialize<AnalysisJob>(File.ReadAllText(Path.Combine(folder, "job.json")), json);
                if (job is null || !Guid.TryParse(job.Id, out _) || Path.GetFileName(folder) != job.Id || !File.Exists(VideoPath(job))) { TryDelete(folder); continue; }
                // Interrupted by a restart or crash: analyze it again from the start.
                if (job.State == "analyzing") { job.State = "queued"; job.StartedAt = null; Save(job); }
                jobs[job.Id] = job;
            }
            catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException or NotSupportedException)
            {
                Console.Error.WriteLine("Skipped an unreadable queued analysis.");
            }
        }
        PruneCaches();
    }

    public bool Busy => runningId is not null;
    public bool Updating { get { lock (sync) return updating; } }

    public bool TryBeginUpdate()
    {
        lock (sync)
        {
            if (updating || runningId is not null || reserved != 0) return false;
            updating = true;
            return true;
        }
    }

    public void EndUpdate() { lock (sync) updating = false; wake.Release(); }

    public IEnumerable<AnalysisJob> List(string? account) =>
        jobs.Values.Where(job => account is null || job.Account == account).OrderBy(job => job.CreatedAt);

    public AnalysisJob? Get(string id) => Guid.TryParse(id, out _) && jobs.TryGetValue(id, out var job) ? job : null;

    public string Folder(string id) => Path.Combine(root, id);
    public string VideoPath(AnalysisJob job) => Path.Combine(Folder(job.Id), "video" + Extension(job.ContentType));
    public string ResultPath(AnalysisJob job) => Path.Combine(Folder(job.Id), "result.json");
    public string ProcessedPath(AnalysisJob job) => Path.Combine(Folder(job.Id), "processed.mp4");
    /// <summary>The video that goes to the library: the analyzed clip when it was trimmed or stabilized.</summary>
    public string UploadPath(AnalysisJob job) => job.Processed is not null && File.Exists(ProcessedPath(job)) ? ProcessedPath(job) : VideoPath(job);

    public static string? Extension(string? contentType) => contentType switch
    { "video/mp4" => ".mp4", "video/quicktime" => ".mov", "video/webm" => ".webm", _ => null };

    /// <summary>Holds one of the <see cref="Limit"/> places while a video is being received.</summary>
    public bool TryReserve()
    {
        lock (sync)
        {
            if (updating || jobs.Count + reserved >= Limit) return false;
            reserved++;
            return true;
        }
    }

    public void Release() { lock (sync) reserved--; }

    public void Add(AnalysisJob job)
    {
        lock (sync)
        {
            reserved--;
            Save(job);
            jobs[job.Id] = job;
        }
        wake.Release();
    }

    public void Update(AnalysisJob job, Action<AnalysisJob> change)
    {
        lock (sync) { change(job); if (jobs.ContainsKey(job.Id)) Save(job); }
    }

    public bool Retry(AnalysisJob job)
    {
        lock (sync)
        {
            if (job.State != "failed") return false;
            job.State = "queued"; job.Error = null; job.StartedAt = null; job.FinishedAt = null; job.Processed = null;
            try { File.Delete(ProcessedPath(job)); } catch (IOException) { }
            Save(job);
        }
        wake.Release();
        return true;
    }

    /// <summary>Removes a job; a running analysis is stopped first (its folder is cleaned up when it stops).</summary>
    public void Remove(AnalysisJob job)
    {
        lock (sync)
        {
            jobs.TryRemove(job.Id, out _);
            if (runningId == job.Id) { running?.Cancel(); return; }
        }
        TryDelete(Folder(job.Id));
    }

    /// <summary>Line position (1 = next) for queued jobs, so the browser can say "2nd in line".</summary>
    public int? Position(AnalysisJob job)
    {
        if (job.State != "queued") return null;
        return jobs.Values.Count(other => other.State == "queued" && other.CreatedAt <= job.CreatedAt);
    }

    /// <summary>The analyzer reports no progress while it works, so this is an estimate: fast at first, never 100 % before it is done.</summary>
    public static double Progress(AnalysisJob job)
    {
        if (job.State == "done") return 1;
        if (job.State != "analyzing" || job.StartedAt is not { } started) return 0;
        // Real progress reported by the pipeline; the time-based estimate below is only a fallback.
        if (job.Fraction is { } fraction) return Math.Clamp(fraction, 0, .99);
        var full = job.SourceVideo.DurationSeconds is > 0 and var seconds && double.IsFinite(seconds) ? seconds : 20;
        var duration = job.Trim is { } trim ? Math.Max(1, trim.EndSeconds - trim.StartSeconds) : full;
        // Stabilizing re-encodes every frame, which roughly doubles the work.
        var expected = Math.Clamp(12 + duration * (job.Stabilize ? 7 : job.Trim is null ? 3 : 4), 20, 1800);
        var elapsed = (DateTimeOffset.UtcNow - started).TotalSeconds;
        return elapsed <= 0 ? 0 : Math.Min(0.97, 1 - Math.Exp(-3 * elapsed / expected));
    }

    public object View(AnalysisJob job) => new
    {
        id = job.Id, name = job.Name, fileName = job.FileName, size = job.Size, state = job.State, progress = Progress(job), stage = job.State == "analyzing" ? job.Stage : null,
        position = Position(job), createdAt = job.CreatedAt, startedAt = job.StartedAt, finishedAt = job.FinishedAt,
        error = job.Error, mediaId = job.MediaId,
        // After trimming/stabilizing, the browser saves the analyzed clip: its length and the marked frame's time in it.
        sourceVideo = job.Processed is { } clip ? job.SourceVideo with { DurationSeconds = clip.DurationSeconds } : job.SourceVideo,
        configuration = new { movement = job.Configuration.Movement, tracking = job.Processed is { } shifted ? job.Configuration.Tracking with { TimestampSeconds = shifted.TimestampSeconds } : job.Configuration.Tracking },
        contentType = job.Processed is null ? job.ContentType : "video/mp4",
        trim = job.Trim, stabilize = job.Stabilize, maxShiftPixels = job.Processed?.MaxShiftPixels,
    };

    /// <summary>The single worker: analyzes queued videos one at a time, oldest first, until the analyzer closes.</summary>
    public async Task RunAsync(Func<AnalysisJob, string, CancellationToken, Task<object>> analyze, CancellationToken stopping)
    {
        while (!stopping.IsCancellationRequested)
        {
            AnalysisJob? job;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stopping);
            lock (sync)
            {
                job = updating ? null : jobs.Values.Where(item => item.State == "queued").OrderBy(item => item.CreatedAt).FirstOrDefault();
                if (job is not null)
                {
                    running = timeout; runningId = job.Id;
                    job.State = "analyzing"; job.StartedAt = DateTimeOffset.UtcNow; job.Error = null;
                    Save(job);
                }
            }
            if (job is null)
            {
                try { await wake.WaitAsync(stopping); } catch (OperationCanceledException) { return; }
                continue;
            }
            timeout.CancelAfter(TimeSpan.FromHours(2));
            var cache = Path.Combine(Folder(job.Id), "cache");
            string state; string? error = null;
            try
            {
                var result = await analyze(job, cache, timeout.Token);
                await File.WriteAllTextAsync(ResultPath(job), JsonSerializer.Serialize(result, json), timeout.Token);
                state = "done";
                Console.WriteLine($"Analysis finished: {job.Name}");
            }
            catch (OperationCanceledException) when (stopping.IsCancellationRequested) { state = "queued"; }
            catch (OperationCanceledException) { state = "failed"; error = "The analysis was stopped or took longer than 2 hours."; }
            catch (Exception failure) when (failure is JsonException or InvalidDataException or ArgumentException)
            { state = "failed"; error = "Invalid tracking selection or video. Check the marked points and try again."; Console.Error.WriteLine($"Analysis failed ({job.Name}): {failure.Message}"); }
            catch (Exception failure)
            {
                // Diagnostics stay in this window; paths and subprocess output never reach the web page.
                state = "failed"; error = "Local analysis failed. Check the analyzer window for details.";
                Console.Error.WriteLine($"Analysis failed ({job.Name}): {failure.Message}");
            }
            lock (sync)
            {
                running = null; runningId = null;
                job.Stage = null; job.Fraction = null;
                job.State = state; job.Error = error;
                job.FinishedAt = state is "done" or "failed" ? DateTimeOffset.UtcNow : null;
                if (state == "queued") job.StartedAt = null;
            }
            if (state == "done" || !jobs.ContainsKey(job.Id)) TryDelete(cache);
            PruneCaches();
            if (jobs.ContainsKey(job.Id)) lock (sync) Save(job);
            else TryDelete(Folder(job.Id));
        }
    }

    private void Save(AnalysisJob job)
    {
        var folder = Folder(job.Id);
        Directory.CreateDirectory(folder);
        var temporary = Path.Combine(folder, "job.json.tmp");
        File.WriteAllText(temporary, JsonSerializer.Serialize(job, json));
        File.Move(temporary, Path.Combine(folder, "job.json"), overwrite: true);
    }

    private void PruneCaches()
    {
        var retained = new List<(string Path, long Bytes, DateTime LastWrite)>();
        var oldest = DateTime.UtcNow - CacheLifetime;
        foreach (var job in jobs.Values.Where(job => job.State != "analyzing"))
        {
            var cache = Path.Combine(Folder(job.Id), "cache");
            try
            {
                if (!Directory.Exists(cache)) continue;
                if ((File.GetAttributes(cache) & FileAttributes.ReparsePoint) != 0) { TryDelete(cache); continue; }
                var files = new DirectoryInfo(cache).EnumerateFiles("*", new EnumerationOptions {
                    RecurseSubdirectories = true, AttributesToSkip = FileAttributes.ReparsePoint
                }).ToArray();
                var lastWrite = files.Select(file => file.LastWriteTimeUtc).Append(Directory.GetLastWriteTimeUtc(cache)).Max();
                if (job.State == "done" || lastWrite < oldest) { TryDelete(cache); continue; }
                retained.Add((cache, files.Sum(file => file.Length), lastWrite));
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            { Console.Error.WriteLine("Could not inspect a retained analysis cache."); }
        }
        // Cache is private to the immutable job; Python still verifies video/config/source hashes before reuse.
        var bytes = retained.Sum(cache => cache.Bytes);
        foreach (var cache in retained.OrderBy(cache => cache.LastWrite))
        {
            if (bytes <= RetainedCacheBytes) break;
            TryDelete(cache.Path);
            bytes -= cache.Bytes;
        }
    }

    public static void TryDelete(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { Console.Error.WriteLine("Could not remove a finished analysis folder."); }
    }
}
