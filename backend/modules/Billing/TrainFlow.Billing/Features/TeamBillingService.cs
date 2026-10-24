using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications.Contracts;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.Billing.Features;

public sealed record TeamCheckoutQuoteRequest(string TeamName, int PurchasedSeats, string PriceVersion, bool AutoRenew = false, Guid? PaymentMethodId = null);
public sealed record TeamPaymentConfirmRequest(Guid QuoteId, string IdempotencyKey, Guid? PaymentMethodId = null);
public sealed record TeamSeatQuoteRequest(int PurchasedSeats, long Version);
public sealed record TeamRenewalRequest(long Version, bool AutoRenew, Guid? PaymentMethodId = null);
public sealed record TeamBillingQuoteDto(Guid Id, Guid TeamId, string TeamName, string Kind, string Status, int PurchasedSeats,
    decimal UnitPrice, decimal GrossAmount, decimal CreditAmount, decimal AmountDue, string Currency, string PriceVersion,
    string TermsVersion, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, Guid? DueId, DateTimeOffset? ConfirmedAt);
public sealed record TeamBillingDto(Guid TeamId, string Status, int PurchasedSeats, int OccupiedSeats, int? PendingSeats,
    DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd, bool AutoRenew, long Version, decimal UnitPrice, string Currency,
    bool RenewalMethodEligible, IReadOnlyList<TeamBillingQuoteDto> History);

public sealed class TeamBillingService(BillingDbContext db, BillingService billing, PlatformSubscriptionService platform,
    IAccountContext accounts, ModuleTransaction transaction, TimeProvider clock, INotificationPublisher notifications, IAbuseProtection? abuse = null)
{
    public Task<TeamBillingQuoteDto> QuoteAsync(TeamCheckoutQuoteRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        Seats(request.PurchasedSeats);
        if (string.IsNullOrWhiteSpace(request.TeamName) || request.TeamName.Trim().Length > 80)
            throw ApiException.Invalid("A Team name of up to 80 characters is required.");
        await UserLock(token);
        await NoMembership(token);
        var pro = await Personal(token);
        var price = await platform.ConfiguredPrice(token, "Team") ?? throw ApiException.Conflict("Team seat price is not configured.");
        if (price.Version != request.PriceVersion)
            throw ApiException.Conflict("Team price changed. Review the current price.");
        await RenewalMethod(request.AutoRenew, request.PaymentMethodId, accounts.UserId, token);
        var quote = NewQuote(Guid.NewGuid(), "Initial", request.PurchasedSeats, price, clock.GetUtcNow());
        quote.TeamName = request.TeamName.Trim();
        quote.AutoRenew = request.AutoRenew;
        quote.PaymentMethodId = request.PaymentMethodId;
        if (pro is { PlanId: "Pro", PeriodStart: not null, PeriodEnd: not null } && pro.PeriodEnd > quote.CreatedAt)
        {
            quote.SourceSubscriptionId = pro.Id;
            quote.SourcePeriodStart = pro.PeriodStart;
            quote.SourcePeriodEnd = pro.PeriodEnd;
            var source = await (from change in db.PlanChanges.AsNoTracking()
                                join due in db.Dues.AsNoTracking() on change.DueId equals due.Id
                                join payment in db.Payments.AsNoTracking() on due.Id equals payment.DueId
                                where change.SubscriptionId == pro.Id && change.Type == "Activated" && change.PlanId == "Pro"
                                    && due.PeriodStart == pro.PeriodStart && due.PeriodEnd == pro.PeriodEnd
                                    && payment.Context == BillingContext.Platform && payment.ClientId == accounts.UserId && payment.AttemptId != null
                                orderby payment.SettledAt descending
                                select payment).FirstOrDefaultAsync(token);
            if (source != null && source.GrossAmount > 0)
            {
                if (source.Currency != price.Currency)
                    throw ApiException.Conflict("Pro and Team currencies differ. Upgrade requires compatible currencies; no currency conversion is applied to credit.");
                if (await db.Set<ProrationCredit>().AnyAsync(x => x.SourcePaymentId == source.Id, token))
                    throw ApiException.Conflict("This Pro paid period has already funded an upgrade.");
                quote.SourceSubscriptionId = pro.Id;
                quote.SourcePaymentId = source.Id;
                quote.SourcePeriodStart = pro.PeriodStart;
                quote.SourcePeriodEnd = pro.PeriodEnd;
                quote.CreditAmount = TeamBillingRules.UnusedValue(source.GrossAmount, pro.PeriodStart.Value, pro.PeriodEnd.Value, quote.CreatedAt);
            }
        }
        quote.AmountDue = TeamBillingRules.AmountDue(quote.GrossAmount, quote.CreditAmount);
        db.Set<TeamBillingQuote>().Add(quote);
        await db.SaveChangesAsync(token);
        return QuoteDto(quote, price);
    }, ct);

    public Task<TeamBillingDto> ConfirmAsync(TeamPaymentConfirmRequest request, CancellationToken ct) => Confirm(null, request, ct);
    public Task<TeamBillingDto> SeatConfirmAsync(Guid teamId, TeamPaymentConfirmRequest request, CancellationToken ct) => Confirm(teamId, request, ct);

    private Task<TeamBillingDto> Confirm(Guid? requestedTeam, TeamPaymentConfirmRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        abuse?.Require(accounts.UserId, AbusePolicies.Payment);
        await accounts.RequireCoachAsync(token);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 100)
            throw ApiException.Invalid("A bounded idempotency key is required.");
        await UserLock(token);
        var personal = await Personal(token);
        var quote = await db.Set<TeamBillingQuote>().SingleOrDefaultAsync(x => x.Id == request.QuoteId && x.OwnerId == accounts.UserId, token) ?? throw ApiException.NotFound();
        await db.Entry(quote).ReloadAsync(token);
        if (requestedTeam != null && quote.TeamId != requestedTeam || requestedTeam == null && quote.Kind != "Initial")
            throw ApiException.NotFound();
        await TeamLock(quote.TeamId, token);
        if (quote.Status == "Confirmed")
        {
            await OwnedTeam(quote.TeamId, token);
            if (quote.DueId is { } settledDue)
            {
                var previous = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == settledDue && x.IdempotencyKey == request.IdempotencyKey, token);
                if (previous != null && previous.PaymentMethodId != request.PaymentMethodId)
                    throw ApiException.Conflict("Idempotency key was used with another payment method.");
            }
            return await Dto(quote.TeamId, token);
        }
        if (quote.ExpiresAt <= clock.GetUtcNow())
            throw ApiException.Conflict("Quote expired. Request a new quote.");
        var price = await db.PlanPrices.SingleAsync(x => x.Id == quote.PriceId, token);
        if (quote.Kind == "Initial")
        {
            var currentPrice = await platform.ConfiguredPrice(token, "Team") ?? throw ApiException.Conflict("Team seat price is not configured.");
            if (currentPrice.Id != price.Id)
                throw ApiException.Conflict("Team price changed. Request a new quote.");
            await RenewalMethod(quote.AutoRenew, quote.PaymentMethodId, accounts.UserId, token);
        }
        TeamPlatformSubscription? subscription = null;
        if (quote.Kind == "Initial")
        {
            await NoMembership(token);
            if (quote.SourceSubscriptionId != null && (personal == null || personal.Id != quote.SourceSubscriptionId || personal.PlanId != "Pro" || personal.PeriodStart != quote.SourcePeriodStart || personal.PeriodEnd != quote.SourcePeriodEnd || personal.PeriodEnd <= clock.GetUtcNow()))
                throw ApiException.Conflict("The quoted Pro paid period changed. Request a new quote.");
            if (quote.SourcePaymentId != null && await db.Set<ProrationCredit>().AnyAsync(x => x.SourcePaymentId == quote.SourcePaymentId, token))
                throw ApiException.Conflict("This Pro paid period has already been credited.");
            // A newly paid Pro period must be quoted before it can be terminated by an upgrade.
            if (quote.SourceSubscriptionId == null && personal is { PlanId: "Pro", PeriodEnd: not null } && personal.PeriodEnd > clock.GetUtcNow())
                throw ApiException.Conflict("Your Pro subscription changed or has no eligible settlement. Review a new quote before upgrading.");
        }
        else
        {
            var team = await OwnedTeam(quote.TeamId, token);
            subscription = await Subscription(team.Id, token);
            if (subscription.Version != quote.SubscriptionVersion)
                throw ApiException.Conflict("Team billing changed. Request a new quote.");
            if (team.Status == "DissolutionScheduled")
                throw ApiException.Conflict("Cancel scheduled dissolution before changing billing.");
            if (quote.Kind == "Seats" && (subscription.PeriodEnd <= clock.GetUtcNow() || subscription.Status != "Active"))
                throw ApiException.Conflict("The paid Team period ended. Renew before buying seats.");
            var occupied = await Occupied(team.Id, token);
            if (quote.PurchasedSeats < occupied)
                throw ApiException.Conflict("Purchased seats cannot be lower than occupied seats.");
        }
        if (quote.Kind == "Decrease")
        {
            subscription!.PendingSeats = quote.PurchasedSeats == subscription.PurchasedSeats ? null : quote.PurchasedSeats;
            subscription.Version++;
            quote.Status = "Confirmed";
            quote.ConfirmedAt = clock.GetUtcNow();
            await notifications.PublishAsync(new(accounts.UserId, $"team-seats:{quote.TeamId}:{subscription.Version}",
                subscription.PendingSeats == null ? "TeamSeatReductionCancelled" : "TeamSeatReductionScheduled", "Billing", "Team", quote.TeamId, "/app/team", Required: true), token);
            await db.SaveChangesAsync(token);
            return await Dto(quote.TeamId, token);
        }
        var method = request.PaymentMethodId == null ? null : await Method(request.PaymentMethodId.Value, accounts.UserId, token);
        var due = quote.DueId == null ? null : await db.Dues.SingleAsync(x => x.Id == quote.DueId, token);
        if (due != null)
        {
            var attempt = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.DueId == due.Id && x.IdempotencyKey == request.IdempotencyKey, token);
            if (attempt != null)
            {
                if (attempt.PaymentMethodId != request.PaymentMethodId)
                    throw ApiException.Conflict("Idempotency key was used with another payment method.");
                throw ApiException.Conflict("This payment attempt failed. Retry with a new idempotency key.");
            }
        }
        else
            due = await NewDue(quote, price, subscription, token);
        var result = await billing.Charge(due, method, request.IdempotencyKey, accounts.UserId, token, startNewPlatformPeriod: quote.Kind != "Seats");
        if (result.Status != AttemptStatus.Succeeded)
        {
            await db.SaveChangesAsync(token);
            // Commit the failed attempt and leave the quote available for a fresh payment attempt.
            return new TeamBillingDto(quote.TeamId, "PaymentFailed", quote.PurchasedSeats, 0, null, due.PeriodStart, due.PeriodEnd!.Value, quote.AutoRenew, subscription?.Version ?? 0, price.Amount, price.Currency, false, [QuoteDto(quote, price)]);
        }
        var at = due.SettledAt!.Value;
        if (quote.Kind == "Initial")
        {
            db.Teams.Add(new Team { Id = quote.TeamId, OwnerId = accounts.UserId, Name = quote.TeamName, Status = "Active", CreatedAt = at });
            db.TeamMemberships.Add(new TeamMembership { TeamId = quote.TeamId, UserId = accounts.UserId, Role = "Owner", Status = "Active", JoinedAt = at });
            subscription = new TeamPlatformSubscription { TeamId = quote.TeamId, PurchasedSeats = quote.PurchasedSeats, AcceptedPriceId = price.Id, PeriodStart = due.PeriodStart, PeriodEnd = due.PeriodEnd!.Value, AutoRenew = quote.AutoRenew, PaymentMethodId = quote.PaymentMethodId };
            db.Set<TeamPlatformSubscription>().Add(subscription);
            if (quote.SourcePaymentId is { } source && personal != null)
                db.Set<ProrationCredit>().Add(new()
                {
                    Id = Guid.NewGuid(),
                    QuoteId = quote.Id,
                    OrderId = due.OrderId,
                    SourceSubscriptionId = personal.Id,
                    SourcePaymentId = source,
                    SourcePeriodStart = quote.SourcePeriodStart!.Value,
                    SourcePeriodEnd = quote.SourcePeriodEnd!.Value,
                    Amount = quote.CreditAmount,
                    Currency = quote.Currency,
                    CreatedAt = at
                });
            if (personal is { PlanId: "Pro" })
            {
                personal.PlanId = "Free";
                personal.Status = "Upgraded";
                personal.PeriodEnd = at;
                personal.NextDueAt = null;
                personal.AutoRenew = false;
                personal.PendingPlanId = null;
                if (personal.PendingDueId is { } pending)
                    await notifications.CancelScheduledAsync("Billing", pending, token);
                personal.PendingDueId = null;
                personal.Version++;
                personal.UpdatedAt = at;
                db.PlanChanges.Add(new()
                {
                    Id = Guid.NewGuid(),
                    SubscriptionId = personal.Id,
                    Type = "Upgraded",
                    PlanId = "Team",
                    DueId = due.Id,
                    CreatedAt = at,
                    EffectiveAt = at
                });
            }
        }
        else
        {
            subscription!.PurchasedSeats = quote.PurchasedSeats;
            subscription.PendingSeats = null;
            subscription.Version++;
            if (quote.Kind == "Renewal")
            {
                subscription.PeriodStart = due.PeriodStart;
                subscription.PeriodEnd = due.PeriodEnd!.Value;
                subscription.Status = "Active";
                var team = await db.Teams.SingleAsync(x => x.Id == quote.TeamId, token);
                team.Status = "Active";
                team.Version++;
            }
        }
        quote.Status = "Confirmed";
        quote.ConfirmedAt = at;
        await notifications.PublishAsync(new(accounts.UserId, "team-billing:" + quote.Id, "TeamPaymentConfirmed", "Billing", "Team", quote.TeamId, "/app/team", Required: true), token);
        await db.SaveChangesAsync(token);
        return await Dto(quote.TeamId, token);
    }, ct);

    public Task<TeamBillingDto> BillingAsync(Guid teamId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        await TeamLock(teamId, token);
        await OwnedTeam(teamId, token);
        return await Dto(teamId, token);
    }, ct);

    public Task<TeamBillingQuoteDto> SeatQuoteAsync(Guid teamId, TeamSeatQuoteRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        Seats(request.PurchasedSeats);
        await TeamLock(teamId, token);
        var team = await OwnedTeam(teamId, token);
        var subscription = await Subscription(teamId, token);
        if (subscription.Version != request.Version)
            throw ApiException.Conflict("Team billing changed. Refresh before updating.");
        if (team.Status == "DissolutionScheduled")
            throw ApiException.Conflict("Cancel scheduled dissolution before changing seats.");
        if (subscription.PeriodEnd <= clock.GetUtcNow())
            throw ApiException.Conflict("Renew the Team before changing seats.");
        if (request.PurchasedSeats < await Occupied(teamId, token))
            throw ApiException.Conflict("Purchased seats cannot be lower than occupied seats.");
        if (request.PurchasedSeats == subscription.PurchasedSeats && subscription.PendingSeats == null)
            throw ApiException.Invalid("Choose a different seat quantity.");
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, token);
        var quote = NewQuote(teamId, request.PurchasedSeats <= subscription.PurchasedSeats ? "Decrease" : "Seats", request.PurchasedSeats, price, clock.GetUtcNow());
        quote.SubscriptionVersion = subscription.Version;
        quote.GrossAmount = quote.Kind == "Decrease" ? 0 : TeamBillingRules.UnusedValue(price.Amount * (request.PurchasedSeats - subscription.PurchasedSeats), subscription.PeriodStart, subscription.PeriodEnd, quote.CreatedAt);
        quote.AmountDue = quote.GrossAmount;
        quote.TeamName = team.Name;
        db.Set<TeamBillingQuote>().Add(quote);
        await db.SaveChangesAsync(token);
        return QuoteDto(quote, price);
    }, ct);

    public Task<TeamBillingQuoteDto> RenewalQuoteAsync(Guid teamId, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        await TeamLock(teamId, token);
        var team = await OwnedTeam(teamId, token);
        var subscription = await Subscription(teamId, token);
        if (team.Status == "DissolutionScheduled")
            throw ApiException.Conflict("Cancel scheduled dissolution before renewal.");
        if (subscription.PeriodEnd > clock.GetUtcNow())
            throw ApiException.Conflict("The current Team period is still paid.");
        await Expire(subscription, token);
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, token);
        var quote = NewQuote(teamId, "Renewal", Math.Max(subscription.PendingSeats ?? subscription.PurchasedSeats, await Occupied(teamId, token)), price, clock.GetUtcNow());
        quote.TeamName = team.Name;
        quote.SubscriptionVersion = subscription.Version;
        db.Set<TeamBillingQuote>().Add(quote);
        await db.SaveChangesAsync(token);
        return QuoteDto(quote, price);
    }, ct);

    public Task<TeamBillingDto> RenewalAsync(Guid teamId, TeamRenewalRequest request, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await accounts.RequireCoachAsync(token);
        await TeamLock(teamId, token);
        var team = await OwnedTeam(teamId, token);
        var subscription = await Subscription(teamId, token);
        if (subscription.Version != request.Version)
            throw ApiException.Conflict("Team billing changed. Refresh before updating.");
        if (request.AutoRenew && team.Status == "DissolutionScheduled")
            throw ApiException.Conflict("Cancel scheduled dissolution before enabling renewal.");
        await RenewalMethod(request.AutoRenew, request.PaymentMethodId, accounts.UserId, token);
        subscription.AutoRenew = request.AutoRenew;
        subscription.PaymentMethodId = request.AutoRenew ? request.PaymentMethodId : null;
        subscription.Version++;
        await notifications.PublishAsync(new(accounts.UserId, $"team-renewal-preference:{teamId}:{subscription.Version}",
            request.AutoRenew ? "TeamRenewalEnabled" : "TeamRenewalCancelled", "Billing", "Team", teamId, "/app/team", Required: true), token);
        await db.SaveChangesAsync(token);
        return await Dto(teamId, token);
    }, ct);

    public async Task<int> ProcessRenewalsAsync(int maximum, CancellationToken ct)
    {
        var ids = await db.Set<TeamPlatformSubscription>().AsNoTracking().Where(x => x.Status == "Active" && x.PeriodEnd <= clock.GetUtcNow()).OrderBy(x => x.PeriodEnd).Select(x => x.TeamId).Take(maximum).ToArrayAsync(ct);
        foreach (var id in ids)
            await transaction.RunAsync(async token =>
        {
            await TeamLock(id, token);
            var subscription = await Subscription(id, token);
            var team = await db.Teams.SingleAsync(x => x.Id == id, token);
            await db.Entry(team).ReloadAsync(token);
            if (subscription.Status != "Active" || subscription.PeriodEnd > clock.GetUtcNow() || team.Status is "Dissolved" or "DissolutionScheduled")
                return;
            if (subscription.AutoRenew && subscription.PaymentMethodId is { } methodId)
            {
                var method = await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == methodId && x.ClientId == team.OwnerId && x.Active, token);
                if (method != null)
                {
                    var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, token);
                    var quote = NewQuote(id, "Renewal", Math.Max(subscription.PendingSeats ?? subscription.PurchasedSeats, await Occupied(id, token)), price, clock.GetUtcNow(), team.OwnerId);
                    quote.OwnerId = team.OwnerId;
                    quote.TeamName = team.Name;
                    quote.SubscriptionVersion = subscription.Version;
                    db.Set<TeamBillingQuote>().Add(quote);
                    var due = await NewDue(quote, price, subscription, token);
                    var result = await billing.Charge(due, method, "team-renewal:" + due.Id, null, token, startNewPlatformPeriod: true);
                    if (result.Status == AttemptStatus.Succeeded)
                    {
                        subscription.PeriodStart = due.PeriodStart;
                        subscription.PeriodEnd = due.PeriodEnd!.Value;
                        subscription.PurchasedSeats = quote.PurchasedSeats;
                        subscription.PendingSeats = null;
                        subscription.Version++;
                        quote.Status = "Confirmed";
                        quote.ConfirmedAt = due.SettledAt;
                        await db.SaveChangesAsync(token);
                        return;
                    }
                }
            }
            await Expire(subscription, token);
            await db.SaveChangesAsync(token);
        }, ct);
        return ids.Length;
    }

    private async Task Expire(TeamPlatformSubscription subscription, CancellationToken ct)
    {
        if (subscription.PeriodEnd > clock.GetUtcNow() || subscription.Status != "Active")
            return;
        var team = await db.Teams.SingleAsync(x => x.Id == subscription.TeamId, ct);
        if (team.Status is "Dissolved" or "DissolutionScheduled")
            return;
        subscription.Status = "BillingInactive";
        subscription.Version++;
        team.Status = "BillingInactive";
        team.Version++;
        await notifications.PublishAsync(new(team.OwnerId, $"team-expired:{team.Id}:{subscription.PeriodEnd:O}", "TeamBillingInactive", "Billing", "Team", team.Id, "/app/team", Required: true), ct);
    }
    private async Task<PaymentDue> NewDue(TeamBillingQuote quote, PlanPrice price, TeamPlatformSubscription? subscription, CancellationToken ct)
    {
        var start = UtcNow();
        var end = quote.Kind == "Seats" ? subscription!.PeriodEnd : start.AddMonths(1);
        var order = new Order
        {
            Id = Guid.NewGuid(),
            Context = BillingContext.Platform,
            ServiceId = Guid.NewGuid(),
            CoachId = quote.OwnerId,
            ClientId = quote.OwnerId,
            Name = "Metrivum Team " + quote.Kind,
            Amount = quote.AmountDue,
            CoachNetAmount = quote.AmountDue,
            Currency = quote.Currency,
            SettlementMode = SettlementMode.Simulated,
            StartedAt = start,
            CreatedAt = start,
            OptionSnapshot = JsonSerializer.Serialize(new { PlanId = "Team", quote.TeamId, quote.Id, quote.Kind, quote.PurchasedSeats, UnitPrice = price.Amount, quote.GrossAmount, quote.CreditAmount, quote.AmountDue, price.Version, price.TermsVersion, quote.SourcePaymentId })
        };
        var due = new PaymentDue { Id = Guid.NewGuid(), Context = BillingContext.Platform, OrderId = order.Id, ServiceId = order.ServiceId, CoachId = quote.OwnerId, ClientId = quote.OwnerId, Amount = quote.AmountDue, CoachNetAmount = quote.AmountDue, Currency = quote.Currency, SettlementMode = SettlementMode.Simulated, PeriodStart = start, PeriodEnd = end, DueAt = start, CreatedAt = start };
        db.Orders.Add(order);
        db.Dues.Add(due);
        await db.SaveChangesAsync(ct);
        quote.DueId = due.Id;
        await db.SaveChangesAsync(ct);
        return due;
    }
    private TeamBillingQuote NewQuote(Guid team, string kind, int seats, PlanPrice price, DateTimeOffset at, Guid? owner = null) => new() { Id = Guid.NewGuid(), OwnerId = owner ?? accounts.UserId, TeamId = team, Kind = kind, PurchasedSeats = seats, PriceId = price.Id, GrossAmount = price.Amount * seats, AmountDue = price.Amount * seats, Currency = price.Currency, CreatedAt = at, ExpiresAt = at.AddMinutes(15) };
    private async Task<TeamBillingDto> Dto(Guid id, CancellationToken ct)
    {
        var subscription = await Subscription(id, ct);
        var price = await db.PlanPrices.SingleAsync(x => x.Id == subscription.AcceptedPriceId, ct);
        var quotes = await db.Set<TeamBillingQuote>().AsNoTracking().Where(x => x.TeamId == id).OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync(ct);
        var prices = await db.PlanPrices.Where(x => quotes.Select(q => q.PriceId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var team = await db.Teams.SingleAsync(x => x.Id == id, ct);
        var eligible = subscription.PaymentMethodId != null && await db.Methods.AnyAsync(x => x.Id == subscription.PaymentMethodId && x.ClientId == team.OwnerId && x.Active, ct);
        return new(id, subscription.PeriodEnd <= clock.GetUtcNow() ? "BillingInactive" : subscription.Status, subscription.PurchasedSeats, await Occupied(id, ct), subscription.PendingSeats, subscription.PeriodStart, subscription.PeriodEnd, subscription.AutoRenew, subscription.Version, price.Amount, price.Currency, eligible, quotes.Select(x => QuoteDto(x, prices[x.PriceId])).ToArray());
    }
    private static TeamBillingQuoteDto QuoteDto(TeamBillingQuote q, PlanPrice p) => new(q.Id, q.TeamId, q.TeamName, q.Kind, q.Status, q.PurchasedSeats, p.Amount, q.GrossAmount, q.CreditAmount, q.AmountDue, q.Currency, p.Version, p.TermsVersion, q.CreatedAt, q.ExpiresAt, q.DueId, q.ConfirmedAt);
    private async Task<Team> OwnedTeam(Guid id, CancellationToken ct)
    {
        var team = await db.Teams.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == accounts.UserId && x.Status != "Dissolved", ct) ?? throw ApiException.NotFound();
        if (db.Entry(team).State == EntityState.Unchanged)
            await db.Entry(team).ReloadAsync(ct);
        if (team.OwnerId != accounts.UserId || team.Status == "Dissolved")
            throw ApiException.NotFound();
        return team;
    }
    private async Task<TeamPlatformSubscription> Subscription(Guid id, CancellationToken ct)
    {
        var subscription = await db.Set<TeamPlatformSubscription>().SingleOrDefaultAsync(x => x.TeamId == id, ct) ?? throw ApiException.NotFound();
        if (db.Entry(subscription).State == EntityState.Unchanged)
            await db.Entry(subscription).ReloadAsync(ct);
        return subscription;
    }
    private Task<int> Occupied(Guid id, CancellationToken ct) => db.TeamMemberships.CountAsync(x => x.TeamId == id && x.Status == "Active", ct);
    private async Task NoMembership(CancellationToken ct)
    {
        if (await db.TeamMemberships.AnyAsync(x => x.UserId == accounts.UserId && x.Status == "Active", ct))
            throw ApiException.Conflict("Leave your current Team before purchasing another Team.");
    }
    private async Task<PlatformSubscription?> Personal(CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"billing:platform:" + accounts.UserId}, 0))", ct);
        var row = (await db.PlatformSubscriptions.FromSqlInterpolated($"SELECT * FROM billing.platform_subscriptions WHERE \"OwnerId\"={accounts.UserId} FOR UPDATE").ToArrayAsync(ct)).SingleOrDefault();
        if (row != null)
            await db.Entry(row).ReloadAsync(ct);
        return row;
    }
    private Task UserLock(CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:user:" + accounts.UserId}, 0))", ct);
    private Task TeamLock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + id}, 0))", ct);
    private async Task<PaymentMethod> Method(Guid id, Guid owner, CancellationToken ct) => await db.Methods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.ClientId == owner && x.Active, ct) ?? throw ApiException.NotFound();
    private async Task RenewalMethod(bool renew, Guid? method, Guid owner, CancellationToken ct)
    {
        if (renew && method == null)
            throw ApiException.Invalid("Automatic renewal requires an explicitly selected simulated payment method.");
        if (method is { } id)
            _ = await Method(id, owner, ct);
    }
    private static void Seats(int seats)
    {
        if (seats is < 1 or > 10000)
            throw ApiException.Invalid("Choose between 1 and 10000 purchased seats.");
    }
    private DateTimeOffset UtcNow() => new(clock.GetUtcNow().UtcTicks / 10 * 10, TimeSpan.Zero);
}
