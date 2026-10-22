using TrainFlow.Training.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.Billing.Features;

public sealed record SimulatedMethodRequest(string Label, SimulatedOutcome Outcome = SimulatedOutcome.Success);
public sealed record PaymentMethodDto(Guid Id, string Label, bool Active, DateTimeOffset CreatedAt);
public sealed record PayRequest(Guid? PaymentMethodId, string IdempotencyKey);
public sealed record ExternalSettlementRequest(string Source, string IdempotencyKey);
public sealed record OrderDto(Guid Id, Guid? ServiceId, Guid? RelationshipId, Guid CoachId, Guid ClientId, string Name,
    Guid OfferRevisionId, Guid BillingOptionId, int? SelectedSessionCount, decimal Amount, string Currency, decimal FeeRate,
    decimal FeeAmount, decimal CoachNetAmount, SettlementMode SettlementMode, DateTimeOffset StartedAt, DateTimeOffset CreatedAt, Guid? TeamId = null, Guid? TeamClientCaseId = null);
public sealed record PaymentDueDto(Guid Id, Guid OrderId, Guid? ServiceId, Guid? RelationshipId, Guid CoachId, Guid ClientId,
    int Sequence, DateTimeOffset PeriodStart, DateTimeOffset? PeriodEnd, DateTimeOffset DueAt, DueStatus Status, decimal Amount,
    string Currency, decimal FeeRate, decimal FeeAmount, decimal CoachNetAmount, SettlementMode SettlementMode,
    DateTimeOffset? SettledAt, Guid? SettledBy, string? SettlementSource, bool Overdue, Guid? TeamId = null, Guid? TeamClientCaseId = null, DateTimeOffset? ValidUntil = null, bool IsExpired = false);
public sealed record PaymentAttemptDto(Guid Id, Guid DueId, Guid? PaymentMethodId, AttemptStatus Status, string? FailureCode, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt);
public sealed record PaymentDto(Guid Id, Guid DueId, Guid? AttemptId, decimal GrossAmount, decimal FeeRate, decimal FeeAmount,
    decimal CoachNetAmount, string Currency, SettlementMode Mode, string Source, Guid? ActorId, DateTimeOffset SettledAt, Guid? TeamId = null, Guid? TeamClientCaseId = null);
public sealed record PaymentTransactionDto(Guid Id, Guid PaymentId, string Provider, string ProviderReference, decimal Amount, string Currency, DateTimeOffset CreatedAt);
public sealed record PaymentResultDto(PaymentDueDto Due, PaymentAttemptDto? Attempt, PaymentDto? Payment);
public sealed record BillingPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
public sealed record RelationshipBillingDto(BillingPage<PaymentDueDto> Dues, IReadOnlyList<OrderDto> Orders,
    IReadOnlyList<PaymentAttemptDto> Attempts, IReadOnlyList<PaymentDto> Payments, IReadOnlyList<PaymentTransactionDto> Transactions, RelationshipBillingSummaryDto? Summary = null);
public sealed record CurrencyOverdueDto(string Currency, decimal Amount, int Count);
public sealed record RelationshipBillingSummaryDto(PaymentDto? LastSettlement, IReadOnlyList<CurrencyOverdueDto> OverdueByCurrency, PaymentDueDto? NextDue);
public sealed record CoachEarningsDto(string Currency, decimal GrossAmount, decimal FeeAmount, decimal CoachNetAmount, int Payments);
public sealed record ServiceRenewalRequest(bool AutoRenew, Guid? PaymentMethodId = null);
public sealed record ServiceSubscriptionDto(Guid Id, Guid ServiceId, bool AutoRenew, Guid? PaymentMethodId, DateTimeOffset NextPeriodAt, bool Active);

public sealed partial class BillingService(BillingDbContext db, IAccountContext accounts, IFeatureAccessService access,
    IRelationshipAccessPolicy relationships, IOfferLibrary offers, IPaymentProvider provider, IConfiguration configuration,
    TimeProvider clock, ModuleTransaction transaction, TrainFlow.Notifications.Contracts.INotificationPublisher notifications, ITrainingPurchases? trainingPurchases = null, ITeamContext? teams = null, IAbuseProtection? abuse = null) : IBillingOrders
{
    // Trusted Coaching read: the caller authorizes the exact relationship before supplying this bounded page.
    public async Task<IReadOnlyDictionary<Guid, ServiceBillingState>> GetServiceStatesAsync(IReadOnlyCollection<Guid> serviceIds, CancellationToken ct)
    {
        if (serviceIds.Count > 100) throw ApiException.Invalid("At most 100 services can be summarized.");
        var now = clock.GetUtcNow();
        var rows = await db.Orders.AsNoTracking().Where(x => serviceIds.Contains(x.ServiceId!.Value) && x.Context == BillingContext.CoachingService)
            .Select(x => new
            {
                x.ServiceId,
                Current = db.Dues.Where(d => d.OrderId == x.Id && (d.PeriodStart <= now || d.ValidUntil != null)).OrderByDescending(d => d.PeriodStart).ThenByDescending(d => d.Sequence).FirstOrDefault(),
                Next = db.Dues.Where(d => d.OrderId == x.Id && d.Status == DueStatus.AwaitingPayment && d.DueAt >= now).OrderBy(d => d.DueAt).ThenBy(d => d.Id).FirstOrDefault(),
                Overdue = db.Dues.Any(d => d.OrderId == x.Id && d.Status == DueStatus.AwaitingPayment && d.DueAt < now)
            }).ToArrayAsync(ct);
        return rows.ToDictionary(x => x.ServiceId!.Value, x => new ServiceBillingState(x.Overdue ? "Overdue" : x.Current?.Status.ToString() ?? "NotAvailable", null, x.Current?.PeriodStart, x.Current?.PeriodEnd, x.Next?.DueAt, x.Next?.Amount, x.Current?.Currency ?? x.Next?.Currency, x.Current?.ValidUntil, x.Current?.ValidUntil <= now));
    }

    public async Task<IReadOnlyList<ServiceSubscriptionDto>> ServiceSubscriptionsAsync(CancellationToken ct)
    {
        await Client("billing.read-own", ct);
        return await db.Subscriptions.AsNoTracking().Where(x => x.ClientId == accounts.UserId && x.Active).OrderBy(x => x.NextPeriodAt).Take(100)
            .Select(x => new ServiceSubscriptionDto(x.Id, x.ServiceId, x.AutoRenew, x.PaymentMethodId, x.NextPeriodAt, x.Active)).ToArrayAsync(ct);
    }
    public Task SetServiceRenewalAsync(Guid id, ServiceRenewalRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Client("billing.pay-own", token);
        await Lock("subscription:" + id, token);
        var subscription = await db.Subscriptions.SingleOrDefaultAsync(x => x.Id == id && x.ClientId == accounts.UserId && x.Active, token) ?? throw ApiException.NotFound();
        var order = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == subscription.OrderId, token);
        await Relation(order.RelationshipId, RelationshipOperation.ProtectedWrite, token);
        if (request.AutoRenew && (request.PaymentMethodId == null || !await db.Methods.AnyAsync(x => x.Id == request.PaymentMethodId && x.ClientId == accounts.UserId && x.Active, token)))
            throw ApiException.Invalid("Automatic renewal requires an explicitly selected active simulated method.");
        subscription.AutoRenew = request.AutoRenew;
        subscription.PaymentMethodId = request.AutoRenew ? request.PaymentMethodId : null;
        await db.SaveChangesAsync(token);
    }, ct);
    public Task<ServiceOrderSnapshot> CreateForServiceAsync(CreateServiceOrderCommand command, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        // PostgreSQL timestamps have microsecond precision; normalize before idempotency comparisons.
        command = command with
        {
            StartedAt = new DateTimeOffset(command.StartedAt.ToUniversalTime().Ticks / 10 * 10, TimeSpan.Zero)
        };
        if (command.ServiceId == Guid.Empty || command.RelationshipId == Guid.Empty || command.CoachId == Guid.Empty || command.ClientId == Guid.Empty || command.CoachId == command.ClientId || !Enum.IsDefined(command.SettlementMode))
            throw ApiException.Invalid("Invalid service billing command.");
        await Lock("service:" + command.ServiceId, token);
        var existing = await db.Orders.AsNoTracking().SingleOrDefaultAsync(x => x.ServiceId == command.ServiceId, token);
        if (existing != null)
        {
            if (existing.TeamId != command.TeamId || existing.TeamClientCaseId != command.TeamClientCaseId || existing.RelationshipId != command.RelationshipId || existing.CoachId != command.CoachId || existing.ClientId != command.ClientId || existing.OfferRevisionId != command.OfferRevisionId || existing.BillingOptionId != command.BillingOptionId || existing.SelectedSessionCount != command.SelectedSessionCount || existing.StartedAt != command.StartedAt || existing.SettlementMode != command.SettlementMode)
                throw ApiException.Conflict("Service billing is already bound to other terms.");
            return await Snapshot(existing, token);
        }
        var quote = await offers.QuoteAsync(command.OfferRevisionId, command.BillingOptionId, command.SelectedSessionCount, token);
        if (quote.CoachId != command.CoachId || quote.TeamId != command.TeamId || (command.TeamId == null) != (command.TeamClientCaseId == null))
            throw ApiException.NotFound();
        var rate = command.SettlementMode == SettlementMode.External ? 0 : await FeeRateAsync(command.CoachId, token, command.TeamId);
        var split = BillingRules.Split(quote.Amount, rate);
        var order = new Order
        {
            Id = Guid.NewGuid(),
            ServiceId = command.ServiceId,
            RelationshipId = command.RelationshipId,
            TeamId = command.TeamId,
            TeamClientCaseId = command.TeamClientCaseId,
            CoachId = command.CoachId,
            ClientId = command.ClientId,
            OfferRevisionId = quote.RevisionId,
            BillingOptionId = quote.BillingOption.Id,
            SelectedSessionCount = quote.SelectedSessionCount,
            Name = quote.Name,
            OptionSnapshot = JsonSerializer.Serialize(quote.BillingOption),
            Amount = quote.Amount,
            Currency = quote.Currency,
            FeeRate = rate,
            FeeAmount = split.Fee,
            CoachNetAmount = split.Net,
            SettlementMode = command.SettlementMode,
            StartedAt = command.StartedAt.ToUniversalTime(),
            CreatedAt = clock.GetUtcNow()
        };
        db.Orders.Add(order);
        var due = NewDue(order, 0);
        db.Dues.Add(due);
        if (quote.BillingOption.Model == BillingModel.PeriodSubscription)
            db.Subscriptions.Add(new()
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ServiceId = order.ServiceId!.Value,
                ClientId = order.ClientId,
                Anchor = order.StartedAt,
                PeriodCount = quote.BillingOption.PeriodCount!.Value,
                PeriodUnit = quote.BillingOption.PeriodUnit!.Value,
                NextPeriodAt = due.PeriodEnd!.Value
            });
        if (order.Amount == 0)
            await Settle(due, null, null, "ZeroPrice", "zero:" + due.Id, null, false);
        await db.SaveChangesAsync(token);
        await Publish(due, "PaymentDue", token);
        return await Snapshot(order, token);
    }, ct);
    public Task EndServiceAsync(Guid serviceId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock("service:" + serviceId, token);
        var subscription = await db.Subscriptions.SingleOrDefaultAsync(x => x.ServiceId == serviceId, token);
        if (subscription != null && subscription.Active)
        {
            subscription.Active = false;
            subscription.EndedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(token);
        }
    }, ct);
    public async Task<IReadOnlyList<PaymentMethodDto>> MethodsAsync(CancellationToken ct)
    {
        await MethodAccess(ct);
        return (await db.Methods.AsNoTracking().Where(x => x.ClientId == accounts.UserId && x.Active).OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(20).ToArrayAsync(ct)).Select(MethodDto).ToArray();
    }
    public Task<PaymentMethodDto> AddMethodAsync(SimulatedMethodRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await MethodAccess(token);
        if (string.IsNullOrWhiteSpace(request.Label) || request.Label.Length > 80 || !Enum.IsDefined(request.Outcome))
            throw ApiException.Invalid("A bounded label and simulator outcome are required.");
        await Lock("methods:" + accounts.UserId, token);
        if (await db.Methods.CountAsync(x => x.ClientId == accounts.UserId && x.Active, token) >= 20)
            throw ApiException.Conflict("Remove an existing payment method first.");
        var method = new PaymentMethod { Id = Guid.NewGuid(), ClientId = accounts.UserId, Label = request.Label.Trim(), Token = "sim_" + (request.Outcome == SimulatedOutcome.Success ? "success_" : "decline_") + Guid.NewGuid().ToString("N"), CreatedAt = clock.GetUtcNow() };
        db.Methods.Add(method);
        await db.SaveChangesAsync(token);
        return MethodDto(method);
    }, ct);
    public Task RemoveMethodAsync(Guid id, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await MethodAccess(token);
        await Lock("methods:" + accounts.UserId, token);
        var method = await db.Methods.SingleOrDefaultAsync(x => x.Id == id && x.ClientId == accounts.UserId, token) ?? throw ApiException.NotFound();
        method.Active = false;
        await db.SaveChangesAsync(token);
    }, ct);
    public async Task<BillingPage<OrderDto>> OrdersAsync(int page, int size, string sort, CancellationToken ct)
    {
        await Client("billing.read-own", ct);
        Query(page, size, sort, "created");
        var q = db.Orders.AsNoTracking().Where(x => x.ClientId == accounts.UserId && (x.Context == BillingContext.CoachingService || x.Context == BillingContext.TrainingPlan));
        var allowed = await VisibleRelationships(await q.Select(x => x.RelationshipId).Distinct().ToArrayAsync(ct), ct);
        q = q.Where(x => x.Context == BillingContext.TrainingPlan || allowed.Contains(x.RelationshipId!.Value));
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        return new(rows.Select(OrderDto).ToArray(), page, size, total);
    }
    public async Task<BillingPage<PaymentDto>> PaymentHistoryAsync(int page, int size, CancellationToken ct)
    {
        await Client("billing.read-own", ct);
        Query(page, size, "created", "created");
        var visible = await VisibleRelationships(await db.Dues.AsNoTracking().Where(x => x.ClientId == accounts.UserId && (x.Context == BillingContext.CoachingService || x.Context == BillingContext.TrainingPlan)).Select(x => x.RelationshipId).Distinct().ToArrayAsync(ct), ct);
        var dues = db.Dues.Where(x => x.ClientId == accounts.UserId && (x.Context == BillingContext.TrainingPlan || visible.Contains(x.RelationshipId!.Value))).Select(x => x.Id);
        var query = db.Payments.AsNoTracking().Where(x => x.ClientId == accounts.UserId && (x.Context == BillingContext.CoachingService || x.Context == BillingContext.TrainingPlan) && dues.Contains(x.DueId));
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.SettledAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        return new(items.Select(PaymentDto).ToArray(), page, size, total);
    }
    public async Task<BillingPage<PaymentDueDto>> DuesAsync(int page, int size, DueStatus? status, string sort, CancellationToken ct)
    {
        await Client("billing.read-own", ct);
        Query(page, size, sort, "due", "created");
        if (status != null && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Unknown payment status.");
        var q = db.Dues.AsNoTracking().Where(x => x.ClientId == accounts.UserId && (x.Context == BillingContext.CoachingService || x.Context == BillingContext.TrainingPlan));
        if (status != null)
            q = q.Where(x => x.Status == status);
        var allowed = await VisibleRelationships(await q.Select(x => x.RelationshipId).Distinct().ToArrayAsync(ct), ct);
        q = q.Where(x => x.Context == BillingContext.TrainingPlan || allowed.Contains(x.RelationshipId!.Value));
        var total = await q.CountAsync(ct);
        var ordered = sort == "created" ? q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id) : q.OrderBy(x => x.DueAt).ThenBy(x => x.Id);
        var rows = await ordered.Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        return new(rows.Select(DueDto).ToArray(), page, size, total);
    }
    public async Task<RelationshipBillingDto> RelationshipAsync(Guid id, int page, int size, CancellationToken ct, DueStatus? status = null, Guid? serviceId = null, DateTimeOffset? from = null, DateTimeOffset? to = null, string sort = "due")
    {
        Query(page, size, "due", "due");
        if (from >= to || status.HasValue && !Enum.IsDefined(status.Value) || sort is not ("due" or "latest")) throw ApiException.Invalid("Invalid billing filters.");
        await Relation(id, RelationshipOperation.HistoricalSharedRead, ct);
        // An account can be a Coach and Client; financial ownership determines its role here.
        var coachOwned = await db.Orders.AsNoTracking().AnyAsync(x => x.RelationshipId == id && x.CoachId == accounts.UserId, ct);
        var clientOwned = await db.Orders.AsNoTracking().AnyAsync(x => x.RelationshipId == id && x.ClientId == accounts.UserId, ct);
        if (coachOwned || (!clientOwned && !(await accounts.GetRolesAsync(ct)).Contains(AccountRole.Client)))
        {
            await accounts.RequireCoachAsync(ct);
            await access.RequireAsync("billing.manage", ct);
        }
        else
            await Client("billing.read-own", ct);
        var q = db.Dues.AsNoTracking().Where(x => x.RelationshipId == id && (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId));
        q = q.Where(x => x.Context == BillingContext.CoachingService);
        var now = clock.GetUtcNow();
        var overdue = await q.Where(x => x.Status == DueStatus.AwaitingPayment && x.DueAt < now).GroupBy(x => x.Currency).Select(g => new CurrencyOverdueDto(g.Key, g.Sum(x => x.Amount), g.Count())).ToArrayAsync(ct);
        var next = await q.Where(x => x.Status == DueStatus.AwaitingPayment && x.DueAt >= now).OrderBy(x => x.DueAt).ThenBy(x => x.Id).FirstOrDefaultAsync(ct);
        var last = await db.Payments.AsNoTracking().Where(x => q.Any(d => d.Id == x.DueId)).OrderByDescending(x => x.SettledAt).ThenBy(x => x.Id).FirstOrDefaultAsync(ct);
        var summary = new RelationshipBillingSummaryDto(last == null ? null : PaymentDto(last), overdue, next == null ? null : DueDto(next));
        if (status != null) q = q.Where(x => x.Status == status);
        if (serviceId != null) q = q.Where(x => x.ServiceId == serviceId);
        if (from != null) q = q.Where(x => x.DueAt >= from);
        if (to != null) q = q.Where(x => x.DueAt < to);
        var total = await q.CountAsync(ct);
        var ordered = sort == "latest" ? q.OrderByDescending(x => x.DueAt).ThenBy(x => x.Id) : q.OrderBy(x => x.DueAt).ThenBy(x => x.Id);
        var rows = await ordered.Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var orderIds = rows.Select(x => x.OrderId).Distinct().ToArray();
        var orders = await db.Orders.AsNoTracking().Where(x => orderIds.Contains(x.Id)).ToArrayAsync(ct);
        var attempts = await db.Attempts.AsNoTracking().Where(x => ids.Contains(x.DueId)).OrderByDescending(x => x.CreatedAt).Take(500).ToArrayAsync(ct);
        var payments = await db.Payments.AsNoTracking().Where(x => ids.Contains(x.DueId)).ToArrayAsync(ct);
        var paymentIds = payments.Select(x => x.Id).ToArray();
        var transactions = await db.Transactions.AsNoTracking().Where(x => paymentIds.Contains(x.PaymentId)).ToArrayAsync(ct);
        return new(new(rows.Select(DueDto).ToArray(), page, size, total), orders.Select(OrderDto).ToArray(), attempts.Select(AttemptDto).ToArray(), payments.Select(PaymentDto).ToArray(), transactions.Select(x => new PaymentTransactionDto(x.Id, x.PaymentId, x.Provider, x.ProviderReference, x.Amount, x.Currency, x.CreatedAt)).ToArray(), summary);
    }
    public Task<PaymentResultDto> PayAsync(Guid id, PayRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        abuse?.Require(accounts.UserId, AbusePolicies.Payment);
        await Client("billing.pay-own", token);
        Key(request.IdempotencyKey);
        var due = await OwnedDue(id, false, token);
        if (due.Context is not (BillingContext.CoachingService or BillingContext.TrainingPlan))
            throw ApiException.NotFound();
        if (due.Context == BillingContext.CoachingService) await Relation(due.RelationshipId, RelationshipOperation.ProtectedWrite, token);
        if (due.SettlementMode == SettlementMode.External && due.Status == DueStatus.AwaitingPayment)
            throw ApiException.Conflict("This due uses external settlement.");
        var previous = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == id && x.IdempotencyKey == request.IdempotencyKey, token);
        if (previous != null)
        {
            if (previous.PaymentMethodId != request.PaymentMethodId)
                throw ApiException.Conflict("Idempotency key was used with another payment method.");
            return await Result(due, previous, token);
        }
        if (due.Status != DueStatus.AwaitingPayment)
            return await Result(due, null, token);
        var method = request.PaymentMethodId is null ? null : await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.PaymentMethodId && x.ClientId == accounts.UserId && x.Active, token) ?? throw ApiException.NotFound();
        var attempt = await Charge(due, method, request.IdempotencyKey, accounts.UserId, token);
        await db.SaveChangesAsync(token);
        return await Result(due, attempt, token);
    }, ct);
    public Task<PaymentResultDto> ExternalAsync(Guid id, ExternalSettlementRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        await access.RequireAsync("billing.manage", token);
        Key(request.IdempotencyKey);
        if (string.IsNullOrWhiteSpace(request.Source) || request.Source.Length > 200)
            throw ApiException.Invalid("External settlement requires a bounded source description.");
        var due = await OwnedDue(id, true, token);
        if (due.Context is not (BillingContext.CoachingService or BillingContext.TrainingPlan))
            throw ApiException.NotFound();
        if (due.Context == BillingContext.CoachingService) await Relation(due.RelationshipId, RelationshipOperation.Manage, token);
        if (due.Status != DueStatus.AwaitingPayment)
        {
            var payment = await db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == id, token);
            if (due.Status != DueStatus.PaidExternally || payment?.IdempotencyKey != request.IdempotencyKey || payment.Source != request.Source.Trim())
                throw ApiException.Conflict("Due is already settled.");
            return await Result(due, null, token);
        }
        await Settle(due, null, null, request.Source.Trim(), request.IdempotencyKey, accounts.UserId, true);
        await Publish(due, "PaymentConfirmed", token);
        await db.SaveChangesAsync(token);
        return await Result(due, null, token);
    }, ct);
    public async Task<IReadOnlyList<CoachEarningsDto>> EarningsAsync(CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("billing.manage", ct);
        return await db.Payments.AsNoTracking().Where(x => x.CoachId == accounts.UserId && x.TeamId == null && (x.Context == BillingContext.CoachingService || x.Context == BillingContext.TrainingPlan)).GroupBy(x => x.Currency).OrderBy(g => g.Key).Select(g => new CoachEarningsDto(g.Key, g.Sum(x => x.GrossAmount), g.Sum(x => x.FeeAmount), g.Sum(x => x.CoachNetAmount), g.Count())).ToArrayAsync(ct);
    }
    // One committed occurrence per transaction; SKIP LOCKED permits multiple independent workers.
    public async Task<int> GenerateRenewalsAsync(int maximum, CancellationToken ct)
    {
        if (maximum is < 1 or > 100)
            throw ApiException.Invalid("Renewal batch must be 1–100.");
        var generated = 0;
        for (var index = 0; index < maximum; index++)
        {
            Guid? claimed = null;
            var sequence = 0;
            try
            {
                var result = await transaction.RunAsync(async token =>
                {
                    var now = clock.GetUtcNow();
                    var found = await db.Subscriptions.FromSqlInterpolated($"SELECT * FROM billing.subscriptions WHERE \"Active\" AND \"NextPeriodAt\" <= {now} AND (\"RetryAfter\" IS NULL OR \"RetryAfter\" <= {now}) ORDER BY \"NextPeriodAt\", \"Id\" LIMIT 1 FOR UPDATE SKIP LOCKED").ToArrayAsync(token);
                    if (found.Length == 0)
                        return false;
                    var subscription = found[0];
                    await db.Entry(subscription).ReloadAsync(token);
                    claimed = subscription.Id;
                    sequence = subscription.NextSequence;
                    var order = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == subscription.OrderId, token);
                    var due = NewDue(order, sequence);
                    await Lock("due:" + due.Id, token);
                    db.Dues.Add(due);
                    await db.SaveChangesAsync(token);
                    if (due.Amount == 0)
                        await Settle(due, null, null, "ZeroPrice", "zero:" + due.Id, null, false);
                    // Provider calls happen only after the concrete due has committed.
                    subscription.NextSequence++;
                    subscription.NextPeriodAt = BillingRules.PeriodAt(subscription.Anchor, subscription.PeriodCount, subscription.PeriodUnit, subscription.NextSequence);
                    subscription.RetryAfter = null;
                    var failure = await db.RenewalFailures.SingleOrDefaultAsync(x => x.SubscriptionId == subscription.Id && x.Sequence == sequence, token);
                    if (failure != null)
                        failure.ResolvedAt = now;
                    await db.SaveChangesAsync(token);
                    return true;
                }, ct);
                if (!result)
                    break;
                generated++;
            }
            catch (Exception error) when (error is not OperationCanceledException && claimed != null)
            {
                await RecordRenewalFailure(claimed.Value, sequence, error is ApiException api ? api.Code : error.GetType().Name, ct);
            }
        }
        await SettleMaturedRenewalsAsync(maximum, ct);
        return generated;
    }
    private async Task SettleMaturedRenewalsAsync(int maximum, CancellationToken ct)
    {
        for (var index = 0; index < maximum; index++)
        {
            var worked = await transaction.RunAsync(async token =>
            {
                var now = clock.GetUtcNow();
                var found = await db.Dues.FromSqlInterpolated($"SELECT d.* FROM billing.payment_dues d WHERE d.\"Sequence\" > 0 AND d.\"Status\" = 'AwaitingPayment' AND d.\"SettlementMode\" = 'Simulated' AND d.\"DueAt\" <= {now} AND EXISTS (SELECT 1 FROM billing.subscriptions s JOIN billing.payment_methods m ON m.\"Id\"=s.\"PaymentMethodId\" WHERE s.\"OrderId\"=d.\"OrderId\" AND s.\"AutoRenew\" AND s.\"Active\" AND m.\"ClientId\"=d.\"ClientId\" AND m.\"Active\") AND NOT EXISTS (SELECT 1 FROM billing.payment_attempts a WHERE a.\"DueId\" = d.\"Id\" AND a.\"IdempotencyKey\" LIKE 'renewal:%') ORDER BY d.\"DueAt\", d.\"Id\" LIMIT 1 FOR UPDATE OF d SKIP LOCKED").ToArrayAsync(token);
                if (found.Length == 0)
                    return false;
                var due = found[0];
                // Manual and automatic payment acquire the due row before mutating settlement.
                await db.Entry(due).ReloadAsync(token);
                if (due.Status != DueStatus.AwaitingPayment)
                    return true;
                var subscription = await db.Subscriptions.AsNoTracking().SingleAsync(x => x.OrderId == due.OrderId, token);
                var method = await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == subscription.PaymentMethodId && x.ClientId == due.ClientId && x.Active, token);
                if (method != null)
                {
                    await Charge(due, method, "renewal:" + due.Id, null, token);
                    await db.SaveChangesAsync(token);
                }
                return true;
            }, ct);
            if (!worked)
                break;
        }
    }
    private Task RecordRenewalFailure(Guid id, int sequence, string code, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        var subscription = (await db.Subscriptions.FromSqlInterpolated($"SELECT * FROM billing.subscriptions WHERE \"Id\"={id} FOR UPDATE").ToArrayAsync(token)).Single();
        await db.Entry(subscription).ReloadAsync(token);
        var failure = await db.RenewalFailures.SingleOrDefaultAsync(x => x.SubscriptionId == id && x.Sequence == sequence, token);
        if (failure == null)
        {
            failure = new()
            {
                Id = Guid.NewGuid(),
                SubscriptionId = id,
                Sequence = sequence
            };
            db.RenewalFailures.Add(failure);
        }
        failure.Attempts++;
        failure.Code = code[..Math.Min(code.Length, 80)];
        failure.LastAttemptAt = clock.GetUtcNow();
        if (subscription.NextSequence > sequence)
            failure.ResolvedAt = clock.GetUtcNow();
        else
            subscription.RetryAfter = clock.GetUtcNow().AddMinutes(1);
        await db.SaveChangesAsync(token);
    }, ct);
    private PaymentDue NewDue(Order order, int sequence)
    {
        var option = JsonSerializer.Deserialize<BillingOptionSnapshot>(order.OptionSnapshot)!;
        var start = sequence == 0 ? order.StartedAt : BillingRules.PeriodAt(order.StartedAt, option.PeriodCount!.Value, option.PeriodUnit!.Value, sequence);
        DateTimeOffset? end = option.Model == BillingModel.PeriodSubscription ? BillingRules.PeriodAt(order.StartedAt, option.PeriodCount!.Value, option.PeriodUnit!.Value, sequence + 1) : null;
        return new()
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            ValidityDays = option.ValidityDays,
            ServiceId = order.ServiceId,
            RelationshipId = order.RelationshipId,
            TeamId = order.TeamId,
            TeamClientCaseId = order.TeamClientCaseId,
            CoachId = order.CoachId,
            ClientId = order.ClientId,
            Sequence = sequence,
            PeriodStart = start,
            PeriodEnd = end,
            DueAt = BillingRules.DueAt(option.PaymentTerms ?? new(DueRule.Upfront), start, end),
            Status = DueStatus.AwaitingPayment,
            Amount = order.Amount,
            Currency = order.Currency,
            FeeRate = order.FeeRate,
            FeeAmount = order.FeeAmount,
            CoachNetAmount = order.CoachNetAmount,
            SettlementMode = order.SettlementMode,
            CreatedAt = clock.GetUtcNow()
        };
    }
    internal async Task<PaymentAttempt> Charge(PaymentDue due, PaymentMethod? method, string key, Guid? actor, CancellationToken ct, bool startNewPlatformPeriod = false)
    {
        var attempt = new PaymentAttempt { Id = Guid.NewGuid(), DueId = due.Id, PaymentMethodId = method?.Id, IdempotencyKey = key, Status = AttemptStatus.Pending, CreatedAt = clock.GetUtcNow() };
        db.Attempts.Add(attempt);
        await db.SaveChangesAsync(ct);
        ProviderResult result;
        try
        {
            result = due.Amount == 0 ? new(true, "sim_zero_" + due.Id.ToString("N"), null)
                : await provider.ChargeAsync(new("due:" + due.Id + ":" + key, due.Amount, due.Currency, method?.Token ?? "sim_success_manual"), ct);
        }
        catch (Exception error) when (error is not OperationCanceledException) { result = new(false, "", "PROVIDER_UNAVAILABLE"); }
        attempt.Status = result.Succeeded ? AttemptStatus.Succeeded : AttemptStatus.Failed;
        attempt.FailureCode = result.FailureCode;
        attempt.ProviderReference = result.Reference.Length == 0 ? null : result.Reference;
        attempt.CompletedAt = clock.GetUtcNow();
        if (result.Succeeded)
        {
            if (due.Context is BillingContext.CoachingService or BillingContext.TrainingPlan)
            {
                due.FeeRate = await FeeRateAsync(due.CoachId, ct, due.TeamId);
                var split = BillingRules.Split(due.Amount, due.FeeRate);
                due.FeeAmount = split.Fee;
                due.CoachNetAmount = split.Net;
            }
            await Settle(due, attempt, result.Reference, result.Provider, key, actor, false, startNewPlatformPeriod);
            await Publish(due, "PaymentConfirmed", ct);
        }
        return attempt;
    }
    private async Task Settle(PaymentDue due, PaymentAttempt? attempt, string? providerReference, string source, string key, Guid? actor, bool external, bool startNewPlatformPeriod = false)
    {
        if (external)
        {
            due.FeeRate = 0;
            due.FeeAmount = 0;
            due.CoachNetAmount = due.Amount;
            due.SettlementMode = SettlementMode.External;
        }
        due.Status = due.Amount == 0 ? DueStatus.Free : external ? DueStatus.PaidExternally : DueStatus.Paid;
        due.SettledAt = new DateTimeOffset(clock.GetUtcNow().UtcTicks / 10 * 10, TimeSpan.Zero);
        due.ValidUntil = due.ValidityDays is { } days ? due.SettledAt.Value.AddDays(days) : null;
        if (startNewPlatformPeriod)
        {
            if (due.Context != BillingContext.Platform)
                throw new InvalidOperationException("Only platform payments can begin a new platform billing period.");
            due.PeriodStart = due.SettledAt.Value;
            due.PeriodEnd = due.PeriodStart.AddMonths(1);
        }
        due.SettledBy = actor;
        due.SettlementSource = source;
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            Context = due.Context,
            TeamId = due.TeamId,
            TeamClientCaseId = due.TeamClientCaseId,
            DueId = due.Id,
            AttemptId = attempt?.Id,
            CoachId = due.CoachId,
            ClientId = due.ClientId,
            GrossAmount = due.Amount,
            Currency = due.Currency,
            FeeRate = due.FeeRate,
            FeeAmount = due.FeeAmount,
            CoachNetAmount = due.CoachNetAmount,
            Mode = due.SettlementMode,
            Source = source,
            IdempotencyKey = key,
            ActorId = actor,
            SettledAt = due.SettledAt.Value
        };
        db.Payments.Add(payment);
        if (attempt != null && !string.IsNullOrEmpty(providerReference) && due.Amount > 0)
            db.Transactions.Add(new()
            {
                Id = Guid.NewGuid(),
                PaymentId = payment.Id,
                AttemptId = attempt.Id,
                Provider = source,
                ProviderReference = providerReference,
                Amount = due.Amount,
                Currency = due.Currency,
                CreatedAt = clock.GetUtcNow()
            });
        if (due.Context == BillingContext.TrainingPlan)
            await (trainingPurchases ?? throw ApiException.Conflict("Plan delivery is unavailable.")).FulfillAsync(due.OrderId, CancellationToken.None);
    }
    private async Task<ServiceOrderSnapshot> Snapshot(Order o, CancellationToken ct)
    {
        var due = await db.Dues.AsNoTracking().SingleAsync(x => x.OrderId == o.Id && x.Sequence == 0, ct);
        var subscription = await db.Subscriptions.AsNoTracking().Where(x => x.OrderId == o.Id).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
        return new(o.Id, due.Id, o.Amount, o.Currency, o.FeeRate, o.FeeAmount, o.CoachNetAmount, due.DueAt, subscription);
    }
    private async Task<decimal> FeeRateAsync(Guid coach, CancellationToken ct, Guid? sellerTeamId = null)
    {
        var pro = await db.PlatformSubscriptions.AsNoTracking().AnyAsync(x => x.OwnerId == coach && (x.PlanId == "Pro" || x.PlanId == "Team") && x.PeriodEnd > clock.GetUtcNow(), ct);
        pro = pro || await (from member in db.TeamMemberships
                            join team in db.Teams on member.TeamId equals team.Id
                            join subscription in db.Set<TeamPlatformSubscription>() on team.Id equals subscription.TeamId
                            where member.UserId == coach && member.Status == "Active" && (team.Status == "Active" || team.Status == "DissolutionScheduled")
                                && subscription.Status == "Active" && subscription.PeriodEnd > clock.GetUtcNow()
                            select team.Id).AnyAsync(ct);
        if (sellerTeamId is { } teamId)
            pro = await (from team in db.Teams
                         join subscription in db.Set<TeamPlatformSubscription>() on team.Id equals subscription.TeamId
                         where team.Id == teamId && (team.Status == "Active" || team.Status == "DissolutionScheduled") && subscription.Status == "Active" && subscription.PeriodEnd > clock.GetUtcNow()
                         select team.Id).AnyAsync(ct);
        var rate = configuration.GetValue<decimal?>("Billing:CoachFeeRates:" + coach) ?? configuration.GetValue<decimal?>("Billing:PlatformFeeRate") ?? (pro ? 0.05m : 0.10m);
        BillingRules.Split(0, rate);
        return rate;
    }
    public async Task<bool> HasOutstandingPersonalObligationsAsync(Guid relationshipId, CancellationToken ct) =>
        await db.Dues.AnyAsync(x => x.RelationshipId == relationshipId && x.TeamId == null && x.Status == DueStatus.AwaitingPayment, ct)
        || await (from subscription in db.Subscriptions
                  join order in db.Orders on subscription.OrderId equals order.Id
                  where order.RelationshipId == relationshipId && order.TeamId == null && subscription.Active
                  select subscription.Id).AnyAsync(ct);
    internal async Task<PaymentResultDto> Result(PaymentDue due, PaymentAttempt? attempt, CancellationToken ct) => new(DueDto(due), attempt == null ? null : AttemptDto(attempt), (await db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == due.Id, ct)) is { } p ? PaymentDto(p) : null);
    private async Task<PaymentDue> OwnedDue(Guid id, bool coach, CancellationToken ct)
    {
        if (coach)
        {
            var teamId = await db.Dues.Where(x => x.Id == id && x.CoachId == accounts.UserId && x.Context == BillingContext.TrainingPlan).Select(x => x.TeamId).SingleOrDefaultAsync(ct);
            if (teamId is { } team)
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team}, 0))", ct);
        }
        var rows = coach
            ? await db.Dues.FromSqlInterpolated($"SELECT * FROM billing.payment_dues WHERE \"Id\"={id} AND \"CoachId\"={accounts.UserId} FOR UPDATE").ToArrayAsync(ct)
            : await db.Dues.FromSqlInterpolated($"SELECT * FROM billing.payment_dues WHERE \"Id\"={id} AND \"ClientId\"={accounts.UserId} FOR UPDATE").ToArrayAsync(ct);
        var due = rows.SingleOrDefault() ?? throw ApiException.NotFound();
        await db.Entry(due).ReloadAsync(ct);
        if (coach && due.Context == BillingContext.TrainingPlan) await RequirePlanSellerAsync(due.TeamId, ct);
        return due;
    }
    private async Task Relation(Guid? id, RelationshipOperation op, CancellationToken ct)
    {
        var decision = await relationships.DecideAsync(id ?? throw ApiException.NotFound(), op, ct);
        if (!decision.Allowed)
            throw new ApiException(decision.Reason is "RESOURCE_NOT_FOUND" or "not_found" ? 404 : 403, "RELATIONSHIP_ACCESS_DENIED", "Relationship does not permit this billing operation.");
    }
    private async Task<Guid[]> VisibleRelationships(Guid?[] ids, CancellationToken ct)
    {
        var visible = new List<Guid>();
        foreach (var batch in ids.Where(x => x.HasValue).Select(x => x!.Value).Chunk(1000))
        {
            var decisions = await relationships.DecideManyAsync(batch, RelationshipOperation.HistoricalSharedRead, ct);
            visible.AddRange(decisions.Where(x => x.Value.Allowed).Select(x => x.Key));
        }
        return visible.ToArray();
    }
    private async Task MethodAccess(CancellationToken ct)
    {
        if ((await accounts.GetRolesAsync(ct)).Contains(AccountRole.Client))
            await Client("billing.pay-own", ct);
        else
        {
            await accounts.RequireCoachAsync(ct);
            await access.RequireAsync("billing.manage", ct);
        }
    }
    private async Task Client(string key, CancellationToken ct)
    {
        await accounts.RequireClientAsync(ct);
        await access.RequireAsync(key, ct);
    }
    private Task Lock(string key, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"billing:" + key}, 0))", ct);
    internal async Task Publish(PaymentDue due, string type, CancellationToken ct)
    {
        var link = due.Context == BillingContext.Platform ? "/app/subscription" : due.Context == BillingContext.TrainingPlan ? "/app/training-plans" : "/app/payments";
        if (type == "PaymentConfirmed")
            await notifications.CancelScheduledAsync("Billing", due.Id, ct);
        await notifications.PublishAsync(new(due.ClientId, type + ":" + due.Id, type, "Billing", "Billing", due.Id, link, Required: true), ct);
        if (type == "PaymentDue" && due.Status == DueStatus.AwaitingPayment)
        {
            var now = clock.GetUtcNow();
            if (due.DueAt.AddDays(-1) > now)
                await notifications.PublishAsync(new(due.ClientId, "PaymentDueSoon:" + due.Id, "PaymentDueSoon", "Billing", "Billing", due.Id, link, due.DueAt.AddDays(-1), Required: true), ct);
            await notifications.PublishAsync(new(due.ClientId, "PaymentOverdue:" + due.Id, "PaymentOverdue", "Billing", "Billing", due.Id, link, due.DueAt.AddDays(1) > now ? due.DueAt.AddDays(1) : now, Required: true), ct);
        }
        if (type == "PaymentConfirmed" && due.Context == BillingContext.CoachingService && due.CoachId != due.ClientId)
            await notifications.PublishAsync(new(due.CoachId, type + ":" + due.Id, type, "Billing", "Billing", due.Id, "/app/clients/" + due.RelationshipId, Required: true), ct);
    }
    private static void Key(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100)
            throw ApiException.Invalid("A bounded idempotency key is required.");
    }
    private static void Query(int page, int size, string sort, params string[] sorts)
    {
        if (page is < 1 or > 100000 || size is < 1 or > 100 || !sorts.Contains(sort))
            throw ApiException.Invalid("Invalid billing list query.");
    }
    internal PaymentDueDto DueDto(PaymentDue d) => new(d.Id, d.OrderId, d.ServiceId, d.RelationshipId, d.CoachId, d.ClientId, d.Sequence, d.PeriodStart, d.PeriodEnd, d.DueAt, d.Status, d.Amount, d.Currency, d.FeeRate, d.FeeAmount, d.CoachNetAmount, d.SettlementMode, d.SettledAt, d.SettledBy, d.SettlementSource, d.Status == DueStatus.AwaitingPayment && d.DueAt < clock.GetUtcNow(), d.TeamId, d.TeamClientCaseId, d.ValidUntil, d.ValidUntil <= clock.GetUtcNow());
    private static OrderDto OrderDto(Order x) => new(x.Id, x.ServiceId, x.RelationshipId, x.CoachId, x.ClientId, x.Name, x.OfferRevisionId, x.BillingOptionId, x.SelectedSessionCount, x.Amount, x.Currency, x.FeeRate, x.FeeAmount, x.CoachNetAmount, x.SettlementMode, x.StartedAt, x.CreatedAt, x.TeamId, x.TeamClientCaseId);
    private static PaymentMethodDto MethodDto(PaymentMethod m) => new(m.Id, m.Label, m.Active, m.CreatedAt);
    private static PaymentAttemptDto AttemptDto(PaymentAttempt a) => new(a.Id, a.DueId, a.PaymentMethodId, a.Status, a.FailureCode, a.CreatedAt, a.CompletedAt);
    private static PaymentDto PaymentDto(Payment p) => new(p.Id, p.DueId, p.AttemptId, p.GrossAmount, p.FeeRate, p.FeeAmount, p.CoachNetAmount, p.Currency, p.Mode, p.Source, p.ActorId, p.SettledAt, p.TeamId, p.TeamClientCaseId);
}
