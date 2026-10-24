using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TrainFlow.MotionTraceBridge;
using Bridge = TrainFlow.MotionTraceBridge.Program;

ConsoleWindow.Capture();
var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile(Path.Combine(AppContext.BaseDirectory, "analyzer.json"), optional: true).AddCommandLine(args);
builder.WebHost.UseUrls("http://127.0.0.1:59121");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 268435456);
builder.Logging.ClearProviders();
var root = Path.GetFullPath(builder.Configuration["MotionTraceRoot"] ?? "../MotionTrace", AppContext.BaseDirectory);
var settings = builder.Configuration["SettingsPath"] is { } configuredSettings ? Path.GetFullPath(configuredSettings, AppContext.BaseDirectory) : null;
if (builder.Configuration["TorchHome"] is { } torchHome)
    Environment.SetEnvironmentVariable("TORCH_HOME", Path.GetFullPath(torchHome, AppContext.BaseDirectory));
if (!File.Exists(Path.Combine(root, "ai/comparison/analyze_session.py")))
    throw new InvalidOperationException("Set --MotionTraceRoot to the installed MotionTrace source directory.");
var origin = builder.Configuration["WebOrigin"] ?? "http://localhost:5173";
if (!Uri.TryCreate(origin, UriKind.Absolute, out var web) || !(web.Scheme == "https" || web.IsLoopback && web.Scheme == "http") || web.GetLeftPart(UriPartial.Authority) != origin)
    throw new InvalidOperationException("WebOrigin must be an exact HTTPS or local HTTP origin, without a trailing slash.");
// One pairing per computer: the token is created once and kept in the user's profile, so the browser
// that paired once keeps working after restarts. Delete the file to unpair every browser.
var pairingFile = builder.Configuration["PairingFile"] is { } configuredPairing
    ? Path.GetFullPath(configuredPairing, AppContext.BaseDirectory)
    : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TrainFlowAnalyzer", "pairing-token");
var pairing = LoadPairing(pairingFile);
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
// Queued videos live in the user's profile until a signed-in browser saves them to the library.
var jobsRoot = builder.Configuration["JobsDirectory"] is { } configuredJobs
    ? Path.GetFullPath(configuredJobs, AppContext.BaseDirectory)
    : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TrainFlowAnalyzer", "jobs");
var queue = new JobQueue(jobsRoot, json);
var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    // Exact Host and Origin checks reject DNS rebinding and unpaired browser pages.
    if (context.Request.Host.Value != "127.0.0.1:59121" || context.Request.Headers.Origin != origin ||
        context.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip))
    { context.Response.StatusCode = 403; return; }
    context.Response.Headers.AccessControlAllowOrigin = origin;
    context.Response.Headers.Vary = "Origin";
    if (context.Request.Method == "OPTIONS")
    {
        context.Response.Headers.AccessControlAllowMethods = "GET, POST, PUT, DELETE, OPTIONS";
        context.Response.Headers.AccessControlAllowHeaders = "Authorization, Content-Type, X-TrainFlow-Job";
        context.Response.StatusCode = 204; return;
    }
    if (context.Request.Method == "GET" && context.Request.Path == "/discovery") { await next(context); return; }
    // Pairing hands the token only to the one configured site (exact Origin, loopback, exact Host above).
    if (context.Request.Method == "POST" && context.Request.Path == "/pair") { await next(context); return; }
    var authorization = Encoding.UTF8.GetBytes(context.Request.Headers.Authorization.ToString());
    var expected = Encoding.UTF8.GetBytes("Bearer " + pairing);
    if (!CryptographicOperations.FixedTimeEquals(authorization, expected))
    { context.Response.StatusCode = 401; return; }
    await next(context);
});
app.MapGet("/discovery", () => new { application = "TrainFlow.LocalAnalyzer", protocolVersion = 1, version = AnalyzerUpdate.Version, pairing = "automatic", features = new[] { "jobs", "preprocess", "updates" } });
app.MapPost("/update", async () =>
{
    if (!queue.TryBeginUpdate()) return Results.Problem("Finish the current analysis or upload before updating.", statusCode: 409);
    var launched = false;
    try
    {
        var updater = await AnalyzerUpdate.InstallAsync(origin, app.Lifetime.ApplicationStopping);
        launched = true;
        // Cancelled/failed installers must release an old host they did not shut down.
        _ = Task.Run(async () => { using (updater) { await updater.WaitForExitAsync(); queue.EndUpdate(); } });
        return Results.Accepted();
    }
    catch (Exception error) when (error is HttpRequestException or IOException or InvalidDataException or JsonException or OperationCanceledException or System.ComponentModel.Win32Exception)
    {
        return Results.Problem("The update could not be started. Download the installer or try again.", statusCode: 503);
    }
    finally { if (!launched) queue.EndUpdate(); }
});
app.MapPost("/pair", () =>
{
    Console.WriteLine($"Paired with {origin}.");
    return Results.Ok(new { token = pairing });
});
app.MapGet("/status", () =>
{
    try
    {
        var options = Bridge.LoadOptions(root, settings);
        var installed = File.Exists(Path.Combine(options.ModelsRoot, "manifest.json")) && File.Exists(Path.Combine(options.EffectivePointsModelsRoot, "manifest.json"));
        return Results.Ok(new { state = !installed ? "runtime_missing" : queue.Busy ? "analyzing" : "ready", protocolVersion = 1, version = AnalyzerUpdate.Version });
    }
    catch (Exception error) when (error is IOException or InvalidDataException or JsonException or UnauthorizedAccessException)
    { return Results.Ok(new { state = "runtime_missing", protocolVersion = 1, version = AnalyzerUpdate.Version }); }
});
// "Show analyzer window" in Metrivum (and a second start of the analyzer) bring this window up, creating it if needed.
app.MapPost("/window", () => { ConsoleWindow.Show("Metrivum Analyzer"); return Results.NoContent(); });
app.MapGet("/jobs", (string? account) => queue.List(account).Select(queue.View).ToArray());
app.MapPost("/jobs", async (HttpContext context) =>
{
    // The browser may close right after this returns: the video and settings are kept on disk until saved.
    JobRequest? request;
    try { request = JsonSerializer.Deserialize<JobRequest>(Uri.UnescapeDataString(context.Request.Headers["X-TrainFlow-Job"].ToString()), json); }
    catch (Exception error) when (error is JsonException or UriFormatException) { return Results.BadRequest(new { detail = "Invalid analysis settings." }); }
    if (request?.Tracking?.Points is not { Length: 2 }) return Results.BadRequest(new { detail = "Mark two tracking points before starting." });
    if (request.Movement is not ("squat" or "bench-press" or "deadlift" or "unspecified")) return Results.BadRequest(new { detail = "Choose a movement." });
    if (string.IsNullOrWhiteSpace(request.Account) || request.Account.Length > 128) return Results.BadRequest(new { detail = "Sign in to Metrivum before queuing videos." });
    if (request.SourceVideo is not { Width: > 0, Height: > 0 } source || !double.IsFinite(source.DurationSeconds) || source.DurationSeconds < 0)
        return Results.BadRequest(new { detail = "Video details are missing." });
    if (request.Trim is { } trim && (!double.IsFinite(trim.StartSeconds) || !double.IsFinite(trim.EndSeconds) || trim.StartSeconds < 0
        || trim.EndSeconds - trim.StartSeconds < 0.5 || (source.DurationSeconds > 0 && trim.EndSeconds > source.DurationSeconds + 0.25)))
        return Results.BadRequest(new { detail = "Choose a part of the video at least half a second long." });
    if (request.Trim is { } range && (request.Tracking.TimestampSeconds < range.StartSeconds || request.Tracking.TimestampSeconds > range.EndSeconds))
        return Results.BadRequest(new { detail = "Mark the points on a frame inside the trimmed part." });
    var extension = JobQueue.Extension(context.Request.ContentType);
    if (extension is null) return Results.BadRequest(new { detail = "Choose an MP4, MOV or WebM video." });
    if (context.Request.ContentLength > JobQueue.MaxVideoBytes) return Results.StatusCode(413);
    if (!queue.TryReserve()) return Results.Problem(queue.Updating ? "The analyzer is updating. Try again when it restarts." : $"The analyzer already holds {JobQueue.Limit} videos. Wait for some to finish or remove them.", statusCode: 409);
    var fileName = Path.GetFileName(request.FileName ?? "") is { Length: > 0 and <= 255 } given ? given : "video" + extension;
    var label = request.Name?.Trim() is { Length: > 0 } title ? title : Path.GetFileNameWithoutExtension(fileName);
    var job = new AnalysisJob
    {
        Id = Guid.NewGuid().ToString("D"), Account = request.Account, Name = label.Length > 200 ? label[..200] : label,
        FileName = fileName, ContentType = context.Request.ContentType!, Size = 0,
        Configuration = new Configuration(request.Movement, request.Tracking), SourceVideo = source, CreatedAt = DateTimeOffset.UtcNow,
        Trim = request.Trim, Stabilize = request.Stabilize,
    };
    var folder = queue.Folder(job.Id);
    var added = false;
    try
    {
        Directory.CreateDirectory(folder);
        await using (var destination = File.Create(queue.VideoPath(job)))
        {
            var buffer = new byte[65536]; long length = 0; int count;
            while ((count = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
            {
                length += count;
                if (length > JobQueue.MaxVideoBytes) return Results.StatusCode(413);
                await destination.WriteAsync(buffer.AsMemory(0, count), context.RequestAborted);
            }
            if (length == 0) return Results.BadRequest(new { detail = "Video is empty." });
            job.Size = length;
        }
        queue.Add(job); added = true;
        Console.WriteLine($"Queued: {job.Name}");
        return Results.Json(queue.View(job), json, statusCode: 201);
    }
    catch (OperationCanceledException) { return Results.StatusCode(408); }
    catch (BadHttpRequestException error) when (error.StatusCode == 413) { return Results.StatusCode(413); }
    catch (IOException error)
    {
        Console.Error.WriteLine($"Could not store a queued video: {error.Message}");
        return Results.Problem("The analyzer could not store the video. Check free disk space.", statusCode: 507);
    }
    finally
    {
        if (!added) { queue.Release(); JobQueue.TryDelete(folder); }
    }
});
app.MapGet("/jobs/{id}/video", (string id) => queue.Get(id) is { } job
    ? Results.File(queue.UploadPath(job), job.Processed is null ? job.ContentType : "video/mp4", enableRangeProcessing: true) : Results.NotFound());
app.MapGet("/jobs/{id}/result", (string id) => queue.Get(id) is { State: "done" } job && File.Exists(queue.ResultPath(job))
    ? Results.File(queue.ResultPath(job), "application/json") : Results.NotFound());
app.MapPut("/jobs/{id}/media", (string id, MediaReceipt body) =>
{
    if (queue.Get(id) is not { State: "done" } job) return Results.NotFound();
    if (body.MediaId is not { Length: > 0 and <= 100 } mediaId) return Results.BadRequest();
    queue.Update(job, item => item.MediaId = mediaId);
    return Results.NoContent();
});
app.MapPost("/jobs/{id}/retry", (string id) => queue.Get(id) is { } job && queue.Retry(job) ? Results.Json(queue.View(job), json) : Results.NotFound());
app.MapDelete("/jobs/{id}", (string id) =>
{
    if (queue.Get(id) is not { } job) return Results.NotFound();
    queue.Remove(job);
    return Results.NoContent();
});
var workerIdleSeconds = builder.Configuration.GetValue<int?>("WorkerIdleSeconds") ?? 30;
if (workerIdleSeconds is < 0 or > 300) throw new InvalidOperationException("WorkerIdleSeconds must be between 0 and 300.");
await using var analysisWorker = new PythonAnalysisSession(TimeSpan.FromSeconds(workerIdleSeconds));
app.Lifetime.ApplicationStarted.Register(() => _ = Task.Run(() => queue.RunAsync(
    async (job, cache, token) =>
    {
        var video = queue.VideoPath(job);
        var configuration = job.Configuration;
        // Preparing the clip takes the first 30 % when there is one; the analysis the rest.
        var share = job.NeedsPreprocessing ? .3 : 0;
        var lastStage = "";
        void Step(AnalysisProgress step, double from, double to)
        {
            job.Stage = step.Stage; job.Fraction = Math.Max(job.Fraction ?? 0, from + (to - from) * Math.Clamp(step.Fraction, 0, 1));
            if (step.Stage != lastStage) { lastStage = step.Stage; Console.WriteLine($"  {job.Name}: {step.Stage}…"); }
        }
        if (job.NeedsPreprocessing)
        {
            // Trim and/or stabilize first; the tracker, the result and the saved video then all use that clip.
            Directory.CreateDirectory(cache);
            var clip = await Bridge.PreprocessAsync(new PreprocessRequest(video, queue.ProcessedPath(job), root, settings,
                job.Trim?.StartSeconds ?? 0, job.Trim?.EndSeconds, configuration.Tracking.TimestampSeconds, job.Stabilize, Path.Combine(cache, "preprocess.json")), token,
                new Progress<AnalysisProgress>(step => Step(step, 0, share)));
            var shifted = Math.Max(0, configuration.Tracking.TimestampSeconds - clip.StartSeconds);
            queue.Update(job, item => item.Processed = new(clip.DurationSeconds, shifted, clip.MaxShiftPixels));
            video = queue.ProcessedPath(job);
            configuration = configuration with { Tracking = configuration.Tracking with { TimestampSeconds = shifted } };
        }
        return await Bridge.AnalyzeAsync(new Request(video, configuration, root, SettingsPath: settings, CacheDirectory: cache), Path.Combine(cache, "result.raw.json"), token,
            new Progress<AnalysisProgress>(step => Step(step, share, 1)), analysisWorker);
    },
    app.Lifetime.ApplicationStopping)));
Console.WriteLine($"Local analyzer: http://127.0.0.1:59121 | Web origin: {origin}");
Console.WriteLine($"Pairing token: {pairing}");
Console.WriteLine("Keep this window open: queued videos are analyzed here, even with the browser closed. Results are saved to Metrivum the next time it is open.");
Console.WriteLine($"Videos in the queue: {queue.List(null).Count()}");
try
{
    await app.RunAsync();
}
catch (IOException error) when (error.InnerException is System.Net.Sockets.SocketException || error.Message.Contains("address already in use", StringComparison.OrdinalIgnoreCase))
{
    // Started again (from the Start menu, the .exe or the browser link) while already running: show that copy's window.
    Console.WriteLine("The analyzer is already running; opening its window.");
    try
    {
        ConsoleWindow.AllowAnyForeground();
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:59121/window");
        request.Headers.TryAddWithoutValidation("Origin", origin);
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + pairing);
        (await client.SendAsync(request)).EnsureSuccessStatusCode();
    }
    catch (Exception failure) when (failure is HttpRequestException or TaskCanceledException)
    {
        Console.WriteLine("Another program is using port 59121. Close it and start the analyzer again.");
        await Task.Delay(TimeSpan.FromSeconds(8));
    }
}

static string LoadPairing(string file)
{
    try
    {
        if (File.Exists(file) && File.ReadAllText(file).Trim() is { Length: 64 } existing && existing.All(Uri.IsHexDigit))
            return existing;
    }
    catch (IOException) { }
    catch (UnauthorizedAccessException) { }
    var created = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    File.WriteAllText(file, created);
    return created;
}

public sealed record MediaReceipt(string? MediaId);
