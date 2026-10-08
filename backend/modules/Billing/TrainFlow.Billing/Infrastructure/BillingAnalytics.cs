using Microsoft.EntityFrameworkCore;
using TrainFlow.Analytics.Contracts;

namespace TrainFlow.Billing.Infrastructure;

public sealed class BillingAnalytics(BillingDbContext db) : IFinanceAnalytics
{
    public async Task<FinancialAnalysis> QueryAsync(AnalysisScope s, CancellationToken ct)
    {
        var ids = s.RelationshipIds ?? [];
        var all = s.RelationshipIds is null;
        var offer = s.OfferRevisionId ?? Guid.Empty;
        var anyOffer = s.OfferRevisionId is null;
        var personal = s.TeamId == null;
        var team = s.TeamId ?? Guid.Empty;
        var allMembers = s.MemberId == null;
        var member = s.MemberId ?? Guid.Empty;
        // GROUPING SETS keeps distinct payer counts at their own grain while scanning payments once.
        var payments = await db.Database.SqlQuery<FinanceAggregateRow>(
            $"""
            WITH paid AS (
                SELECT p.*, o."OfferRevisionId", o."Name", (p."SettledAt" AT TIME ZONE {s.Window.TimeZone})::date AS day
                FROM billing.payments p JOIN billing.payment_dues d ON d."Id"=p."DueId" JOIN billing.orders o ON o."Id"=d."OrderId"
                WHERE (({personal} AND p."TeamId" IS NULL AND p."CoachId"={s.CoachId})
                    OR (NOT {personal} AND p."TeamId"={team} AND ({allMembers} OR p."CoachId"={member}))) AND p."Context"='CoachingService' AND p."SettledAt">={s.Window.Start} AND p."SettledAt"<{s.Window.End}
                AND ({all} OR d."RelationshipId"=ANY({ids})) AND ({anyOffer} OR o."OfferRevisionId"={offer})
            ), aggregates AS (
            SELECT CASE WHEN grouping(day)=0 THEN 'day' WHEN grouping("OfferRevisionId")=0 THEN 'offer' ELSE 'total' END AS "Kind",
                day AS "Date", "OfferRevisionId", "Name", "Currency",
                sum("GrossAmount") AS "Gross", sum("FeeAmount") AS "Fee", sum("CoachNetAmount") AS "Net",
                count(*)::int AS "Payments", count(distinct "ClientId")::int AS "Clients",
                coalesce(sum("GrossAmount") filter(where "Mode"='Simulated'),0) AS "Simulated",
                coalesce(sum("GrossAmount") filter(where "Mode"<>'Simulated'),0) AS "External"
            FROM paid GROUP BY GROUPING SETS (("Currency"),("Currency",day),("Currency","OfferRevisionId","Name"))
            )
            SELECT * FROM aggregates WHERE "Kind"<>'offer'
            UNION ALL
            (SELECT * FROM aggregates WHERE "Kind"='offer' ORDER BY "Gross" DESC LIMIT 100)
            """).ToListAsync(ct);
        var rows = payments.Where(x => x.Kind == "total").ToArray();
        var pending = await db
            .Dues.Where(d =>
                ((personal && d.TeamId == null && d.CoachId == s.CoachId) || (!personal && d.TeamId == team && (allMembers || d.CoachId == member)))
                && d.Context == Domain.BillingContext.CoachingService
                && d.Status == Domain.DueStatus.AwaitingPayment
                && d.DueAt >= s.Window.Start
                && d.DueAt < s.Window.End
                && (all || ids.Contains(d.RelationshipId))
            )
            .Join(
                db.Orders.Where(o => anyOffer || o.OfferRevisionId == offer),
                d => d.OrderId,
                o => o.Id,
                (d, o) => d
            )
            .GroupBy(d => d.Currency)
            .Select(g => new { Currency = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var recurring = await db
            .Subscriptions.Where(x =>
                x.Anchor < s.Window.End && (x.EndedAt == null || x.EndedAt >= s.Window.End)
            )
            .Join(
                db.Orders.Where(o =>
                    ((personal && o.TeamId == null && o.CoachId == s.CoachId) || (!personal && o.TeamId == team && (allMembers || o.CoachId == member)))
                    && o.Context == Domain.BillingContext.CoachingService
                    && (anyOffer || o.OfferRevisionId == offer)
                    && (all || ids.Contains(o.RelationshipId))
                ),
                x => x.OrderId,
                o => o.Id,
                (x, o) =>
                    new
                    {
                        o.Currency,
                        o.Amount,
                        x.PeriodCount,
                        x.PeriodUnit,
                    }
            )
            .GroupBy(x => new
            {
                x.Currency,
                x.PeriodCount,
                x.PeriodUnit,
            })
            .Select(g => new
            {
                g.Key.Currency,
                g.Key.PeriodCount,
                g.Key.PeriodUnit,
                Amount = g.Sum(x => x.Amount),
                Count = g.Count(),
            })
            .ToListAsync(ct);
        var renewal = await db
            .Dues.Where(d =>
                ((personal && d.TeamId == null && d.CoachId == s.CoachId) || (!personal && d.TeamId == team && (allMembers || d.CoachId == member)))
                && d.Context == Domain.BillingContext.CoachingService
                && d.Sequence > 0
                && d.SettledAt >= s.Window.Start
                && d.SettledAt < s.Window.End
                && (all || ids.Contains(d.RelationshipId))
            )
            .Join(
                db.Orders.Where(o => anyOffer || o.OfferRevisionId == offer),
                d => d.OrderId,
                o => o.Id,
                (d, o) => d
            )
            .GroupBy(d => d.Currency)
            .Select(g => new { Currency = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var series = payments.Where(x => x.Kind == "day").OrderBy(x => x.Date).ThenBy(x => x.Currency);
        var offers = payments.Where(x => x.Kind == "offer").OrderByDescending(x => x.Gross).Take(100);
        var currencies = rows.Select(x => x.Currency)
            .Concat(pending.Select(x => x.Currency))
            .Concat(recurring.Select(x => x.Currency))
            .Distinct()
            .Order();
        var totals = currencies
            .Select(c =>
            {
                var r = rows.FirstOrDefault(x => x.Currency == c);
                var m = recurring.Where(x => x.Currency == c);
                return new MoneyMetric(
                    c,
                    r?.Gross ?? 0,
                    r?.Fee ?? 0,
                    r?.Net ?? 0,
                    pending.FirstOrDefault(x => x.Currency == c)?.Amount ?? 0,
                    r?.Payments ?? 0,
                    r?.Clients ?? 0,
                    r is null ? 0 : r.Gross / r.Payments,
                    r is null ? 0 : r.Gross / r.Clients,
                    m.Sum(x =>
                        MetricMath.Monthly(x.Amount, x.PeriodCount, x.PeriodUnit.ToString())
                    ),
                    m.Sum(x => x.Count),
                    renewal.FirstOrDefault(x => x.Currency == c)?.Count ?? 0,
                    r?.Simulated ?? 0,
                    r?.External ?? 0
                );
            })
            .ToArray();
        return new(
            totals,
            AnalysisBuckets.Finance(
                series.Select(x => new FinancePoint(
                    x.Date!.Value,
                    x.Currency,
                    x.Gross,
                    x.Fee,
                    x.Net,
                    x.Payments
                )),
                s.Grouping
            ),
            offers
                .Select(x => new OfferRevenue(
                    x.OfferRevisionId!.Value,
                    x.Name!,
                    x.Currency,
                    x.Gross,
                    x.Net,
                    x.Payments,
                    x.Clients
                ))
                .ToArray()
        );
    }
}

public sealed class FinanceAggregateRow
{
    public string Kind { get; set; } = "";
    public DateOnly? Date
    {
        get; set;
    }
    public Guid? OfferRevisionId
    {
        get; set;
    }
    public string? Name
    {
        get; set;
    }
    public string Currency { get; set; } = "";
    public decimal Gross
    {
        get; set;
    }
    public decimal Fee
    {
        get; set;
    }
    public decimal Net
    {
        get; set;
    }
    public int Payments
    {
        get; set;
    }
    public int Clients
    {
        get; set;
    }
    public decimal Simulated
    {
        get; set;
    }
    public decimal External
    {
        get; set;
    }
}
