using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Hosting;
using System.Net;
using Metrivum.Access.Infrastructure;
using Metrivum.BuildingBlocks;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed class DistributedAbuseTests
{
    [Fact]
    public void Data_source_public_connection_string_cannot_reconstruct_password_authenticated_pools()
    {
        // A synthetic credential proves why private pools must receive original verified host
        // configuration instead of cloning the shared data source's redacted public settings.
        using var source = NpgsqlDataSource.Create("Host=127.0.0.1;Database=unused;Username=fixture;Password=synthetic-test-only");
        Assert.True(string.IsNullOrEmpty(new NpgsqlConnectionStringBuilder(source.ConnectionString).Password));
    }

    [MediaPostgresFact]
    public async Task Export_concurrency_is_shared_until_actual_disposal_even_after_request_cancellation()
    {
        await using var test = await Database.CreateAsync();
        using var firstStore = new PostgresAbuseCounterStore(test.ConnectionString);
        using var secondStore = new PostgresAbuseCounterStore(test.ConnectionString);
        using var first = new AbuseProtection(Options.Create(new AbuseProtectionOptions()), counterStore: firstStore);
        using var second = new AbuseProtection(Options.Create(new AbuseProtectionOptions()), counterStore: secondStore);
        var owner = Guid.NewGuid();
        using var canceledRequest = new CancellationTokenSource();
        var left = await first.EnterAsync(owner, AbusePolicies.Heavy, cancellationToken: canceledRequest.Token);
        try
        {
            await using var right = await second.EnterAsync(owner, AbusePolicies.Heavy);
            canceledRequest.Cancel();
            Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => second.EnterAsync(owner, AbusePolicies.Heavy))).Status);
            await left.DisposeAsync();
            await using var replacement = await second.EnterAsync(owner, AbusePolicies.Heavy);
        }
        finally { await left.DisposeAsync(); }
        await using var afterDisposal = await first.EnterAsync(owner, AbusePolicies.Heavy);
    }

    [MediaPostgresFact]
    public async Task Bounded_operation_pool_rejects_without_starving_rate_admission()
    {
        await using var test = await Database.CreateAsync();
        using var store = new PostgresAbuseCounterStore(test.ConnectionString);
        var active = new List<IAsyncDisposable>();
        try
        {
            var concurrent = new AbuseLimit { Permits = 2, Concurrent = true };
            for (var i = 0; i < 8; i++)
                active.Add((await store.TryEnterAsync(Guid.NewGuid(), AbusePolicies.Heavy, concurrent, default))!);
            Assert.Null(await store.TryEnterAsync(Guid.NewGuid(), AbusePolicies.Heavy, concurrent, default));
            Assert.True(await store.TryAcquireAsync(Guid.NewGuid(), AbusePolicies.McpWrite, new AbuseLimit { Permits = 1 }, default));
        }
        finally { foreach (var lease in active) await lease.DisposeAsync(); }
    }

    [MediaPostgresFact]
    public async Task Two_HTTP_hosts_return_429_and_retry_after_for_the_same_write_budget()
    {
        await using var test = await Database.CreateAsync();
        using var firstSource = new ApiFactory(test.ConnectionString);
        using var secondSource = new ApiFactory(test.ConnectionString);
        using var first = firstSource.WithWebHostBuilder(b => b.UseSetting("AbuseProtection:Policies:write:Permits", "2"));
        using var second = secondSource.WithWebHostBuilder(b => b.UseSetting("AbuseProtection:Policies:write:Permits", "2"));
        using var left = first.CreateClient();
        using var right = second.CreateClient();
        var owner = Guid.NewGuid();
        left.DefaultRequestHeaders.Authorization = new("Bearer", firstSource.Token(owner));
        right.DefaultRequestHeaders.Authorization = new("Bearer", secondSource.Token(owner));
        // An unknown route isolates admission from domain DB fixtures; attempts still cost permits.
        Assert.Equal(HttpStatusCode.NotFound, (await left.PostAsync("/api/v1/abuse-test-no-route", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await right.PostAsync("/api/v1/abuse-test-no-route", null)).StatusCode);
        var denied = await right.PostAsync("/api/v1/abuse-test-no-route", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, denied.StatusCode);
        Assert.True(denied.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [MediaPostgresFact]
    public async Task Independent_instances_and_restarts_share_atomic_allowances_per_owner_and_operation()
    {
        await using var test = await Database.CreateAsync();
        using var firstStore = new PostgresAbuseCounterStore(test.ConnectionString);
        using var secondStore = new PostgresAbuseCounterStore(test.ConnectionString);
        var options = new AbuseProtectionOptions();
        options.Policies[AbusePolicies.McpWrite].Permits = 7;
        using var first = new AbuseProtection(Options.Create(options), counterStore: firstStore);
        using var second = new AbuseProtection(Options.Create(options), counterStore: secondStore);
        var owner = Guid.NewGuid();
        var attempts = await Task.WhenAll(Enumerable.Range(0, 30).Select(async i =>
        {
            try
            {
                await (i % 2 == 0 ? first : second).RequireAsync(owner, AbusePolicies.McpWrite, "different-client-" + i);
                return true;
            }
            catch (ApiException exception)
            {
                Assert.Equal(429, exception.Status);
                Assert.True(exception.RetryAfter > TimeSpan.Zero);
                return false;
            }
        }));
        Assert.Equal(7, attempts.Count(x => x));
        using var restarted = new AbuseProtection(Options.Create(options), counterStore: secondStore);
        Assert.Equal(429, (await Assert.ThrowsAsync<ApiException>(() => restarted.RequireAsync(owner, AbusePolicies.McpWrite))).Status);
        await restarted.RequireAsync(Guid.NewGuid(), AbusePolicies.McpWrite);
        await restarted.RequireAsync(owner, AbusePolicies.McpRead);
    }

    [MediaPostgresFact]
    public async Task Business_rollback_cannot_refund_admission_and_expired_windows_reopen()
    {
        await using var test = await Database.CreateAsync();
        using var store = new PostgresAbuseCounterStore(test.ConnectionString);
        var owner = Guid.NewGuid();
        var limit = new AbuseLimit { Permits = 1, WindowSeconds = 3600 };
        await using (var transaction = new ModuleTransaction(test.Source))
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => transaction.RunAsync(async ct =>
            {
                Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Invitation, limit, ct));
                throw new InvalidOperationException("Business validation rejected the operation.");
            }, default));
        }
        Assert.False(await store.TryAcquireAsync(owner, AbusePolicies.Invitation, limit, default));
        await using var db = test.Context();
        await db.AbuseWindows.Where(x => x.UserId == owner).ExecuteUpdateAsync(s => s.SetProperty(x => x.WindowStart, DateTimeOffset.UtcNow.AddHours(-2)));
        Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Invitation, limit, default));
    }

    [MediaPostgresFact]
    public async Task Message_refill_retains_burst_cap_and_does_not_reset_after_one_period()
    {
        await using var test = await Database.CreateAsync();
        using var store = new PostgresAbuseCounterStore(test.ConnectionString);
        var owner = Guid.NewGuid();
        var limit = new AbuseLimit { Permits = 4, Refill = 2, WindowSeconds = 60 };
        for (var i = 0; i < 4; i++) Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
        Assert.False(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
        await using var db = test.Context();
        await db.AbuseWindows.Where(x => x.UserId == owner).ExecuteUpdateAsync(s => s.SetProperty(x => x.WindowStart, DateTimeOffset.UtcNow.AddSeconds(-61)));
        Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
        Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
        Assert.False(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
        await db.AbuseWindows.Where(x => x.UserId == owner).ExecuteUpdateAsync(s => s.SetProperty(x => x.WindowStart, DateTimeOffset.UtcNow.AddYears(-50)));
        Assert.True(await store.TryAcquireAsync(owner, AbusePolicies.Message, limit, default));
    }

    private sealed class Database(NpgsqlDataSource source, string admin, string name) : IAsyncDisposable
    {
        public NpgsqlDataSource Source { get; } = source;
        public string ConnectionString { get; } = new NpgsqlConnectionStringBuilder(admin) { Database = name }.ConnectionString;
        public AccessDbContext Context() => new(new DbContextOptionsBuilder<AccessDbContext>()
            .UseNpgsql(Source, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "access")).Options);

        public static async Task<Database> CreateAsync()
        {
            var admin = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
            var settings = new NpgsqlConnectionStringBuilder(admin);
            if (settings.Host is not ("localhost" or "127.0.0.1" or "::1"))
                throw new InvalidOperationException("Distributed abuse tests require an explicit disposable local PostgreSQL instance.");
            var name = "abuse_test_" + Guid.NewGuid().ToString("N");
            await using (var connection = new NpgsqlConnection(admin))
            {
                await connection.OpenAsync();
                await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
                await create.ExecuteNonQueryAsync();
            }
            settings.Database = name;
            var test = new Database(NpgsqlDataSource.Create(settings.ConnectionString), admin, name);
            await using var db = test.Context();
            await db.Database.MigrateAsync();
            return test;
        }

        public async ValueTask DisposeAsync()
        {
            await Source.DisposeAsync();
            await using var connection = new NpgsqlConnection(admin);
            await connection.OpenAsync();
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }
}
