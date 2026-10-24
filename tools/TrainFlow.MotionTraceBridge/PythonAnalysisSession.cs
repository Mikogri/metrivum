using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace TrainFlow.MotionTraceBridge;

/// <summary>One sequential, private stdin/stdout worker. Failures and idle time release the entire CUDA process.</summary>
public sealed class PythonAnalysisSession(TimeSpan? idleTimeout = null) : IAsyncDisposable
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly TimeSpan timeout = idleTimeout ?? TimeSpan.FromSeconds(30);
    private Process? worker;
    private Task<string>? errors;
    private string? identity;
    private Timer? idle;
    private long generation;
    private bool disposed;

    public async Task RunAsync(string executable, string script, IReadOnlyList<string> arguments, string directory,
        CancellationToken cancellation, Action<string>? progress = null)
    {
        await gate.WaitAsync(cancellation);
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            idle?.Dispose(); idle = null;
            generation++;
            var key = JsonSerializer.Serialize(new[] { executable, script, directory });
            if (worker is not null && (worker.HasExited || identity != key)) await StopAsync();
            if (worker is null)
            {
                var start = new ProcessStartInfo(executable) {
                    WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                    StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                start.ArgumentList.Add("-u"); start.ArgumentList.Add(script); start.ArgumentList.Add("--worker");
                var python = Path.GetDirectoryName(executable)!;
                start.Environment["PATH"] = python + Path.PathSeparator + Path.Combine(python, "Library", "bin") + Path.PathSeparator + start.Environment["PATH"];
                start.Environment["PYTHONIOENCODING"] = "utf-8";
                start.Environment["PYTHONFAULTHANDLER"] = "1";
                start.Environment["HF_HUB_OFFLINE"] = "1"; start.Environment["TRANSFORMERS_OFFLINE"] = "1";
                worker = Process.Start(start) ?? throw new InvalidOperationException("Could not start the analysis worker.");
                identity = key;
                errors = ReadErrorsAsync(worker.StandardError);
            }
            var request = Guid.NewGuid().ToString("N");
            await worker.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { request, arguments }).AsMemory(), cancellation);
            await worker.StandardInput.FlushAsync(cancellation);
            while (await worker.StandardOutput.ReadLineAsync(cancellation) is { } line)
            {
                if (line.StartsWith('{'))
                {
                    try
                    {
                        using var document = JsonDocument.Parse(line);
                        var value = document.RootElement;
                        if (value.TryGetProperty("workerRequest", out var id) && id.GetString() == request)
                        {
                            if (!value.GetProperty("ok").GetBoolean())
                                throw new InvalidOperationException("The analysis worker rejected the session.");
                            var expected = generation;
                            idle = new Timer(_ => _ = ReleaseIdleAsync(expected), null, timeout, Timeout.InfiniteTimeSpan);
                            return;
                        }
                    }
                    catch (JsonException) { /* Model diagnostics are not protocol receipts. */ }
                }
                try { progress?.Invoke(line); }
                catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException) { }
            }
            throw new InvalidOperationException("The analysis worker exited before completing the session.");
        }
        catch
        {
            await StopAsync(failed: true);
            throw;
        }
        finally { gate.Release(); }
    }

    private async Task ReleaseIdleAsync(long expected)
    {
        await gate.WaitAsync();
        try { if (!disposed && generation == expected) await StopAsync(); }
        catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException)
        { Console.Error.WriteLine("Could not release an idle analysis worker."); }
        finally { gate.Release(); }
    }

    private async Task StopAsync(bool failed = false)
    {
        idle?.Dispose(); idle = null;
        if (worker is null) return;
        try
        {
            if (!worker.HasExited) worker.Kill(entireProcessTree: true);
            await worker.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            if (errors is not null)
            {
                var tail = await errors.WaitAsync(TimeSpan.FromSeconds(5));
                if (failed && tail.Length > 0) Console.Error.WriteLine(tail);
            }
        }
        finally { worker.Dispose(); worker = null; errors = null; identity = null; }
    }

    private static async Task<string> ReadErrorsAsync(StreamReader reader)
    {
        var tail = new StringBuilder();
        while (await reader.ReadLineAsync() is { } line)
        {
            tail.AppendLine(line);
            if (tail.Length > 32768) tail.Remove(0, tail.Length - 32768);
        }
        return tail.ToString();
    }

    public async ValueTask DisposeAsync()
    {
        await gate.WaitAsync();
        try { disposed = true; generation++; await StopAsync(); }
        finally { gate.Release(); }
    }
}
