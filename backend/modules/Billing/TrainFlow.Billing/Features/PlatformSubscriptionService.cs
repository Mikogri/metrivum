using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications.Contracts;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.Billing.Features;

public sealed record PlatformPlanDto(string Id, string Name, decimal? Amount, string Currency, string BillingInterval,
    string? PriceVersion, string TermsVersion, decimal CommissionRate, bool PriceConfigured, IReadOnlyList<string> Capabilities);
public sealed record PlatformSubscriptionDto(Guid Id, string PlanId, string Status, DateTimeOffset? PeriodStart,
    DateTimeOffset? PeriodEnd, DateTimeOffset? NextDueAt, bool AutoRenew, string? PendingPlanId, long Version,
    PaymentDueDto? PendingDue, string? AcceptedPriceVersion, string? AcceptedTermsVersion, bool RenewalMethodEligible);
public sealed record PlatformCheckoutRequest(string PlanId, string PriceVersion, bool AutoRenew = false, Guid? PaymentMethodId = null, string? TeamName = null);
public sealed record PlatformConfirmRequest(Guid DueId, string IdempotencyKey, Guid? PaymentMethodId = null);
public sealed record PlatformChangeRequest(string PlanId, long Version);
public sealed record PlatformVersionRequest(long Version);
public sealed record PlatformRenewalRequest(long Version, bool AutoRenew, Guid? PaymentMethodId = null);
public sealed record PlatformHistoryDto(IReadOnlyList<PlanChange> Changes, IReadOnlyList<PaymentDto> Payments);

public sealed class PlatformSubscriptionService(BillingDbContext db, BillingService billing, IAccountContext accounts,
    IConfiguration configuration, TimeProvider clock, ModuleTransaction transaction, INotificationPublisher notifications,
    IEnumerable<FeatureDefinition> features, IAccountProfileFields? profiles = null, IPlatformCurrencyConverter? exchange = null)
{
    public Task<IReadOnlyList<PlatformPlanDto>> PlansAsync(CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        var price = await ConfiguredPrice(token);
        var team = await ConfiguredPrice(token, "Team");
        var capabilities = features.Select(x => x.Key).Distinct().Order().ToArray();
        return (IReadOnlyList<PlatformPlanDto>)new[] {
            new PlatformPlanDto("Free", "Free", 0m, price?.Currency ?? "USD", "None", null, "v1", 0.10m, true, capabilities),
            new PlatformPlanDto("Pro", "Pro", price?.Amount, price?.Currency ?? "EUR", "Month", price?.Version, price?.TermsVersion ?? "v1", 0.05m, price != null, capabilities),
            new PlatformPlanDto("Team", "Team", team?.Amount, team?.Currency ?? "USD", "Month", team?.Version, team?.TermsVersion ?? "v1", 0.05m, team != null, capabilities)
        };
    }, ct);

    public Task<PlatformSubscriptionDto> CurrentAsync(CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        var subscription = await Owned(token);
        await ProcessExpiry(subscription, token);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public Task<PlatformSubscriptionDto> CheckoutAsync(PlatformCheckoutRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        if (request.PlanId != "Pro")
            throw ApiException.Invalid("Use Team checkout with purchased seats to create an organization.");
        if (request.PlanId == "Team" && (string.IsNullOrWhiteSpace(request.TeamName) || request.TeamName.Trim().Length > 80))
            throw ApiException.Invalid("A team name of up to 80 characters is required.");
        var subscription = await Owned(token);
        await ProcessExpiry(subscription, token);
        var price = await ConfiguredPrice(token, request.PlanId) ?? throw ApiException.Conflict("Pro price is not configured.");
        if (price.Version != request.PriceVersion)
            throw ApiException.Conflict("The plan price changed. Review the current price.");
        if (subscription.PlanId == request.PlanId)
            throw ApiException.Conflict("This plan is already active.");
        if (request.AutoRenew && request.PaymentMethodId == null)
            throw ApiException.Invalid("Automatic renewal requires an explicitly selected simulated payment method.");
        if (request.PaymentMethodId is { } methodId)
            _ = await Method(methodId, subscription.OwnerId, token);
        if (subscription.PendingDueId != null)
        {
            var existing = await db.Dues.SingleAsync(x => x.Id == subscription.PendingDueId, token);
            if (existing.PeriodEnd <= clock.GetUtcNow())
            {
                await notifications.CancelScheduledAsync("Billing", existing.Id, token);
                subscription.PendingDueId = null;
            }
            if (subscription.PendingDueId != null && existing.Status == DueStatus.AwaitingPayment && subscription.AcceptedPriceId != price.Id)
                throw ApiException.Conflict("An outstanding checkout already uses different accepted terms.");
        }
        subscription.AcceptedPriceId = price.Id;
        subscription.AutoRenew = request.AutoRenew;
        subscription.PaymentMethodId = request.PaymentMethodId;
        subscription.PendingPlanId = request.PlanId;
        subscription.CheckoutTeamName = request.PlanId == "Team" ? request.TeamName!.Trim() : null;
        if (subscription.PendingDueId == null)
            await NewDue(subscription, price, clock.GetUtcNow(), token);
        subscription.Status = "AwaitingPayment";
        Touch(subscription);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public Task<PlatformSubscriptionDto> ConfirmAsync(PlatformConfirmRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 100)
            throw ApiException.Invalid("A bounded idempotency key is required.");
        var subscription = await Owned(token);
        var due = (await db.Dues.FromSqlInterpolated($"SELECT * FROM billing.payment_dues WHERE \"Id\"={request.DueId} AND \"ClientId\"={accounts.UserId} AND \"Context\"='Platform' FOR UPDATE").ToArrayAsync(token)).SingleOrDefault() ?? throw ApiException.NotFound();
        await db.Entry(due).ReloadAsync(token);
        var previous = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == due.Id && x.IdempotencyKey == request.IdempotencyKey, token);
        if (previous != null && previous.PaymentMethodId != request.PaymentMethodId)
            throw ApiException.Conflict("Idempotency key was used with another payment method.");
        if (due.Status != DueStatus.AwaitingPayment || previous != null)
            return await Dto(subscription, token);
        if (subscription.PendingDueId != due.Id)
            throw ApiException.Conflict("This is no longer the current checkout.");
        if (due.PeriodEnd <= clock.GetUtcNow())
            throw ApiException.Conflict("This checkout period expired. Start a new checkout.");
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, token);
        if (price.PlanId != "Pro")
            throw ApiException.Conflict("Legacy Team checkout cannot be activated. Use the organization checkout.");
        var method = request.PaymentMethodId == null ? null : await Method(request.PaymentMethodId.Value, accounts.UserId, token);
        var attempt = await billing.Charge(due, method, request.IdempotencyKey, accounts.UserId, token, startNewPlatformPeriod: true);
        if (attempt.Status == AttemptStatus.Succeeded)
            await Activate(subscription, due, token);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public Task<PlatformSubscriptionDto> ChangeAsync(PlatformChangeRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        if (request.PlanId != "Free")
            throw ApiException.Invalid("Use checkout to activate Pro.");
        var subscription = await Owned(token);
        Version(subscription, request.Version);
        await ProcessExpiry(subscription, token);
        if (subscription.PendingDueId is { } pending)
            await notifications.CancelScheduledAsync("Billing", pending, token);
        subscription.PendingDueId = null;
        if (subscription.PlanId == "Pro" && subscription.PeriodEnd > clock.GetUtcNow())
        {
            subscription.AutoRenew = false;
            subscription.PendingPlanId = "Free";
            Touch(subscription);
            AddChange(subscription, "DowngradeScheduled", "Free", subscription.PeriodEnd);
        }
        else
            await Free(subscription, "Downgraded", clock.GetUtcNow(), token);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public Task<PlatformSubscriptionDto> CancelAsync(PlatformVersionRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        var subscription = await Owned(token);
        Version(subscription, request.Version);
        subscription.AutoRenew = false;
        subscription.PendingPlanId = "Free";
        Touch(subscription);
        AddChange(subscription, "DowngradeScheduled", "Free", subscription.PeriodEnd);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public Task<PlatformSubscriptionDto> RenewalAsync(PlatformRenewalRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.GetRolesAsync(token);
        var subscription = await Owned(token);
        Version(subscription, request.Version);
        await ProcessExpiry(subscription, token);
        if (subscription.PlanId == "Free")
            throw ApiException.Conflict("Activate Pro before managing renewal.");
        if (request.AutoRenew)
        {
            if (request.PaymentMethodId == null)
                throw ApiException.Invalid("Automatic renewal requires a selected simulated method.");
            _ = await Method(request.PaymentMethodId.Value, subscription.OwnerId, token);
        }
        subscription.AutoRenew = request.AutoRenew;
        subscription.PaymentMethodId = request.AutoRenew ? request.PaymentMethodId : null;
        if (request.AutoRenew)
            subscription.PendingPlanId = null;
        Touch(subscription);
        AddChange(subscription, "RenewalPreferenceChanged", subscription.PlanId, clock.GetUtcNow());
        await Notify(subscription, "RenewalPreferenceChanged", token);
        await db.SaveChangesAsync(token);
        return await Dto(subscription, token);
    }, ct);

    public async Task<PlatformHistoryDto> HistoryAsync(CancellationToken ct)
    {
        await accounts.GetRolesAsync(ct);
        var subscription = await db.PlatformSubscriptions.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == accounts.UserId, ct);
        var changes = subscription == null ? [] : await db.PlanChanges.AsNoTracking().Where(x => x.SubscriptionId == subscription.Id).OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(100).ToArrayAsync(ct);
        var payments = await db.Payments.AsNoTracking().Where(x => x.ClientId == accounts.UserId && x.Context == BillingContext.Platform).OrderByDescending(x => x.SettledAt).Take(100)
            .Select(x => new PaymentDto(x.Id, x.DueId, x.AttemptId, x.GrossAmount, x.FeeRate, x.FeeAmount, x.CoachNetAmount, x.Currency, x.Mode, x.Source, x.ActorId, x.SettledAt)).ToArrayAsync(ct);
        return new(changes, payments);
    }

    public async Task<int> ProcessRenewalsAsync(int maximum, CancellationToken ct)
    {
        var count = 0;
        for (var i = 0; i < maximum; i++)
        {
            var processed = await transaction.RunAsync(async token =>
            {
                var now = clock.GetUtcNow();
                var rows = await db.PlatformSubscriptions.FromSqlInterpolated($"SELECT * FROM billing.platform_subscriptions WHERE \"PlanId\"<>'Free' AND \"PeriodEnd\" <= {now} ORDER BY \"PeriodEnd\", \"Id\" LIMIT 1 FOR UPDATE SKIP LOCKED").ToArrayAsync(token);
                if (rows.Length == 0)
                    return false;
                var subscription = rows[0];
                await db.Entry(subscription).ReloadAsync(token);
                await ProcessExpiry(subscription, token);
                await db.SaveChangesAsync(token);
                return true;
            }, ct);
            if (!processed)
                break;
            count++;
        }
        return count;
    }

    private async Task ProcessExpiry(PlatformSubscription subscription, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (subscription.PlanId == "Free" || subscription.PeriodEnd > now)
            return;
        var end = subscription.PeriodEnd!.Value;
        if (subscription.PendingPlanId == "Free")
        {
            await Free(subscription, "Downgraded", end, ct);
            return;
        }
        // Renew one current period after a long offline interval, never accumulate missed charges.
        var start = end;
        while (start.AddMonths(1) <= now)
            start = start.AddMonths(1);
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, ct);
        await NewDue(subscription, price, start, ct);
        if (subscription.AutoRenew && subscription.PaymentMethodId is { } methodId)
        {
            var method = await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == methodId && x.ClientId == subscription.OwnerId && x.Active, ct);
            if (method != null)
            {
                var due = await db.Dues.SingleAsync(x => x.Id == subscription.PendingDueId, ct);
                var attempt = await billing.Charge(due, method, "platform-renewal:" + due.Id, null, ct);
                if (attempt.Status == AttemptStatus.Succeeded)
                {
                    await Activate(subscription, due, ct);
                    return;
                }
            }
        }
        await Free(subscription, "UnpaidExpiry", end, ct);
        subscription.Status = "AwaitingPayment";
    }

    private async Task NewDue(PlatformSubscription subscription, PlanPrice price, DateTimeOffset start, CancellationToken ct)
    {
        start = new DateTimeOffset(start.ToUniversalTime().Ticks / 10 * 10, TimeSpan.Zero);
        var existing = await db.Dues.SingleOrDefaultAsync(x => x.ClientId == subscription.OwnerId && x.Context == BillingContext.Platform && x.PeriodStart == start && db.PlanChanges.Any(c => c.SubscriptionId == subscription.Id && c.DueId == x.Id && c.Type == "CheckoutCreated"), ct);
        if (existing != null)
        {
            if (existing.Amount != price.Amount || existing.Currency != price.Currency)
                throw ApiException.Conflict("This billing period is already bound to another price.");
            var previousOrder = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == existing.OrderId, ct);
            using var snapshot = System.Text.Json.JsonDocument.Parse(previousOrder.OptionSnapshot);
            if (snapshot.RootElement.GetProperty("Version").GetString() != price.Version)
                throw ApiException.Conflict("This billing period already has other accepted terms.");
            subscription.PendingDueId = existing.Id;
            return;
        }
        var order = new Order { Id = Guid.NewGuid(), Context = BillingContext.Platform, ServiceId = Guid.NewGuid(), CoachId = subscription.OwnerId, ClientId = subscription.OwnerId, Name = "TrainFlow " + price.PlanId, Amount = price.Amount, Currency = price.Currency, CoachNetAmount = price.Amount, SettlementMode = SettlementMode.Simulated, StartedAt = start, CreatedAt = clock.GetUtcNow(), OptionSnapshot = System.Text.Json.JsonSerializer.Serialize(new { price.PlanId, price.Version, price.TermsVersion, BillingInterval = "Month" }) };
        var due = new PaymentDue { Id = Guid.NewGuid(), Context = BillingContext.Platform, OrderId = order.Id, ServiceId = order.ServiceId, CoachId = subscription.OwnerId, ClientId = subscription.OwnerId, PeriodStart = start, PeriodEnd = start.AddMonths(1), DueAt = start, Amount = price.Amount, Currency = price.Currency, CoachNetAmount = price.Amount, SettlementMode = SettlementMode.Simulated, CreatedAt = clock.GetUtcNow() };
        db.Orders.Add(order);
        db.Dues.Add(due);
        // Persist due before setting its restrict FK on the subscription.
        await db.SaveChangesAsync(ct);
        subscription.PendingDueId = due.Id;
        AddChange(subscription, "CheckoutCreated", price.PlanId, start, due.Id);
        await billing.Publish(due, "PaymentDue", ct);
    }
    private async Task Activate(PlatformSubscription subscription, PaymentDue due, CancellationToken ct)
    {
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, ct);
        subscription.PlanId = price.PlanId;
        subscription.Status = "Active";
        subscription.PeriodStart = due.PeriodStart;
        subscription.PeriodEnd = due.PeriodEnd;
        subscription.NextDueAt = due.PeriodEnd;
        subscription.PendingDueId = null;
        subscription.PendingPlanId = null;
        Touch(subscription);
        AddChange(subscription, "Activated", subscription.PlanId, due.PeriodStart, due.Id);
        await Notify(subscription, "PlanActivated", ct);
    }
    private async Task Free(PlatformSubscription subscription, string reason, DateTimeOffset effectiveAt, CancellationToken ct)
    {
        subscription.PlanId = "Free";
        subscription.Status = "Active";
        subscription.AutoRenew = false;
        subscription.PendingPlanId = null;
        subscription.NextDueAt = null;
        Touch(subscription);
        AddChange(subscription, reason, "Free", effectiveAt);
        await Notify(subscription, reason, ct);
    }
    private async Task<PlatformSubscription> Owned(CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"billing:platform:" + accounts.UserId}, 0))", ct);
        var subscription = (await db.PlatformSubscriptions.FromSqlInterpolated($"SELECT * FROM billing.platform_subscriptions WHERE \"OwnerId\"={accounts.UserId} FOR UPDATE").ToArrayAsync(ct)).SingleOrDefault();
        if (subscription != null)
        {
            await db.Entry(subscription).ReloadAsync(ct);
            return subscription;
        }
        subscription = new()
        {
            Id = Guid.NewGuid(),
            OwnerId = accounts.UserId,
            CreatedAt = clock.GetUtcNow(),
            UpdatedAt = clock.GetUtcNow()
        };
        db.PlatformSubscriptions.Add(subscription);
        await db.SaveChangesAsync(ct);
        AddChange(subscription, "Created", "Free", clock.GetUtcNow());
        return subscription;
    }
    internal async Task<PlanPrice?> ConfiguredPrice(CancellationToken ct, string planId = "Pro")
    {
        var amount = configuration.GetValue<decimal?>("Billing:PlatformPlans:" + planId + ":Amount");
        if (amount == null)
            return null;
        if (amount <= 0 || decimal.Round(amount.Value, 2) != amount)
            throw ApiException.Invalid("Configured plan price must be positive with at most two decimal places.");
        var currency = (configuration["Billing:PlatformPlans:" + planId + ":Currency"] ?? "USD").ToUpperInvariant();
        if (currency.Length != 3 || !currency.All(char.IsAsciiLetter))
            throw ApiException.Invalid("Configured plan currency must be a three-letter code.");
        var terms = configuration["Billing:PlatformPlans:" + planId + ":TermsVersion"] ?? "v1";
        var version = configuration["Billing:PlatformPlans:" + planId + ":PriceVersion"] ?? Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(amount.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) + currency + terms)))[..24];
        if (profiles != null && exchange != null)
        {
            var preferred = await profiles.GetCurrencyAsync(accounts.UserId, ct);
            var quote = await exchange.ConvertAsync(amount.Value, currency, preferred, ct);
            amount = quote.Amount;
            currency = quote.Currency;
            if (quote.Version.Length > 0)
                version = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(version + quote.Version)))[..24];
        }
        if (version.Length is < 1 or > 80 || terms.Length is < 1 or > 80)
            throw ApiException.Invalid("Configured price and terms versions must be bounded.");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"billing:price:" + version}, 0))", ct);
        var price = await db.PlanPrices.SingleOrDefaultAsync(x => x.PlanId == planId && x.Version == version, ct);
        if (price != null)
        {
            if (price.Amount != amount || price.Currency != currency || price.TermsVersion != terms)
                throw ApiException.Conflict("A price version is immutable. Configure a new version.");
            return price;
        }
        price = new()
        {
            Id = Guid.NewGuid(),
            PlanId = planId,
            Amount = amount.Value,
            Currency = currency,
            Version = version,
            TermsVersion = terms,
            CreatedAt = clock.GetUtcNow()
        };
        db.PlanPrices.Add(price);
        await db.SaveChangesAsync(ct);
        return price;
    }
    private async Task<PaymentMethod> Method(Guid id, Guid owner, CancellationToken ct) => await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.ClientId == owner && x.Active, ct) ?? throw ApiException.NotFound();
    private void Touch(PlatformSubscription subscription)
    {
        subscription.Version++;
        subscription.UpdatedAt = clock.GetUtcNow();
    }
    private static void Version(PlatformSubscription subscription, long version)
    {
        if (subscription.Version != version)
            throw ApiException.Conflict("Subscription changed. Refresh before updating.");
    }
    private void AddChange(PlatformSubscription subscription, string type, string plan, DateTimeOffset? effectiveAt, Guid? due = null) => db.PlanChanges.Add(new() { Id = Guid.NewGuid(), SubscriptionId = subscription.Id, Type = type, PlanId = plan, DueId = due, CreatedAt = clock.GetUtcNow(), EffectiveAt = effectiveAt });
    private Task Notify(PlatformSubscription subscription, string type, CancellationToken ct) => notifications.PublishAsync(new(subscription.OwnerId, $"platform:{subscription.Id}:{subscription.Version}:{type}", type, "Billing", "Billing", subscription.Id, "/app/subscription", Required: true), ct);
    private async Task<PlatformSubscriptionDto> Dto(PlatformSubscription subscription, CancellationToken ct)
    {
        var due = subscription.PendingDueId == null ? null : await db.Dues.AsNoTracking().SingleAsync(x => x.Id == subscription.PendingDueId, ct);
        var price = subscription.AcceptedPriceId == null ? null : await db.PlanPrices.AsNoTracking().SingleAsync(x => x.Id == subscription.AcceptedPriceId, ct);
        var eligible = subscription.PaymentMethodId != null && await db.Methods.AsNoTracking().AnyAsync(x => x.Id == subscription.PaymentMethodId && x.ClientId == subscription.OwnerId && x.Active, ct);
        return new(subscription.Id, subscription.PlanId, subscription.Status, subscription.PeriodStart, subscription.PeriodEnd, subscription.NextDueAt, subscription.AutoRenew, subscription.PendingPlanId, subscription.Version, due == null ? null : billing.DueDto(due), price?.Version, price?.TermsVersion, eligible);
    }
}
