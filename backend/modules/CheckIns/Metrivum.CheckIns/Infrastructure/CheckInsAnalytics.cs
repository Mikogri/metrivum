using Microsoft.EntityFrameworkCore;
using Metrivum.Analytics.Contracts;

namespace Metrivum.CheckIns.Infrastructure;

/// <summary>Reads and aggregates check ins analytics information for authorized CheckIns reporting and quota contracts.</summary>
public sealed class CheckInsAnalytics(CheckInsDbContext db) : ICheckInsAnalytics
{
    public async Task<CheckInsAnalysis> QueryAsync(AnalysisScope s, CancellationToken ct)
    {
        var cutoff = s.Window.End < DateTimeOffset.UtcNow ? s.Window.End : DateTimeOffset.UtcNow;
        var ids = s.RelationshipIds ?? [];
        var all = s.RelationshipIds is null;
        var team = s.TeamId != null;
        if (team && all)
            throw new InvalidOperationException("Team analytics requires resolved relationship scope.");
        var rows = await db
            .Database.SqlQuery<CheckInAggregateRow>(
                $"""
                SELECT ("AvailableAtUtc" AT TIME ZONE {s.Window.TimeZone})::date AS "Date",count(*)::int AS "Issued",
                count(*) filter(where "SubmittedAt"<{cutoff})::int AS "Submitted",count(*) filter(where "DueAtUtc"<{cutoff} AND ("SubmittedAt" IS NULL OR "SubmittedAt">={cutoff}))::int AS "Overdue",
                count(*) filter(where "SubmittedAt"<{cutoff} AND ("ReviewedAt" IS NULL OR "ReviewedAt">={cutoff}))::int AS "PendingReview",
                sum(extract(epoch from ("ReviewedAt"-"SubmittedAt"))/3600) filter(where "ReviewedAt"<{cutoff})::double precision AS "ReviewHours",count(*) filter(where "ReviewedAt"<{cutoff})::int AS "Reviewed"
                FROM checkins."Requests" WHERE ({team} OR ("CoachId"={s.CoachId} AND "WorkspaceId"={s.WorkspaceId})) AND "AvailableAtUtc">={s.Window.Start} AND "AvailableAtUtc"<{cutoff} AND ("CancelledAt" IS NULL OR "CancelledAt">={cutoff}) AND ({all} OR "RelationshipId"=ANY({ids})) GROUP BY 1 ORDER BY 1
                """
            )
            .ToArrayAsync(ct);
        var issued = rows.Sum(x => x.Issued);
        var submitted = rows.Sum(x => x.Submitted);
        var reviewed = rows.Sum(x => x.Reviewed);
        return new(
            issued,
            submitted,
            rows.Sum(x => x.Overdue),
            rows.Sum(x => x.PendingReview),
            MetricMath.Percent(submitted, issued),
            reviewed == 0 ? null : rows.Sum(x => x.ReviewHours ?? 0) / reviewed,
            AnalysisBuckets.CheckIns(
                rows.Select(x => new CheckInPoint(x.Date, x.Issued, x.Submitted, x.Overdue)),
                s.Grouping
            )
        );
    }
}

/// <summary>Carries check in aggregate row fields for CheckIns filtering or query projection; has no independent database writes.</summary>
public sealed class CheckInAggregateRow
{
    public DateOnly Date
    {
        get; set;
    }
    public int Issued
    {
        get; set;
    }
    public int Submitted
    {
        get; set;
    }
    public int Overdue
    {
        get; set;
    }
    public int PendingReview
    {
        get; set;
    }
    public double? ReviewHours
    {
        get; set;
    }
    public int Reviewed
    {
        get; set;
    }
}
