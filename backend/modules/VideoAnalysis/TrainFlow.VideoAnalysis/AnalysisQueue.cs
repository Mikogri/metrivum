using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public sealed class AnalysisQueue(VideoAnalysisDbContext db, IOptions<AnalysisOptions> configured, ModuleTransaction? transaction = null, INotificationPublisher? notifications = null)
{
    private readonly AnalysisOptions options = configured.Value;

    public async Task<AnalysisJob?> ClaimAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE video_analysis.jobs SET "Status"='Failed', "FailureCode"='WORKER_ATTEMPTS_EXHAUSTED',
                "LeaseToken"=NULL, "LeaseExpiresAt"=NULL, "CompletedAt"=clock_timestamp(), "Version"="Version"+1
            WHERE (("Status"='Processing' AND "LeaseExpiresAt" < clock_timestamp()) OR "Status"='Queued') AND "Attempts" >= {options.MaxAttempts}
            """, ct);
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
        return jobs.SingleOrDefault();
    }

    public async Task<bool> HeartbeatAsync(Guid id, Guid token, CancellationToken ct) => await db.Database.ExecuteSqlInterpolatedAsync($"""
        UPDATE video_analysis.jobs SET "LeaseExpiresAt"=clock_timestamp()+make_interval(secs => {options.LeaseSeconds})
        WHERE "Id"={id} AND "Status"='Processing' AND "LeaseToken"={token} AND "LeaseExpiresAt">clock_timestamp()
        """, ct) == 1;

    public async Task<bool> CompleteAsync(Guid id, Guid token, AnalysisResult result, CancellationToken ct)
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
            if (completed && notifications != null)
            {
                var owner = await db.Jobs.AsNoTracking().Where(x => x.Id == id).Select(x => x.OwnerId).SingleAsync(tokenCt);
                await notifications.PublishAsync(new(owner, "analysis:" + id + ":completed", "VideoAnalysisCompleted", "System", "VideoAnalysis", id, "/app/video-analyses/" + id), tokenCt);
            }
            return completed;
        }
        return transaction == null ? await Complete(ct) : await transaction.RunAsync(Complete, ct);
    }

    public async Task<bool> FailAsync(Guid id, Guid token, string failureCode, bool retryable, CancellationToken ct)
    {
        // Store only a server-selected machine code; never persist provider exceptions or signed URLs.
        return await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE video_analysis.jobs SET
                "Status"=CASE WHEN {retryable} AND "Attempts" < {options.MaxAttempts} THEN 'Queued' ELSE 'Failed' END,
                "AvailableAt"=clock_timestamp()+make_interval(secs => LEAST(300, 10 * "Attempts")),
                "CompletedAt"=CASE WHEN {retryable} AND "Attempts" < {options.MaxAttempts} THEN NULL ELSE clock_timestamp() END,
                "FailureCode"={failureCode}, "LeaseToken"=NULL, "LeaseExpiresAt"=NULL, "Version"="Version"+1
            WHERE "Id"={id} AND "Status"='Processing' AND "LeaseToken"={token} AND "LeaseExpiresAt">clock_timestamp()
            """, ct) == 1;
    }
}
