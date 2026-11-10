using System.Diagnostics.Metrics;
using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.Media.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Metrivum.VideoAnalysis;

/// <summary>Claims queued analysis jobs and persists processing outcomes through the video-analysis pipeline.</summary>
public sealed class AnalysisWorkerRunner(
    IServiceScopeFactory scopes,
    IOptions<AnalysisOptions> configured,
    ILogger<AnalysisWorkerRunner> logger
)
{
    private readonly AnalysisOptions options = configured.Value;
    private static readonly Meter Meter = new("Metrivum.VideoAnalysis", "1.0");
    private static readonly Counter<long> Completed = Meter.CreateCounter<long>(
        "trainflow.analysis.completed"
    );
    private static readonly Counter<long> Failed = Meter.CreateCounter<long>(
        "trainflow.analysis.failed"
    );
    private static readonly Counter<long> LeaseLost = Meter.CreateCounter<long>(
        "trainflow.analysis.lease_lost"
    );

    public async Task<bool> RunOnceAsync(CancellationToken stoppingToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        if (scope.ServiceProvider.GetService<ICloudGpuMeter>() is not { IsConfigured: true } meter)
            return false;
        var queue = scope.ServiceProvider.GetRequiredService<AnalysisQueue>();
        var job = await queue.ClaimAsync(stoppingToken);
        if (job == null)
            return false;
        using var run = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        run.CancelAfter(
            TimeSpan.FromSeconds(Math.Min(options.MaxRunSeconds, job.CloudBudgetSeconds ?? 3600))
        );
        using var heartbeatStop = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var heartbeat = HeartbeatAsync(job.Id, job.LeaseToken!.Value, run, heartbeatStop.Token);
        try
        {
            var analyzer = scope.ServiceProvider.GetRequiredService<IVideoAnalyzer>();
            if (!analyzer.IsConfigured)
                throw new ApiException(
                    503,
                    "ANALYZER_NOT_CONFIGURED",
                    "No video analysis engine is configured."
                );
            var media = scope.ServiceProvider.GetRequiredService<IMediaLibrary>();
            await using var source = await media.OpenReadAsync(
                job.MediaId
                    ?? throw new ApiException(
                        422,
                        "ANALYSIS_RESULT_INVALID",
                        "Server analysis requires source media."
                    ),
                job.OwnerId,
                run.Token
            );
            var config = JsonSerializer.Deserialize<AnalysisConfiguration>(
                job.Configuration,
                AnalysisResults.Json
            )!;
            var metadata = await media.RequireReadyAsync(job.MediaId.Value, job.OwnerId, run.Token);
            CloudAnalysisBudget.ValidateVideo(
                metadata.Size,
                await meter.InspectVideoAsync(source, run.Token)
            );
            // The probe may consume a non-seekable stream. Reopen the pinned object for execution.
            await using var executionSource = await media.OpenReadAsync(
                job.MediaId.Value,
                job.OwnerId,
                run.Token
            );
            var measured = await meter.ExecuteAsync(
                executionSource,
                config,
                job.CloudBudgetSeconds
                    ?? throw new ApiException(
                        422,
                        "GPU_METER_INVALID",
                        "The cloud job has no authorized budget."
                    ),
                run.Token
            );
            var result = measured.Result;
            run.Token.ThrowIfCancellationRequested();
            if (
                result.PositionUnit == "m"
                && (config.MetersPerPixel == null || result.MetersPerPixel != config.MetersPerPixel)
            )
                throw new ApiException(
                    422,
                    "ANALYSIS_RESULT_INVALID",
                    "Metric result does not match source calibration."
                );
            if (
                await queue.CompleteAsync(
                    job.Id,
                    job.LeaseToken.Value,
                    result,
                    run.Token,
                    measured.GpuSeconds
                )
            )
            {
                Completed.Add(1);
                logger.LogInformation(
                    "Analysis {JobId} completed on attempt {Attempt}",
                    job.Id,
                    job.Attempts
                );
            }
            else
                LeaseLost.Add(1);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            await queue.FailAsync(
                job.Id,
                job.LeaseToken.Value,
                "WORKER_STOPPED",
                true,
                CancellationToken.None
            );
        }
        catch (OperationCanceledException)
        {
            // A cancellation or lost lease prevents the fenced failure write as well as completion.
            await queue.FailAsync(
                job.Id,
                job.LeaseToken.Value,
                "ANALYSIS_TIMEOUT",
                true,
                stoppingToken
            );
        }
        catch (Exception error)
        {
            var code =
                error is ApiException api
                && api.Code
                    is "ANALYZER_NOT_CONFIGURED"
                        or "ANALYSIS_RESULT_INVALID"
                        or "MEDIA_OBJECT_MISSING"
                        or "MEDIA_FORMAT_INVALID"
                        or "MEDIA_SIZE_INVALID"
                        or "MEDIA_DURATION_INVALID"
                        or "GPU_METER_INVALID"
                    ? ((ApiException)error).Code
                    : "ANALYSIS_EXECUTION_FAILED";
            var retryable = code == "ANALYSIS_EXECUTION_FAILED";
            if (await queue.FailAsync(job.Id, job.LeaseToken.Value, code, retryable, stoppingToken))
                Failed.Add(1);
            logger.LogWarning(
                "Analysis {JobId} failed with {FailureCode} on attempt {Attempt}",
                job.Id,
                code,
                job.Attempts
            );
        }
        finally
        {
            await heartbeatStop.CancelAsync();
            try
            {
                await heartbeat;
            }
            catch (OperationCanceledException) when (heartbeatStop.IsCancellationRequested) { }
        }
        return true;
    }

    private async Task HeartbeatAsync(
        Guid id,
        Guid token,
        CancellationTokenSource run,
        CancellationToken stop
    )
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.HeartbeatSeconds));
        try
        {
            while (await timer.WaitForNextTickAsync(stop))
            {
                await using var scope = scopes.CreateAsyncScope();
                if (
                    !await scope
                        .ServiceProvider.GetRequiredService<AnalysisQueue>()
                        .HeartbeatAsync(id, token, stop)
                )
                {
                    LeaseLost.Add(1);
                    await run.CancelAsync();
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        catch (Exception)
        {
            // Treat database uncertainty as loss of ownership; stale work must never keep computing unchecked.
            LeaseLost.Add(1);
            await run.CancelAsync();
        }
    }
}
