using Metrivum.Access.Contracts;
using Metrivum.Access.Domain;
using Metrivum.BuildingBlocks;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Access.Infrastructure;

/// <summary>Reserves, commits and releases durable usage allowances in PostgreSQL with concurrency protection.</summary>
public sealed class UsageReservations(
    AccessDbContext db,
    IPlanEntitlementsProvider plans,
    ModuleTransaction transaction,
    TimeProvider clock
) : IUsageReservations, ILimitUsageProvider
{
    public Task<UsageReceipt> ReserveAsync(
        Guid owner,
        string key,
        string operation,
        long amount,
        TimeSpan lifetime,
        CancellationToken ct,
        Guid? teamId = null
    ) =>
        transaction.RunAsync(
            async token =>
            {
                if (
                    string.IsNullOrWhiteSpace(operation)
                    || operation.Length > 100
                    || amount <= 0
                    || lifetime <= TimeSpan.Zero
                    || lifetime > TimeSpan.FromHours(2)
                )
                    throw ApiException.Invalid("Invalid usage reservation.");
                var plan = teamId is { } team
                    ? await plans.GetForTeamAsync(owner, team, token)
                    : await plans.GetAsync(owner, token);
                if (!plan.Limits.TryGetValue(key, out var maximum))
                    throw ApiException.Invalid("Unknown usage limit.");
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock(hashtextextended({"usage:" + plan.ScopeId + ":" + key}, 0))",
                    token
                );
                var previous = await db.Usage.SingleOrDefaultAsync(
                    x => x.OwnerId == owner && x.Key == key && x.Operation == operation,
                    token
                );
                if (previous != null)
                {
                    if (
                        previous.ScopeId != plan.ScopeId
                        || previous.Amount != amount
                        || previous.Status == "Released"
                        || previous.Status == "Reserved" && previous.ExpiresAt <= clock.GetUtcNow()
                    )
                        throw ApiException.Conflict(
                            "This operation has expired or uses different quota terms. Start a new operation."
                        );
                    return Receipt(previous, maximum);
                }
                var now = clock.GetUtcNow();
                var used = await db
                    .Usage.Where(x =>
                        x.ScopeId == plan.ScopeId
                        && x.Key == key
                        && x.PeriodStart == plan.PeriodStart
                        && (x.Status == "Settled" || x.Status == "Reserved" && x.ExpiresAt > now)
                    )
                    .SumAsync(x => x.Amount, token);
                if (maximum is { } cap && (amount > cap || used > cap - amount))
                    throw new ApiException(
                        409,
                        "LIMIT_EXCEEDED",
                        $"{key}: used {used}, limit {cap}; resets {plan.PeriodEnd:O}.",
                        new Dictionary<string, string[]>
                        {
                            ["limitKey"] = [key],
                            ["used"] =
                            [
                                used.ToString(System.Globalization.CultureInfo.InvariantCulture),
                            ],
                            ["maximum"] =
                            [
                                cap.ToString(System.Globalization.CultureInfo.InvariantCulture),
                            ],
                            ["resetAt"] = [plan.PeriodEnd.ToString("O")],
                        }
                    );
                var row = new UsageReservation
                {
                    Id = Guid.NewGuid(),
                    OwnerId = owner,
                    ScopeId = plan.ScopeId,
                    Key = key,
                    Operation = operation,
                    PeriodStart = plan.PeriodStart,
                    PeriodEnd = plan.PeriodEnd,
                    Amount = amount,
                    CreatedAt = now,
                    ExpiresAt = now.Add(lifetime),
                };
                db.Usage.Add(row);
                await db.SaveChangesAsync(token);
                return Receipt(row, maximum);
            },
            ct
        );

    public Task SettleAsync(
        Guid owner,
        string key,
        string operation,
        long amount,
        CancellationToken ct,
        string? consumer = null
    ) =>
        transaction.RunAsync(
            async token =>
            {
                var row = await Locked(owner, key, operation, token);
                if (row.Status == "Settled")
                {
                    if (row.Amount != amount || row.Consumer != consumer)
                        throw ApiException.Conflict(
                            "Usage was already settled for another result or amount."
                        );
                    return;
                }
                if (row.Status == "Reserved" && row.ExpiresAt <= clock.GetUtcNow())
                    throw new ApiException(
                        409,
                        "USAGE_RESERVATION_EXPIRED",
                        "The usage reservation expired. Authorize synchronization against the current period."
                    );
                if (row.Status != "Reserved" || amount < 0 || amount > row.Amount)
                    throw ApiException.Conflict(
                        "The usage reservation is unavailable or the measured usage exceeds its budget."
                    );
                row.Amount = amount;
                row.Consumer = consumer;
                row.Status = "Settled";
                await db.SaveChangesAsync(token);
            },
            ct
        );

    public Task ReleaseAsync(Guid owner, string key, string operation, CancellationToken ct) =>
        transaction.RunAsync(
            async token =>
            {
                var row = await Locked(owner, key, operation, token);
                if (row.Status != "Reserved")
                    return;
                row.Status = "Released";
                await db.SaveChangesAsync(token);
            },
            ct
        );

    public Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken ct) =>
        GetScopedUsageAsync(ownerId, null, ct);

    public async Task<IReadOnlyList<LimitDecision>> GetScopedUsageAsync(
        Guid ownerId,
        Guid? teamId,
        CancellationToken ct
    )
    {
        var plan = teamId is { } team
            ? await plans.GetForTeamAsync(ownerId, team, ct)
            : await plans.GetAsync(ownerId, ct);
        var now = clock.GetUtcNow();
        var usage = await db
            .Usage.AsNoTracking()
            .Where(x =>
                x.ScopeId == plan.ScopeId
                && x.PeriodStart == plan.PeriodStart
                && (x.Status == "Settled" || x.Status == "Reserved" && x.ExpiresAt > now)
            )
            .GroupBy(x => x.Key)
            .Select(x => new { Key = x.Key, Amount = x.Sum(r => r.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
        return plan
            .Limits.Where(x => x.Key.EndsWith("_per_period", StringComparison.Ordinal))
            .Select(x => new LimitDecision(
                x.Key,
                x.Value,
                usage.GetValueOrDefault(x.Key),
                plan.PeriodEnd
            ))
            .ToArray();
    }

    private async Task<UsageReservation> Locked(
        Guid owner,
        string key,
        string operation,
        CancellationToken ct
    ) =>
        (
            await db
                .Usage.FromSqlInterpolated(
                    $"SELECT * FROM access.usage_reservations WHERE \"OwnerId\"={owner} AND \"Key\"={key} AND \"Operation\"={operation} FOR UPDATE"
                )
                .ToArrayAsync(ct)
        ).SingleOrDefault()
        ?? throw ApiException.Conflict("Authorize the operation before execution.");

    private static UsageReceipt Receipt(UsageReservation row, long? cap) =>
        new(row.Id, row.Key, row.Status, row.Amount, cap, row.PeriodEnd);
}
