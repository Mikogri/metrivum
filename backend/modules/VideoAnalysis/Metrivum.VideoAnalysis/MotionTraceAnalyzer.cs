using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;

namespace Metrivum.VideoAnalysis;

/// <summary>Contains the configured motion trace settings and bounds for VideoAnalysis; does not itself access the database.</summary>
public sealed class MotionTraceOptions
{
    public bool Enabled
    {
        get; set;
    }
    public string BridgePath { get; set; } = "";
    public string MotionTraceRoot { get; set; } = "";
    public string? SettingsPath
    {
        get; set;
    }
    public string DotnetExecutable { get; set; } = "dotnet";
    public string WorkDirectory { get; set; } = Path.Combine(Path.GetTempPath(), "Metrivum.MotionTrace");
}

/// <summary>Invokes the configured MotionTrace analysis process and translates its result; model work runs outside HTTP request handling.</summary>
public sealed class MotionTraceAnalyzer(IOptions<MotionTraceOptions> configured, IOptions<AnalysisOptions> limits,
    IConfiguration configuration, ILogger<MotionTraceAnalyzer> logger) : IVideoAnalyzer
{
    private readonly MotionTraceOptions options = configured.Value;
    private readonly AnalysisOptions analysis = limits.Value;
    private readonly long maxVideoBytes = configuration.GetValue<long?>("Storage:MaxVideoBytes") ?? 268435456;

    public bool IsConfigured => options.Enabled && Path.IsPathFullyQualified(options.BridgePath) && File.Exists(options.BridgePath)
        && Path.IsPathFullyQualified(options.MotionTraceRoot) && Directory.Exists(options.MotionTraceRoot)
        && Path.IsPathFullyQualified(options.WorkDirectory) && !string.IsNullOrWhiteSpace(options.DotnetExecutable)
        && (string.IsNullOrEmpty(options.SettingsPath) || Path.IsPathFullyQualified(options.SettingsPath) && File.Exists(options.SettingsPath));

    public void ValidateConfiguration(AnalysisConfiguration configuration)
    {
        if (configuration.Tracking == null || configuration.MetersPerPixel != null)
            throw ApiException.Invalid("MotionTrace requires two tracking points and pixel units without metric calibration.");
    }

    public async Task<AnalysisResult> AnalyzeAsync(Stream source, AnalysisConfiguration configuration, CancellationToken ct)
    {
        if (!IsConfigured)
            throw new ApiException(503, "ANALYZER_NOT_CONFIGURED", "No video analysis engine is configured.");
        ValidateConfiguration(configuration);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(analysis.MaxRunSeconds));
        var token = timeout.Token;
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(options.WorkDirectory));
        var jobId = Guid.NewGuid().ToString("N");
        var job = Path.Combine(root, jobId);
        try
        {
            Directory.CreateDirectory(job);
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(job, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            var video = Path.Combine(job, "source.mp4");
            await using (var destination = new FileStream(video, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
            {
                var buffer = new byte[65536];
                long total = 0;
                int read;
                while ((read = await source.ReadAsync(buffer, token)) != 0)
                {
                    total += read;
                    if (total > maxVideoBytes)
                        throw new ApiException(422, "MEDIA_SIZE_INVALID", "The video exceeds the configured size limit.");
                    await destination.WriteAsync(buffer.AsMemory(0, read), token);
                }
                if (total == 0)
                    throw new ApiException(422, "MEDIA_SIZE_INVALID", "The video is empty.");
            }
            var request = Path.Combine(job, "request.json");
            var output = Path.Combine(job, "result.json");
            await File.WriteAllTextAsync(request, JsonSerializer.Serialize(new
            {
                videoPath = video,
                configuration,
                cacheDirectory = job,
                timeoutSeconds = analysis.MaxRunSeconds,
                motionTraceRoot = options.MotionTraceRoot,
                settingsPath = options.SettingsPath
            }, AnalysisResults.Json), token);
            var start = new ProcessStartInfo(options.DotnetExecutable)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = job
            };
            // Decoders do not need application credentials. This limits inheritance, not OS/file/network access.
            string[] allowedEnvironment = ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE",
                "APPDATA", "LOCALAPPDATA", "XDG_CACHE_HOME", "DOTNET_ROOT", "DOTNET_ROOT_X64", "DOTNET_ROOT_ARM64",
                "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "CUDA_PATH", "CUDA_HOME", "CUDA_VISIBLE_DEVICES",
                "NVIDIA_VISIBLE_DEVICES", "NVIDIA_DRIVER_CAPABILITIES", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
                "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS", "LANG", "LC_ALL"];
            var environment = start.Environment.Where(pair => allowedEnvironment.Contains(pair.Key, StringComparer.OrdinalIgnoreCase)).ToArray();
            start.Environment.Clear();
            foreach (var pair in environment) start.Environment[pair.Key] = pair.Value;
            foreach (var argument in new[] { options.BridgePath, "--request", request, "--output", output })
                start.ArgumentList.Add(argument);
            using var process = new Process { StartInfo = start };
            process.Start();
            // Drain without retaining private engine output or allowing unbounded memory growth.
            var stdout = DrainAsync(process.StandardOutput);
            var stderr = DrainAsync(process.StandardError);
            try
            {
                await process.WaitForExitAsync(token);
            }
            finally
            {
                if (!process.HasExited)
                {
                    try
                    {
                        process.Kill(entireProcessTree: true);
                    }
                    catch (InvalidOperationException) when (process.HasExited) { }
                    await process.WaitForExitAsync(CancellationToken.None);
                }
                // Cancellation must not abandon pipe readers while the terminated process still holds handles.
                try { await Task.WhenAll(stdout, stderr).WaitAsync(TimeSpan.FromSeconds(2)); }
                catch (TimeoutException) when (token.IsCancellationRequested) { }
            }
            token.ThrowIfCancellationRequested();
            if (process.ExitCode != 0)
            {
                logger.LogWarning("MotionTrace job {JobId} exited with code {ExitCode}", jobId, process.ExitCode);
                throw ExecutionFailed();
            }
            if (!File.Exists(output) || new FileInfo(output).Length > analysis.MaxResultBytes)
                throw InvalidResult();
            // Read at most the configured bound even if the file is replaced or grows after the length check.
            await using var resultFile = new FileStream(output, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var bytes = new MemoryStream();
            var resultBuffer = new byte[8192];
            int count;
            while ((count = await resultFile.ReadAsync(resultBuffer, token)) != 0)
            {
                if (bytes.Length + count > analysis.MaxResultBytes)
                    throw InvalidResult();
                bytes.Write(resultBuffer, 0, count);
            }
            var result = JsonSerializer.Deserialize<AnalysisResult>(bytes.GetBuffer().AsSpan(0, (int)bytes.Length), AnalysisResults.Json)
                ?? throw InvalidResult();
            AnalysisResults.Validate(result, analysis);
            return result;
        }
        catch (JsonException) { throw InvalidResult(); }
        catch (ApiException) { throw; }
        catch (OperationCanceledException) { throw; }
        catch (Exception error)
        {
            logger.LogWarning("MotionTrace job {JobId} failed with {ErrorType}", jobId, error.GetType().Name);
            throw ExecutionFailed();
        }
        finally
        {
            // Only this invocation's generated direct child may be removed.
            if (Path.GetDirectoryName(Path.GetFullPath(job)) == root && Path.GetFileName(job) == jobId)
            {
                for (var attempt = 0; attempt < 6; attempt++)
                {
                    try
                    {
                        if (Directory.Exists(job)) Directory.Delete(job, recursive: true);
                        break;
                    }
                    catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                    {
                        // Windows can retain a killed child's file handles briefly after its parent exits.
                        if (attempt == 5)
                            logger.LogWarning("MotionTrace job {JobId} cleanup failed with {ErrorType}", jobId, error.GetType().Name);
                        else await Task.Delay(100, CancellationToken.None);
                    }
                }
            }
        }
    }

    private static async Task DrainAsync(StreamReader reader)
    {
        var buffer = new char[4096];
        while (await reader.ReadAsync(buffer) != 0)
        {
        }
    }

    private static ApiException ExecutionFailed() => new(503, "ANALYSIS_EXECUTION_FAILED", "The analysis engine could not complete the video.");
    private static ApiException InvalidResult() => new(422, "ANALYSIS_RESULT_INVALID", "The analyzer returned an invalid or oversized result.");
}
