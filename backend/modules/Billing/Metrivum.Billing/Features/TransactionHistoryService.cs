using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Offers.Contracts;
using Metrivum.Coaching.Contracts;
using Metrivum.Billing.Contracts;

namespace Metrivum.Billing.Features;

public sealed record TransactionHistoryQuery(int Page = 1, int PageSize = 25, string? Search = null,
    string? Direction = null, string? Status = null, string? Type = null, DateTimeOffset? From = null,
    DateTimeOffset? To = null, decimal? Minimum = null, decimal? Maximum = null, string? Currency = null,
    Guid? PersonId = null, Guid? ServiceId = null, Guid? OfferId = null, Guid? SubscriptionId = null,
    string? PlanId = null, Guid? TeamId = null);
public sealed record FinancialHistoryItem(Guid Id, Guid DueId, Guid? PaymentId, Guid? AttemptId, Guid OrderId,
    string Type, string Status, string Direction, string Name, decimal GrossAmount, decimal FeeRate,
    decimal FeeAmount, decimal NetAmount, string Currency, DateTimeOffset Date, Guid CoachId, Guid ClientId,
    Guid? ServiceId, Guid? OfferId, string? PlanId, string? FailureCode, string Mode, bool IsSettlement,
    string? CoachName = null, string? ClientName = null, DateTimeOffset? DueAt = null, bool Overdue = false);

/// <summary>Money per currency: settled in the window (earned, paid) and still open (to receive, to pay, overdue).</summary>
public sealed record TransactionCurrencySummary(string Currency, decimal Earned, decimal Paid, decimal Fees, decimal ToReceive,
    decimal ToPay, decimal OverdueIncoming, decimal OverdueOutgoing);
public sealed record TransactionSummary(IReadOnlyList<TransactionCurrencySummary> Currencies, int Settled, int Upcoming,
    int OverdueIncoming, int OverdueOutgoing, DateTimeOffset? NextDueAt);

public sealed class TransactionHistoryService(BillingDbContext db, IAccountContext account, ITeamContext teams, IAccountDirectory directory, TimeProvider clock)
{
    public async Task<BillingPage<FinancialHistoryItem>> ListAsync(TransactionHistoryQuery request, CancellationToken ct)
    {
        Validate(request);
        var query = await Query(request, ct);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.Date).ThenByDescending(x => x.Id)
            .Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).ToArrayAsync(ct);
        var names = await directory.GetAccountsAsync(rows.SelectMany(x => new[] { x.Coach, x.Client }).Distinct().ToArray(), ct);
        var now = clock.GetUtcNow();
        return new(rows.Select(x => Dto(x, now) with { CoachName = names.GetValueOrDefault(x.Coach)?.DisplayName, ClientName = names.GetValueOrDefault(x.Client)?.DisplayName }).ToArray(), request.Page, request.PageSize, total);
    }

    public async Task<FinancialHistoryItem> DetailAsync(Guid id, Guid? teamId, CancellationToken ct)
    {
        var query = await Query(new() { TeamId = teamId }, ct);
        var row = await query.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.NotFound();
        var names = await directory.GetAccountsAsync([row.Coach, row.Client], ct);
        return Dto(row, clock.GetUtcNow()) with { CoachName = names.GetValueOrDefault(row.Coach)?.DisplayName, ClientName = names.GetValueOrDefault(row.Client)?.DisplayName };
    }

    /// <summary>
    /// Totals for the finance overview. Settled money (earned, paid, fees) counts inside the optional window; open dues
    /// count whatever their date, split into upcoming and overdue by their due date.
    /// </summary>
    public async Task<TransactionSummary> SummaryAsync(DateTimeOffset? from, DateTimeOffset? to, Guid? teamId, CancellationToken ct)
    {
        if (from > to) throw ApiException.Invalid("Invalid transaction summary window.");
        var settled = await (await Query(new() { TeamId = teamId, From = from, To = to, Status = "Succeeded" }, ct))
            .Select(x => new { x.Direction, x.Currency, x.Gross, x.Fee, x.Net }).ToListAsync(ct);
        var open = await (await Query(new() { TeamId = teamId, Status = "Pending" }, ct))
            .Where(x => x.DueAt != null).Select(x => new { x.Direction, x.Currency, x.Gross, x.Net, DueAt = x.DueAt!.Value }).ToListAsync(ct);
        var now = clock.GetUtcNow();
        var currencies = settled.Select(x => x.Currency).Concat(open.Select(x => x.Currency)).Distinct().Order().Select(currency => new TransactionCurrencySummary(currency,
            settled.Where(x => x.Currency == currency && x.Direction == "Incoming").Sum(x => x.Net),
            settled.Where(x => x.Currency == currency && x.Direction == "Outgoing").Sum(x => x.Gross),
            settled.Where(x => x.Currency == currency && x.Direction == "Incoming").Sum(x => x.Fee),
            open.Where(x => x.Currency == currency && x.Direction == "Incoming" && x.DueAt >= now).Sum(x => x.Net),
            open.Where(x => x.Currency == currency && x.Direction == "Outgoing" && x.DueAt >= now).Sum(x => x.Gross),
            open.Where(x => x.Currency == currency && x.Direction == "Incoming" && x.DueAt < now).Sum(x => x.Net),
            open.Where(x => x.Currency == currency && x.Direction == "Outgoing" && x.DueAt < now).Sum(x => x.Gross))).ToArray();
        return new(currencies, settled.Count, open.Count(x => x.DueAt >= now), open.Count(x => x.Direction == "Incoming" && x.DueAt < now),
            open.Count(x => x.Direction == "Outgoing" && x.DueAt < now), open.Where(x => x.DueAt >= now).Select(x => (DateTimeOffset?)x.DueAt).Min());
    }

    private async Task<IQueryable<Row>> Query(TransactionHistoryQuery r, CancellationToken ct)
    {
        await account.GetRolesAsync(ct);
        var user = account.UserId;
        if (r.TeamId is {} team) await teams.RequireAsync(team, user, true, ct);
        var dues = db.Dues.AsNoTracking().Where(d => r.TeamId == null
            ? d.ClientId == user || d.CoachId == user && d.TeamId == null && d.Context != BillingContext.Platform
            : d.TeamId == r.TeamId || db.Set<TeamBillingQuote>().Any(q => q.DueId == d.Id && q.TeamId == r.TeamId));
        if (r.PersonId is {} person) dues = dues.Where(d => d.ClientId == person || d.CoachId == person);
        if (r.ServiceId is {} service) dues = dues.Where(d => d.ServiceId == service);
        if (r.SubscriptionId is {} subscriptionFilter) dues = dues.Where(d => db.Subscriptions.Any(s => s.Id == subscriptionFilter && s.OrderId == d.OrderId)
            || db.PlanChanges.Any(c => c.SubscriptionId == subscriptionFilter && c.DueId == d.Id));
        var orders = db.Orders.AsNoTracking().AsQueryable();
        if (r.OfferId is {} offer) orders = orders.Where(o => o.OfferRevisionId == offer);
        if (r.PlanId != null) orders = orders.Where(o => o.Context == BillingContext.Platform && EF.Functions.JsonContains(o.OptionSnapshot, JsonSerializer.Serialize(new { PlanId = r.PlanId })));
        var source = from due in dues join order in orders on due.OrderId equals order.Id select new { due, order, Recurring = db.Subscriptions.Any(s => s.OrderId == order.Id) };
        var paid = from x in source join p in db.Payments.AsNoTracking() on x.due.Id equals p.DueId
                   select new Row
                   {
                       Id = p.Id, DueId = x.due.Id, PaymentId = p.Id, AttemptId = p.AttemptId, OrderId = x.order.Id,
                       Type = x.due.Context == BillingContext.Platform ? "PlatformSubscription" : x.due.Context == BillingContext.TrainingPlan ? "TrainingPlan" : x.Recurring ? "CoachingSubscription" : "CoachingService",
                       Status = "Succeeded", Direction = x.due.Context == BillingContext.Platform || x.due.ClientId == user ? "Outgoing" : "Incoming",
                       Name = x.order.Name, Gross = p.GrossAmount, FeeRate = p.FeeRate, Fee = p.FeeAmount, Net = p.CoachNetAmount,
                       Currency = p.Currency, Date = p.SettledAt, Coach = p.CoachId, Client = p.ClientId, ServiceId = p.Context == BillingContext.Platform ? null : x.due.ServiceId,
                       OfferId = x.order.OfferRevisionId == Guid.Empty ? null : x.order.OfferRevisionId, Snapshot = x.order.OptionSnapshot,
                       Mode = p.Mode == SettlementMode.Simulated ? "Simulated" : "External", Failure = null, IsSettlement = true,
                       // Every branch of the union below projects the same members, DueAt included.
                       DueAt = null
                   };
        var attempts = from x in source join a in db.Attempts.AsNoTracking() on x.due.Id equals a.DueId
                       where a.Status != AttemptStatus.Succeeded
                       select new Row
                       {
                           Id = a.Id, DueId = x.due.Id, PaymentId = null, AttemptId = a.Id, OrderId = x.order.Id,
                           Type = x.due.Context == BillingContext.Platform ? "PlatformSubscription" : x.due.Context == BillingContext.TrainingPlan ? "TrainingPlan" : x.Recurring ? "CoachingSubscription" : "CoachingService",
                           Status = a.Status == AttemptStatus.Failed ? "Failed" : "Pending", Direction = x.due.Context == BillingContext.Platform || x.due.ClientId == user ? "Outgoing" : "Incoming",
                           Name = x.order.Name, Gross = x.due.Amount, FeeRate = x.due.FeeRate, Fee = x.due.FeeAmount, Net = x.due.CoachNetAmount,
                           Currency = x.due.Currency, Date = a.CreatedAt, Coach = x.due.CoachId, Client = x.due.ClientId, ServiceId = x.due.Context == BillingContext.Platform ? null : x.due.ServiceId,
                           OfferId = x.order.OfferRevisionId == Guid.Empty ? null : x.order.OfferRevisionId, Snapshot = x.order.OptionSnapshot,
                           Mode = "Simulated", Failure = a.FailureCode, IsSettlement = false,
                           DueAt = x.due.DueAt
                       };
        var pending = from x in source
                      where x.due.Status == DueStatus.AwaitingPayment
                      select new Row
                      {
                          Id = x.due.Id, DueId = x.due.Id, PaymentId = null, AttemptId = null, OrderId = x.order.Id,
                          Type = x.due.Context == BillingContext.Platform ? "PlatformSubscription" : x.due.Context == BillingContext.TrainingPlan ? "TrainingPlan" : x.Recurring ? "CoachingSubscription" : "CoachingService",
                          Status = "Pending", Direction = x.due.Context == BillingContext.Platform || x.due.ClientId == user ? "Outgoing" : "Incoming",
                          Name = x.order.Name, Gross = x.due.Amount, FeeRate = x.due.FeeRate, Fee = x.due.FeeAmount, Net = x.due.CoachNetAmount,
                          Currency = x.due.Currency, Date = x.due.CreatedAt, Coach = x.due.CoachId, Client = x.due.ClientId, ServiceId = x.due.Context == BillingContext.Platform ? null : x.due.ServiceId,
                          OfferId = x.order.OfferRevisionId == Guid.Empty ? null : x.order.OfferRevisionId, Snapshot = x.order.OptionSnapshot,
                          Mode = x.due.SettlementMode == SettlementMode.Simulated ? "Simulated" : "External", Failure = null, IsSettlement = false,
                          DueAt = x.due.DueAt
                      };
        var refunds = from x in source join p in db.Payments on x.due.Id equals p.DueId
                      join refund in db.Set<SimulatedRefund>() on p.Id equals refund.PaymentId
                      select new Row
                      {
                          Id = refund.Id, DueId = x.due.Id, PaymentId = p.Id, AttemptId = p.AttemptId, OrderId = x.order.Id,
                          Type = "Refund", Status = "Refunded", Direction = x.due.ClientId == user ? "Incoming" : "Outgoing",
                          Name = x.order.Name, Gross = refund.Amount, FeeRate = p.FeeRate, Fee = p.FeeAmount, Net = p.CoachNetAmount,
                          Currency = refund.Currency, Date = refund.CreatedAt, Coach = p.CoachId, Client = p.ClientId, ServiceId = x.due.Context == BillingContext.Platform ? null : x.due.ServiceId,
                          OfferId = x.order.OfferRevisionId == Guid.Empty ? null : x.order.OfferRevisionId, Snapshot = x.order.OptionSnapshot, Mode = "Simulated", Failure = null, IsSettlement = true,
                          DueAt = null
                      };
        var cancellations = from change in db.PlanChanges.AsNoTracking()
                            join subscription in db.PlatformSubscriptions on change.SubscriptionId equals subscription.Id
                            where r.TeamId == null && subscription.OwnerId == user && change.Type == "DowngradeScheduled" && change.PlanId == "Free"
                                && r.ServiceId == null && r.OfferId == null && r.PlanId == null && (r.PersonId == null || r.PersonId == user)
                                && (r.SubscriptionId == null || r.SubscriptionId == subscription.Id)
                            select new Row
                            {
                                Id = change.Id, DueId = Guid.Empty, PaymentId = null, AttemptId = null, OrderId = Guid.Empty,
                                Type = "SubscriptionChange", Status = "Cancelled", Direction = "Outgoing", Name = "Auto-renewal cancellation scheduled",
                                Gross = 0, FeeRate = 0, Fee = 0, Net = 0, Currency = PlanCatalog.Currency, Date = change.CreatedAt, Coach = user, Client = user,
                                ServiceId = null, OfferId = null, Snapshot = "{}", Mode = "Simulated", Failure = null, IsSettlement = false,
                                DueAt = null
                            };
        var serviceCancellations = from change in db.Set<ServiceRenewalChange>().AsNoTracking()
                                   join subscription in db.Subscriptions on change.SubscriptionId equals subscription.Id
                                   join order in db.Orders on subscription.OrderId equals order.Id
                                   where r.TeamId == null ? order.ClientId == user || order.CoachId == user && order.TeamId == null : order.TeamId == r.TeamId
                                   where r.PlanId == null && (r.PersonId == null || order.ClientId == r.PersonId || order.CoachId == r.PersonId)
                                       && (r.ServiceId == null || order.ServiceId == r.ServiceId) && (r.OfferId == null || order.OfferRevisionId == r.OfferId)
                                       && (r.SubscriptionId == null || subscription.Id == r.SubscriptionId)
                                   select new Row
                                   {
                                       Id = change.Id, DueId = Guid.Empty, PaymentId = null, AttemptId = null, OrderId = order.Id,
                                       Type = "SubscriptionChange", Status = "Cancelled", Direction = order.ClientId == user ? "Outgoing" : "Incoming",
                                       Name = order.Name, Gross = 0, FeeRate = 0, Fee = 0, Net = 0, Currency = order.Currency, Date = change.CreatedAt,
                                       Coach = order.CoachId, Client = order.ClientId, ServiceId = order.ServiceId, OfferId = order.OfferRevisionId,
                                       Snapshot = order.OptionSnapshot, Mode = "Simulated", Failure = null, IsSettlement = false,
                                       DueAt = null
                                   };
        var query = paid.Concat(attempts).Concat(pending).Concat(refunds).Concat(cancellations).Concat(serviceCancellations);
        if (r.From is {} from) query = query.Where(x => x.Date >= from);
        if (r.To is {} to) query = query.Where(x => x.Date < to);
        if (r.Minimum is {} min) query = query.Where(x => x.Gross >= min);
        if (r.Maximum is {} max) query = query.Where(x => x.Gross <= max);
        if (r.Currency != null) query = query.Where(x => x.Currency == r.Currency);
        if (r.Type != null) query = query.Where(x => x.Type == r.Type);
        if (r.Direction != null) query = query.Where(x => x.Direction == r.Direction);
        if (r.Status != null) query = query.Where(x => x.Status == r.Status);
        if (!string.IsNullOrWhiteSpace(r.Search)) { var search = "%" + r.Search.Replace("%", "\\%").Replace("_", "\\_") + "%"; query = query.Where(x => EF.Functions.ILike(x.Name, search)); }
        return query;
    }
    private static FinancialHistoryItem Dto(Row x, DateTimeOffset now)
    {
        using var snapshot = JsonDocument.Parse(x.Snapshot);
        var planId = snapshot.RootElement.TryGetProperty("PlanId", out var plan) ? plan.GetString() : null;
        return new(x.Id, x.DueId, x.PaymentId, x.AttemptId, x.OrderId, x.Type, x.Status, x.Direction, x.Name, x.Gross, x.FeeRate,
            x.Fee, x.Net, x.Currency, x.Date, x.Coach, x.Client, x.ServiceId, x.OfferId, planId, x.Failure, x.Mode, x.IsSettlement,
            DueAt: x.DueAt, Overdue: x.Status == "Pending" && x.DueAt < now);
    }
    private static void Validate(TransactionHistoryQuery r)
    {
        if (r.Page is < 1 or > 100000 || r.PageSize is < 1 or > 100 || r.Search?.Length > 200
            || r.From > r.To || r.Minimum < 0 || r.Maximum < r.Minimum || r.Currency?.Length is not (null or 3)
            || r.Direction is not (null or "Incoming" or "Outgoing") || r.Status is not (null or "Succeeded" or "Pending" or "Failed" or "Refunded" or "Cancelled")
            || r.Type is not (null or "PlatformSubscription" or "CoachingService" or "CoachingSubscription" or "TrainingPlan" or "Refund" or "SubscriptionChange"))
            throw ApiException.Invalid("Invalid transaction history filters.");
    }
    private sealed class Row
    {
        public Guid Id { get; set; } public Guid DueId { get; set; } public Guid? PaymentId { get; set; } public Guid? AttemptId { get; set; } public Guid OrderId { get; set; }
        public string Type { get; set; } = ""; public string Status { get; set; } = ""; public string Direction { get; set; } = ""; public string Name { get; set; } = "";
        public decimal Gross { get; set; } public decimal FeeRate { get; set; } public decimal Fee { get; set; } public decimal Net { get; set; }
        public string Currency { get; set; } = ""; public DateTimeOffset Date { get; set; } public Guid Coach { get; set; } public Guid Client { get; set; }
        public Guid? ServiceId { get; set; } public Guid? OfferId { get; set; } public string Snapshot { get; set; } = "{}";
        public string? Failure { get; set; } public string Mode { get; set; } = ""; public bool IsSettlement { get; set; }
        public DateTimeOffset? DueAt { get; set; }
    }
}
