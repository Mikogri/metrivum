using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Metrivum.Access.Contracts;
using Metrivum.Access.Infrastructure;
using Metrivum.BuildingBlocks;

namespace Metrivum.IntegrationTests;

public sealed class UsageReservationTests
{
    private const string Local = "video.local_analyses_per_period";
    [CatalogPostgresFact]
    public async Task A_provider_aborted_transaction_does_not_mask_the_original_failure()
    {
        await using var services = Services(new Clock(), 2);
        await using var scope = services.CreateAsyncScope();
        _ = scope.ServiceProvider.GetRequiredService<AccessDbContext>();
        var transaction = scope.ServiceProvider.GetRequiredService<ModuleTransaction>();
        var original = new InvalidDataException("original operation failure");
        var error = await Assert.ThrowsAsync<InvalidDataException>(() => transaction.RunAsync(async _ =>
        {
            await transaction.Connection.CloseAsync();
            throw original;
        }, default));
        Assert.Same(original, error);
    }
    [CatalogPostgresFact]
    public async Task Concurrent_reservations_cannot_overspend_and_failed_attempt_releases_capacity()
    {
        var owner = Guid.NewGuid();
        var clock = new Clock();
        await using var services = Services(clock, 2);
        var keys = Enumerable.Range(0, 8).Select(_ => Guid.NewGuid().ToString()).ToArray();
        var tasks = keys.Select(async key =>
        {
            await using var scope = services.CreateAsyncScope();
            try { await Ledger(scope).ReserveAsync(owner, Local, key, 1, TimeSpan.FromMinutes(10), default); return key; }
            catch (ApiException e) when (e.Code == "LIMIT_EXCEEDED") { return null; }
        });
        var accepted = (await Task.WhenAll(tasks)).OfType<string>().ToArray();
        Assert.Equal(2, accepted.Length);
        await using var change = services.CreateAsyncScope();
        await Ledger(change).ReleaseAsync(owner, Local, accepted[0], default);
        await Ledger(change).ReserveAsync(owner, Local, "replacement", 1, TimeSpan.FromMinutes(10), default);
        await Ledger(change).SettleAsync(owner, Local, "replacement", 1, default, "result-a");
        await Ledger(change).SettleAsync(owner, Local, "replacement", 1, default, "result-a");
        Assert.Equal("CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => Ledger(change).SettleAsync(owner, Local, "replacement", 1, default, "result-b"))).Code);
    }

    [CatalogPostgresFact]
    public async Task Monthly_periods_reset_but_replays_and_timezone_offsets_do_not_reset_usage()
    {
        var owner = Guid.NewGuid();
        var clock = new Clock();
        await using var services = Services(clock, 2);
        await using var scope = services.CreateAsyncScope();
        var ledger = Ledger(scope);
        foreach (var key in new[] { "first", "second" })
        {
            await ledger.ReserveAsync(owner, Local, key, 1, TimeSpan.FromMinutes(10), default);
            await ledger.SettleAsync(owner, Local, key, 1, default);
        }
        await Assert.ThrowsAsync<ApiException>(() => ledger.ReserveAsync(owner, Local, "third", 1, TimeSpan.FromMinutes(10), default));
        clock.Now = clock.Now.ToOffset(TimeSpan.FromHours(-11));
        await Assert.ThrowsAsync<ApiException>(() => ledger.ReserveAsync(owner, Local, "timezone", 1, TimeSpan.FromMinutes(10), default));
        clock.Now = new(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);
        var prior = await ledger.ReserveAsync(owner, Local, "first", 1, TimeSpan.FromMinutes(10), default);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), prior.ResetAt);
        await ledger.ReserveAsync(owner, Local, "new-period-a", 1, TimeSpan.FromMinutes(10), default);
        await ledger.ReserveAsync(owner, Local, "new-period-b", 1, TimeSpan.FromMinutes(10), default);
        await Assert.ThrowsAsync<ApiException>(() => ledger.ReserveAsync(owner, Local, "new-period-c", 1, TimeSpan.FromMinutes(10), default));
    }

    [CatalogPostgresFact]
    public async Task Expired_holds_cannot_settle_or_be_reused_but_do_not_consume_capacity()
    {
        var owner = Guid.NewGuid();
        var clock = new Clock();
        await using var services = Services(clock, 1);
        await using var scope = services.CreateAsyncScope();
        var ledger = Ledger(scope);
        await ledger.ReserveAsync(owner, Local, "expired", 1, TimeSpan.FromMinutes(1), default);
        clock.Now = clock.Now.AddMinutes(2);
        await Assert.ThrowsAsync<ApiException>(() => ledger.SettleAsync(owner, Local, "expired", 1, default));
        await Assert.ThrowsAsync<ApiException>(() => ledger.ReserveAsync(owner, Local, "expired", 1, TimeSpan.FromMinutes(1), default));
        await ledger.ReserveAsync(owner, Local, "fresh", 1, TimeSpan.FromMinutes(1), default);
        await Assert.ThrowsAsync<ApiException>(() => ledger.SettleAsync(Guid.NewGuid(), Local, "fresh", 1, default));
        await ledger.SettleAsync(owner, Local, "fresh", 1, default);
        await ledger.ReleaseAsync(owner, Local, "fresh", default);
        await Assert.ThrowsAsync<ApiException>(() => ledger.ReserveAsync(owner, Local, "no-refund-after-success", 1, TimeSpan.FromMinutes(1), default));
    }

    [CatalogPostgresFact]
    public async Task Two_coaches_share_one_team_pool_and_actual_gpu_seconds_release_unused_budget()
    {
        var clock = new Clock();
        var team = Guid.NewGuid();
        await using var services = Services(clock, 10, team);
        var a = Guid.NewGuid(); var b = Guid.NewGuid();
        await using var scopeA = services.CreateAsyncScope();
        await using var scopeB = services.CreateAsyncScope();
        await Ledger(scopeA).ReserveAsync(a, Local, "gpu-a", 8, TimeSpan.FromMinutes(10), default, team);
        await Assert.ThrowsAsync<ApiException>(() => Ledger(scopeB).ReserveAsync(b, Local, "gpu-b", 3, TimeSpan.FromMinutes(10), default, team));
        await Ledger(scopeA).SettleAsync(a, Local, "gpu-a", 4, default);
        await Ledger(scopeB).ReserveAsync(b, Local, "gpu-b", 6, TimeSpan.FromMinutes(10), default, team);
        await Ledger(scopeB).ReleaseAsync(b, Local, "gpu-b", default);
        await Ledger(scopeB).ReserveAsync(b, Local, "gpu-c", 6, TimeSpan.FromMinutes(10), default, team);
    }

    private static UsageReservations Ledger(AsyncServiceScope scope) => scope.ServiceProvider.GetRequiredService<UsageReservations>();
    private static ServiceProvider Services(Clock clock, long limit, Guid? team = null)
    {
        var connection = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        if (new NpgsqlConnectionStringBuilder(connection).Host is not ("localhost" or "127.0.0.1" or "::1")) throw new InvalidOperationException("Disposable local database required.");
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(NpgsqlDataSource.Create(connection));
        services.AddSingleton<TimeProvider>(clock);
        services.AddSingleton<IPlanEntitlementsProvider>(new Plans(clock, limit, team));
        services.AddModuleDatabase<AccessDbContext>("access");
        services.AddScoped<UsageReservations>();
        return services.BuildServiceProvider();
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 24, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now.ToUniversalTime();
    }
    private sealed class Plans(Clock clock, long limit, Guid? team) : IPlanEntitlementsProvider
    {
        public Task<PlanEntitlements> GetAsync(Guid userId, CancellationToken ct) => Task.FromResult(Create(userId));
        public Task<PlanEntitlements> GetForTeamAsync(Guid userId, Guid teamId, CancellationToken ct) =>
            teamId == team ? Task.FromResult(Create(teamId)) : throw ApiException.NotFound();
        private PlanEntitlements Create(Guid scope)
        {
            var now = clock.GetUtcNow(); var start = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
            return new("Free", scope, start, start.AddMonths(1), new HashSet<string>(), new Dictionary<string, long?> { [Local] = limit });
        }
    }
}
