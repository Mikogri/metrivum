using Microsoft.EntityFrameworkCore;
using Metrivum.Analytics.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;

namespace Metrivum.Coaching.Infrastructure;

/// <summary>Reads and aggregates coaching analytics information for authorized Coaching reporting and quota contracts.</summary>
public sealed class CoachingAnalytics(CoachingDbContext db) : ICoachingAnalytics
{
    public async Task<Guid[]> ResolveTeamRelationshipsAsync(Guid teamId, Guid? memberId, Guid? groupId, Guid? offerRevisionId, CancellationToken ct)
    {
        if (groupId != null && !await db.Groups.AnyAsync(x => x.Id == groupId && x.TeamId == teamId && (memberId == null || x.CoachId == memberId), ct))
            throw ApiException.NotFound();
        if (offerRevisionId != null && !await db.Applications.AnyAsync(x => x.TeamId == teamId && x.OfferRevisionId == offerRevisionId, ct))
            throw ApiException.NotFound();
        var query = db.Relationships.Where(x => x.TeamId == teamId && (memberId == null || x.CoachId == memberId));
        if (groupId != null)
            query = query.Where(x => db.Memberships.Any(m => m.GroupId == groupId && m.RelationshipId == x.Id));
        if (offerRevisionId != null)
            query = query.Where(x => db.Services.Any(s => s.RelationshipId == x.Id && s.TeamId == teamId && s.OfferRevisionId == offerRevisionId));
        return await query.Select(x => x.Id).ToArrayAsync(ct);
    }
    public async Task<AnalysisOptions> TeamOptionsAsync(Guid teamId, Guid? memberId, CancellationToken ct)
    {
        var offers = await db.Applications.Where(x => x.TeamId == teamId && (memberId == null || x.CoachId == memberId))
            .GroupBy(x => new { x.OfferRevisionId, x.OfferName }).Select(g => new OfferChoice(g.Key.OfferRevisionId, g.Key.OfferName)).Take(200).ToArrayAsync(ct);
        var groups = await db.Groups.Where(x => x.TeamId == teamId && !x.Archived && (memberId == null || x.CoachId == memberId))
            .Select(x => new GroupAnalysis(x.Id, x.Name, db.Memberships.Where(m => m.GroupId == x.Id).Join(db.Relationships, m => m.RelationshipId, r => r.Id, (m, r) => r.ClientId).Distinct().Count())).Take(200).ToArrayAsync(ct);
        return new(groups, offers);
    }

    private async Task<ClientsAnalysis> TeamClientsAsync(AnalysisScope s, CancellationToken ct)
    {
        var teamId = s.TeamId!.Value;
        var memberId = s.MemberId ?? Guid.Empty;
        var allMembers = s.MemberId == null;
        var ids = s.RelationshipIds ?? [];
        var unfiltered = s.RelationshipIds == null;
        var series = await db.Database.SqlQuery<ClientSeriesRow>($"""
            WITH raw_intervals AS MATERIALIZED (
                SELECT c."Id", c."ClientId", c."CreatedAt" AS since, c."EndedAt" AS until
                FROM coaching."TeamClientCases" c WHERE c."TeamId"={teamId} AND {allMembers}
                    AND ({unfiltered} OR EXISTS (SELECT 1 FROM coaching."Relationships" r WHERE r."TeamClientCaseId"=c."Id" AND r."Id"=ANY({ids})))
                UNION ALL
                SELECT c."Id",c."ClientId",a."StartedAt",least(c."EndedAt",a."EndedAt")
                FROM coaching."TeamClientCases" c JOIN coaching."TeamCoachAssignments" a ON a."TeamClientCaseId"=c."Id"
                WHERE c."TeamId"={teamId} AND NOT {allMembers} AND a."CoachId"={memberId}
                    AND ({unfiltered} OR EXISTS (SELECT 1 FROM coaching."Relationships" r WHERE r."TeamClientCaseId"=c."Id" AND r."Id"=ANY({ids})))
            ), intervals AS (SELECT *, row_number() OVER (PARTITION BY "ClientId" ORDER BY since) AS occurrence FROM raw_intervals), days AS (SELECT generate_series({s.Window.From}::date,{s.Window.To}::date,'1 day')::date AS day)
            SELECT d.day AS "Date",
                count(distinct i."ClientId") FILTER (WHERE i.since < ((d.day+1)::timestamp AT TIME ZONE {s.Window.TimeZone}) AND (i.until IS NULL OR i.until >= ((d.day+1)::timestamp AT TIME ZONE {s.Window.TimeZone})))::int AS "Active",
                count(distinct i."ClientId") FILTER (WHERE i.occurrence=1 AND (i.since AT TIME ZONE {s.Window.TimeZone})::date=d.day)::int AS "NewClients",
                count(distinct i."ClientId") FILTER (WHERE i.occurrence>1 AND (i.since AT TIME ZONE {s.Window.TimeZone})::date=d.day)::int AS "Reactivated",
                count(distinct i."ClientId") FILTER (WHERE (i.until AT TIME ZONE {s.Window.TimeZone})::date=d.day)::int AS "Departed"
            FROM days d LEFT JOIN intervals i ON true GROUP BY d.day ORDER BY d.day
            """).ToArrayAsync(ct);
        var summary = await db.Database.SqlQuery<ClientSummaryRow>($"""
            WITH raw_intervals AS MATERIALIZED (
                SELECT c."Id", c."ClientId", c."CreatedAt" AS since,c."EndedAt" AS until
                FROM coaching."TeamClientCases" c WHERE c."TeamId"={teamId} AND {allMembers}
                    AND ({unfiltered} OR EXISTS (SELECT 1 FROM coaching."Relationships" r WHERE r."TeamClientCaseId"=c."Id" AND r."Id"=ANY({ids})))
                UNION ALL
                SELECT c."Id",c."ClientId",a."StartedAt",least(c."EndedAt",a."EndedAt")
                FROM coaching."TeamClientCases" c JOIN coaching."TeamCoachAssignments" a ON a."TeamClientCaseId"=c."Id"
                WHERE c."TeamId"={teamId} AND NOT {allMembers} AND a."CoachId"={memberId}
                    AND ({unfiltered} OR EXISTS (SELECT 1 FROM coaching."Relationships" r WHERE r."TeamClientCaseId"=c."Id" AND r."Id"=ANY({ids})))
            ), intervals AS (
                SELECT *, row_number() OVER (PARTITION BY "ClientId" ORDER BY since) AS occurrence FROM raw_intervals
            ), clients AS (
                SELECT "ClientId",
                    bool_or(since<{s.Window.End} AND (until IS NULL OR until>={s.Window.End})) AS active_end,
                    bool_or(since<{s.Window.Start} AND (until IS NULL OR until>={s.Window.Start})) AS active_start,
                    bool_or(until<{s.Window.End}) AS previously_ended,
                    bool_or(occurrence=1 AND since>={s.Window.Start} AND since<{s.Window.End}) AS is_new,
                    bool_or(occurrence>1 AND since>={s.Window.Start} AND since<{s.Window.End}) AS reactivated,
                    bool_or(until>={s.Window.Start} AND until<{s.Window.End}) AS departed
                FROM intervals GROUP BY "ClientId"
            ) SELECT count(*) FILTER(WHERE active_end)::int AS "Active",
                0::int AS "Suspended",
                count(*) FILTER(WHERE previously_ended AND NOT active_end)::int AS "Completed",
                count(*) FILTER(WHERE is_new)::int AS "NewClients",
                count(*) FILTER(WHERE active_start)::int AS "StartActive",
                count(*) FILTER(WHERE active_start AND active_end)::int AS "Retained",
                count(*) FILTER(WHERE reactivated)::int AS "Reactivated",
                count(*) FILTER(WHERE departed)::int AS "Departed"
            FROM clients
            """).SingleAsync(ct);
        return new(summary.Active, 0, summary.Completed, summary.NewClients, summary.Reactivated, summary.Departed, summary.Active - summary.StartActive,
            MetricMath.Percent(summary.Retained, summary.StartActive), AnalysisBuckets.Clients(series.Select(x => new ClientPoint(x.Date, x.Active, x.NewClients, x.Reactivated, x.Departed)), s.Grouping), []);
    }
    public async Task<Guid[]?> ResolveRelationshipsAsync(
        Guid coach,
        Guid workspace,
        Guid? group,
        Guid? offer,
        CancellationToken ct
    )
    {
        if (
            group is not null
            && !await db.Groups.AnyAsync(
                x => x.Id == group && x.CoachId == coach && x.WorkspaceId == workspace && x.TeamId == null,
                ct
            )
        )
            throw ApiException.NotFound();
        if (
            offer is not null
            && !await db.Services.AnyAsync(
                x => x.OfferRevisionId == offer && x.CoachId == coach && x.WorkspaceId == workspace,
                ct
            )
            && !await db.Applications.AnyAsync(
                x => x.OfferRevisionId == offer && x.CoachId == coach && x.WorkspaceId == workspace,
                ct
            )
        )
            throw ApiException.NotFound();
        var q = db.Relationships.Where(x => x.CoachId == coach && x.WorkspaceId == workspace && x.TeamId == null);
        if (group is not null)
            q = q.Where(x =>
                db.Memberships.Any(m => m.GroupId == group && m.RelationshipId == x.Id)
            );
        if (offer is not null)
            q = q.Where(x =>
                db.Services.Any(a => a.RelationshipId == x.Id && a.OfferRevisionId == offer)
            );
        var result = await q.Select(x => x.Id).Take(10001).ToArrayAsync(ct);
        if (result.Length > 10000)
            throw ApiException.Invalid(
                "This filtered cohort exceeds 10,000 relationships. Select a smaller group."
            );
        return result;
    }

    public async Task<AnalysisOptions> OptionsAsync(
        Guid coach,
        Guid workspace,
        CancellationToken ct
    )
    {
        var groups = await db
            .Groups.Where(x => x.CoachId == coach && x.WorkspaceId == workspace && !x.Archived && x.TeamId == null)
            .OrderBy(x => x.Name)
            .Take(200)
            .Select(x => new GroupAnalysis(
                x.Id,
                x.Name,
                db.Memberships.Count(m => m.GroupId == x.Id)
            ))
            .ToArrayAsync(ct);
        var offers = await db
            .Applications.Where(x => x.CoachId == coach && x.WorkspaceId == workspace && x.TeamId == null)
            .GroupBy(x => new { x.OfferRevisionId, x.OfferName })
            .Select(g => new OfferChoice(g.Key.OfferRevisionId, g.Key.OfferName))
            .Take(200)
            .ToArrayAsync(ct);
        return new(groups, offers);
    }

    public async Task<ClientsAnalysis> ClientsAsync(AnalysisScope s, CancellationToken ct)
    {
        if (s.TeamId != null)
            return await TeamClientsAsync(s, ct);
        var ids = s.RelationshipIds ?? [];
        var all = s.RelationshipIds is null;
        // A higher version supersedes every lower version from its timestamp onward, even
        // when event timestamps are out of order. Build those intervals once for all days.
        var series = await db
            .Database.SqlQuery<ClientSeriesRow>(
                $"""
                WITH cohort AS MATERIALIZED (
                    SELECT r."Id", r."ClientId", r."StartedAt", r."Status"
                    FROM coaching."Relationships" r
                    WHERE r."TeamId" IS NULL AND r."CoachId"={s.CoachId} AND r."WorkspaceId"={s.WorkspaceId} AND ({all} OR r."Id"=ANY({ids}))
                ), history AS MATERIALIZED (
                    SELECT h.*, r."ClientId", r."StartedAt",
                        min(h."OccurredAt") OVER (PARTITION BY h."RelationshipId" ORDER BY h."Version" DESC
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS until
                    FROM coaching."StatusChanges" h JOIN cohort r ON r."Id"=h."RelationshipId"
                ), intervals AS (
                    SELECT r."ClientId", r."StartedAt", '-infinity'::timestamptz AS since,
                        min(h."OccurredAt") AS until,
                        coalesce((array_agg(h."PreviousStatus" ORDER BY h."Version") FILTER (WHERE h."Version" IS NOT NULL))[1],r."Status") AS status
                    FROM cohort r LEFT JOIN history h ON h."RelationshipId"=r."Id"
                    GROUP BY r."Id", r."ClientId", r."StartedAt", r."Status"
                    UNION ALL
                    SELECT "ClientId", "StartedAt", "OccurredAt", until, "NewStatus" FROM history
                ), days AS (
                    SELECT generate_series({s.Window.From}::date,{s.Window.To}::date,'1 day')::date AS day
                ), active AS (
                    SELECT d.day, count(distinct i."ClientId")::int AS count
                    FROM days d LEFT JOIN intervals i ON i.status='Active'
                        AND i."StartedAt" < ((d.day+1)::timestamp AT TIME ZONE {s.Window.TimeZone})
                        AND i.since < ((d.day+1)::timestamp AT TIME ZONE {s.Window.TimeZone})
                        AND (i.until IS NULL OR i.until >= ((d.day+1)::timestamp AT TIME ZONE {s.Window.TimeZone}))
                    GROUP BY d.day
                ), events AS (
                    SELECT ("StartedAt" AT TIME ZONE {s.Window.TimeZone})::date AS day, "ClientId", 'new' AS kind FROM cohort
                    UNION ALL
                    SELECT ("OccurredAt" AT TIME ZONE {s.Window.TimeZone})::date, "ClientId",
                        CASE WHEN "NewStatus"='Active' THEN 'reactivated' ELSE 'departed' END
                    FROM history WHERE ("NewStatus"='Active' AND "PreviousStatus"<>'Active')
                        OR ("PreviousStatus"='Active' AND "NewStatus"<>'Active')
                ), daily_events AS (
                    SELECT day, count(distinct "ClientId") FILTER (WHERE kind='new')::int AS new,
                        count(distinct "ClientId") FILTER (WHERE kind='reactivated')::int AS reactivated,
                        count(distinct "ClientId") FILTER (WHERE kind='departed')::int AS departed
                    FROM events GROUP BY day
                )
                SELECT a.day AS "Date", a.count AS "Active", coalesce(e.new,0) AS "NewClients",
                    coalesce(e.reactivated,0) AS "Reactivated", coalesce(e.departed,0) AS "Departed"
                FROM active a LEFT JOIN daily_events e ON e.day=a.day ORDER BY a.day
                """
            )
            .ToArrayAsync(ct);
        var summary = await db
            .Database.SqlQuery<ClientSummaryRow>(
                $"""
                WITH cohort AS (SELECT r.*,coalesce((SELECT h."NewStatus" FROM coaching."StatusChanges" h WHERE h."RelationshipId"=r."Id" AND h."OccurredAt"<{s.Window.End} ORDER BY h."Version" DESC LIMIT 1),(SELECT h."PreviousStatus" FROM coaching."StatusChanges" h WHERE h."RelationshipId"=r."Id" ORDER BY h."Version" LIMIT 1),r."Status") AS status_end,coalesce((SELECT h."NewStatus" FROM coaching."StatusChanges" h WHERE h."RelationshipId"=r."Id" AND h."OccurredAt"<{s.Window.Start} ORDER BY h."Version" DESC LIMIT 1),(SELECT h."PreviousStatus" FROM coaching."StatusChanges" h WHERE h."RelationshipId"=r."Id" ORDER BY h."Version" LIMIT 1),r."Status") AS status_start FROM coaching."Relationships" r WHERE r."TeamId" IS NULL AND r."CoachId"={s.CoachId} AND r."WorkspaceId"={s.WorkspaceId} AND r."StartedAt"<{s.Window.End} AND ({all} OR r."Id"=ANY({ids})))
                SELECT count(distinct "ClientId") filter(where status_end='Active')::int AS "Active",count(distinct "ClientId") filter(where status_end='Suspended')::int AS "Suspended",count(distinct "ClientId") filter(where status_end='Completed')::int AS "Completed",count(distinct "ClientId") filter(where "StartedAt">={s.Window.Start})::int AS "NewClients",count(distinct "ClientId") filter(where "StartedAt"<{s.Window.Start} AND status_start='Active')::int AS "StartActive",count(distinct "ClientId") filter(where "StartedAt"<{s.Window.Start} AND status_start='Active' AND status_end='Active')::int AS "Retained",
                (SELECT count(distinct r."ClientId")::int FROM cohort r JOIN coaching."StatusChanges" h ON h."RelationshipId"=r."Id" WHERE h."OccurredAt">={s.Window.Start} AND h."OccurredAt"<{s.Window.End} AND h."NewStatus"='Active' AND h."PreviousStatus"<>'Active') AS "Reactivated",
                (SELECT count(distinct r."ClientId")::int FROM cohort r JOIN coaching."StatusChanges" h ON h."RelationshipId"=r."Id" WHERE h."OccurredAt">={s.Window.Start} AND h."OccurredAt"<{s.Window.End} AND h."PreviousStatus"='Active' AND h."NewStatus"<>'Active') AS "Departed" FROM cohort
                """
            )
            .SingleAsync(ct);
        var groups = await db
            .Groups.Where(g =>
                g.CoachId == s.CoachId && g.WorkspaceId == s.WorkspaceId && !g.Archived && g.TeamId == null
            )
            .Select(g => new GroupAnalysis(
                g.Id,
                g.Name,
                db.Memberships.Where(m =>
                        m.GroupId == g.Id && (all || ids.Contains(m.RelationshipId))
                    )
                    .Join(db.Relationships, m => m.RelationshipId, r => r.Id, (m, r) => r.ClientId)
                    .Distinct()
                    .Count()
            ))
            .Take(200)
            .ToArrayAsync(ct);
        return new(
            summary.Active,
            summary.Suspended,
            summary.Completed,
            summary.NewClients,
            summary.Reactivated,
            summary.Departed,
            summary.Active - summary.StartActive,
            MetricMath.Percent(summary.Retained, summary.StartActive),
            AnalysisBuckets.Clients(
                series.Select(x => new ClientPoint(
                    x.Date,
                    x.Active,
                    x.NewClients,
                    x.Reactivated,
                    x.Departed
                )),
                s.Grouping
            ),
            groups
        );
    }

    public async Task<AcquisitionAnalysis> AcquisitionAsync(AnalysisScope s, CancellationToken ct)
    {
        // Acquisition is a submitted-date cohort; decisions may occur after the selected period.
        var offer = s.OfferRevisionId ?? Guid.Empty;
        var allOffers = s.OfferRevisionId is null;
        var apps = db.Applications.Where(x =>
            (s.TeamId == null ? x.TeamId == null && x.CoachId == s.CoachId && x.WorkspaceId == s.WorkspaceId : x.TeamId == s.TeamId && (s.MemberId == null || x.CoachId == s.MemberId))
            && x.SubmittedAt >= s.Window.Start
            && x.SubmittedAt < s.Window.End
            && (allOffers || x.OfferRevisionId == offer)
        );
        // A current group has no historical attribution for unaccepted leads; group filters do not alter this funnel.
        var rows = await apps.GroupBy(x => x.Source)
            .Select(g => new
            {
                Source = g.Key,
                Submitted = g.Count(),
                Accepted = g.Count(x => x.Status == ApplicationStatus.Accepted),
                Rejected = g.Count(x => x.Status == ApplicationStatus.Rejected),
                Pending = g.Count(x => x.Status == ApplicationStatus.Submitted),
            })
            .ToArrayAsync(ct);
        var invitations = db.Invitations.Where(x =>
            (s.TeamId == null ? x.TeamId == null && x.CoachId == s.CoachId && x.WorkspaceId == s.WorkspaceId : x.TeamId == s.TeamId && (s.MemberId == null || x.CoachId == s.MemberId))
            && x.CreatedAt >= s.Window.Start
            && x.CreatedAt < s.Window.End
            && (allOffers || x.OfferRevisionId == offer)
        );
        var invitationCounts = await invitations.GroupBy(x => 1)
            .Select(g => new
            {
                Total = g.Count(),
                Accepted = g.Count(x => x.Status == InvitationStatus.Accepted),
                Declined = g.Count(x => x.Status == InvitationStatus.Declined),
            }).SingleOrDefaultAsync(ct);
        var submitted = rows.Sum(x => x.Submitted);
        var accepted = rows.Sum(x => x.Accepted);
        var rejected = rows.Sum(x => x.Rejected);
        return new(
            submitted,
            accepted,
            rejected,
            MetricMath.Percent(accepted, submitted),
            invitationCounts?.Total ?? 0,
            invitationCounts?.Accepted ?? 0,
            invitationCounts?.Declined ?? 0,
            rows.Select(x => new AcquisitionSource(
                    x.Source.ToString(),
                    x.Submitted,
                    x.Accepted,
                    x.Rejected,
                    x.Pending,
                    MetricMath.Percent(x.Accepted, x.Submitted)
                ))
                .ToArray()
        );
    }
}

/// <summary>Carries client series row fields for Coaching filtering or query projection; has no independent database writes.</summary>
public sealed class ClientSeriesRow
{
    public DateOnly Date
    {
        get; set;
    }
    public int Active
    {
        get; set;
    }
    public int NewClients
    {
        get; set;
    }
    public int Reactivated
    {
        get; set;
    }
    public int Departed
    {
        get; set;
    }
}

/// <summary>Carries client summary row fields for Coaching filtering or query projection; has no independent database writes.</summary>
public sealed class ClientSummaryRow
{
    public int Active
    {
        get; set;
    }
    public int Suspended
    {
        get; set;
    }
    public int Completed
    {
        get; set;
    }
    public int NewClients
    {
        get; set;
    }
    public int StartActive
    {
        get; set;
    }
    public int Retained
    {
        get; set;
    }
    public int Reactivated
    {
        get; set;
    }
    public int Departed
    {
        get; set;
    }
}
