using Metrivum.BuildingBlocks;
using Metrivum.Notifications.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Metrivum.VideoAnalysis.Infrastructure;

namespace Metrivum.VideoAnalysis;

/// <summary>Creates and manages durable video-analysis jobs and their PostgreSQL queue state.</summary>
public sealed class AnalysisQueue(VideoAnalysisDbContext db, IOptions<AnalysisOptions> configured, ModuleTransaction? transaction = null,
    INotificationPublisher? notifications = null, CloudAnalysisBudget? cloudBudget = null)
{
    private readonly AnalysisOptions options = configured.Value;

    public async Task<AnalysisJob?> ClaimAsync(CancellationToken ct)
    {
        return await InTransaction(async () =>
        {
        var exhausted = await db.Jobs.FromSqlInterpolated($"""
            UPDATE video_analysis.jobs SET "Status"='Failed', "FailureCode"='WORKER_ATTEMPTS_EXHAUSTED',
                "LeaseToken"=NULL, "LeaseExpiresAt"=NULL, "CompletedAt"=clock_timestamp(), "Version"="Version"+1
            WHERE (("Status"='Processing' AND "LeaseExpiresAt" < clock_timestamp()) OR "Status"='Queued') AND "Attempts" >= {options.MaxAttempts}
            RETURNING *
            """).AsNoTracking().ToListAsync(ct);
        if (cloudBudget != null)
            foreach (var expired in exhausted)
                await cloudBudget.ReleaseAsync(expired.OwnerId, expired.CloudBudgetOperation, ct);
        var token = Guid.NewGuid();
        var jobs = await db.Jobs.FromSqlInterpolated($"""
            WITH candidate AS (
                SELECT "Id" FROM video_analysis.jobs
                WHERE (("Status"='Queued' AND "AvailableAt" <= clock_timestamp())
                    OR ("Status"='Processing' AND "LeaseExpiresAt" < clock_timestamp())) AND "Attempts" < {options.MaxAttempts}
                ORDER BY "AvailableAt", "CreatedAt", "Id" FOR UPDATE SKIP LOCKED LIMIT 1
            )
            UPDATE video_analysis.jobs AS job SET "Status"='Processing', "Attempts"=job."Attempts"+1,
                "LeaseToken"={token}, "LeaseExpiresAt"=clock_timestamp()+make_interval(secs => {options.LeaseSeconds}), "Version"=job."Version"+1
            FROM candidate WHERE job."Id"=candidate."Id" RETURNING job.*
            """).AsNoTracking().ToListAsync(ct);
        var job = jobs.SingleOrDefault();
        if (job != null && cloudBudget != null)
        {
            // A new lease transfers the old hold atomically. Lost workers cannot settle this lease's budget.
            await cloudBudget.ReleaseAsync(job.OwnerId, job.CloudBudgetOperation, ct);
            var operation = job.Id + ":" + token;
            var seconds = job.CloudBudgetSeconds ?? Math.Min(options.MaxRunSeconds, 3600);
            try { await cloudBudget.ReserveAsync(job.OwnerId, job.TeamId, operation, seconds, ct); }
            catch (ApiException error) when (error.Status is 403 or 404 or 409)
            {
                await db.Jobs.Where(x => x.Id == job.Id && x.LeaseToken == token).ExecuteUpdateAsync(update => update
                    .SetProperty(x => x.Status, "Failed").SetProperty(x => x.FailureCode, "CLOUD_BUDGET_UNAVAILABLE")
                    .SetProperty(x => x.CompletedAt, DateTimeOffset.UtcNow).SetProperty(x => x.LeaseToken, (Guid?)null)
                    .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null), ct);
                return null;
            }
            await db.Jobs.Where(x => x.Id == job.Id && x.LeaseToken == token).ExecuteUpdateAsync(update => update
                .SetProperty(x => x.CloudBudgetOperation, operation).SetProperty(x => x.CloudBudgetSeconds, (long?)seconds), ct);
            job.CloudBudgetOperation = operation;
            job.CloudBudgetSeconds = seconds;
        }
        return job;
        }, ct);
    }

    public async Task<bool> HeartbeatAsync(Guid id, Guid token, CancellationToken ct) => await db.Database.ExecuteSqlInterpolatedAsync($"""
        UPDATE video_analysis.jobs SET "LeaseExpiresAt"=clock_timestamp()+make_interval(secs => {options.LeaseSeconds})
        WHERE "Id"={id} AND "Status"='Processing' AND "LeaseToken"={token} AND "LeaseExpiresAt">clock_timestamp()
        """, ct) == 1;

    public async Task<bool> CompleteAsync(Guid id, Guid token, AnalysisResult result, CancellationToken ct, long? gpuSeconds = null)
    {
        AnalysisResults.Validate(result, options);
        var json = JsonSerializer.Serialize(result, AnalysisResults.Json);
        async Task<bool> Complete(CancellationToken tokenCt)
        {
            var completed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE video_analysis.jobs SET "Status"='Completed', "Result"=CAST({json} AS jsonb), "FailureCode"=NULL,
                "CompletedAt"=clock_timestamp(), "LeaseToken"=NULL, "LeaseExpiresAt"=NULL, "Version"="Version"+1
            WHERE "Id"={id} AND "Status"='Processing' AND "LeaseToken"={token} AND "LeaseExpiresAt">clock_timestamp()
            """, tokenCt) == 1;
            if (completed && cloudBudget != null)
            {
                var budget = await db.Jobs.AsNoTracking().Where(x => x.Id == id)
                    .Select(x => new { x.OwnerId, x.CloudBudgetOperation, x.CloudBudgetSeconds }).SingleAsync(tokenCt);
                if (gpuSeconds == null || budget.CloudBudgetOperation == null || budget.CloudBudgetSeconds == null)
                    throw new ApiException(422, "GPU_METER_INVALID", "A completed cloud result needs trusted measured GPU usage.");
                await cloudBudget.SettleAsync(budget.OwnerId, budget.CloudBudgetOperation, gpuSeconds.Value, budget.CloudBudgetSeconds.Value, id, tokenCt);
            }
            if (completed && notifications != null)
            {
                var owner = await db.Jobs.AsNoTracking().Where(x => x.Id == id).Select(x => x.OwnerId).SingleAsync(tokenCt);
                await notifications.PublishAsync(new(owner, "analysis:" + id + ":completed", "VideoAnalysisCompleted", "System", "VideoAnalysis", id, "/app/video-analyses/" + id), tokenCt);
            }
            return completed;
        }
        return await InTransaction(() => Complete(ct), ct);
    }

    public async Task<bool> FailAsync(Guid id, Guid token, string failureCode, bool retryable, CancellationToken ct)
    {
        // Store only a server-selected machine code; never persist provider exceptions or signed URLs.
        return await InTransaction(async () =>
        {
        var failed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE video_analysis.jobs SET
                "Status"=CASE WHEN {retryable} AND "Attempts" < {options.MaxAttempts} THEN 'Queued' ELSE 'Failed' END,
                "AvailableAt"=clock_timestamp()+make_interval(secs => LEAST(300, 10 * "Attempts")),
                "CompletedAt"=CASE WHEN {retryable} AND "Attempts" < {options.MaxAttempts} THEN NULL ELSE clock_timestamp() END,
                "FailureCode"={failureCode}, "LeaseToken"=NULL, "LeaseExpiresAt"=NULL, "Version"="Version"+1
            WHERE "Id"={id} AND "Status"='Processing' AND "LeaseToken"={token} AND "LeaseExpiresAt">clock_timestamp()
            """, ct) == 1;
        if (failed && cloudBudget != null)
        {
            var job = await db.Jobs.AsNoTracking().Where(x => x.Id == id).Select(x => new { x.OwnerId, x.CloudBudgetOperation }).SingleAsync(ct);
            await cloudBudget.ReleaseAsync(job.OwnerId, job.CloudBudgetOperation, ct);
        }
        return failed;
        }, ct);
    }

    private Task<T> InTransaction<T>(Func<Task<T>> action, CancellationToken ct)
    {
        if (cloudBudget != null && transaction == null)
            throw new InvalidOperationException("Cloud budget writes require a shared ModuleTransaction.");
        return transaction == null ? action() : transaction.RunAsync(_ => action(), ct);
    }
}
