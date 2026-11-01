using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;
using Xunit.Abstractions;

namespace Metrivum.UnitTests;

public sealed class AbuseProtectionTests(ITestOutputHelper output)
{
    private static AbuseProtection Create(AbuseProtectionOptions? options = null) => new(Options.Create(options ?? new()));

    [Theory]
    [InlineData(AbusePolicies.Global, 600)]
    [InlineData(AbusePolicies.Read, 300)]
    [InlineData(AbusePolicies.Write, 90)]
    [InlineData(AbusePolicies.Autosave, 120)]
    [InlineData(AbusePolicies.Search, 60)]
    [InlineData(AbusePolicies.Message, 40)]
    [InlineData(AbusePolicies.Payment, 10)]
    [InlineData(AbusePolicies.ProgramCreate, 30)]
    [InlineData(AbusePolicies.Export, 20)]
    [InlineData(AbusePolicies.Invitation, 15)]
    [InlineData(AbusePolicies.Application, 10)]
    [InlineData(AbusePolicies.CheckInAssign, 60)]
    [InlineData(AbusePolicies.CheckInAnswer, 10)]
    [InlineData(AbusePolicies.McpRead, 60)]
    [InlineData(AbusePolicies.McpWrite, 15)]
    public void Boundary_N_then_N_plus_one_and_account_isolation(string policy, int maximum)
    {
        using var guard = Create();
        var actor = Guid.NewGuid();
        for (var i = 0; i < maximum; i++) guard.Require(actor, policy);
        var error = Assert.Throws<ApiException>(() => guard.Require(actor, policy));
        Assert.Equal(429, error.Status);
        Assert.True(error.RetryAfter > TimeSpan.Zero);
        guard.Require(Guid.NewGuid(), policy);
    }

    [Fact]
    public void Autosave_does_not_spend_generic_writes_and_transport_scope_cannot_reset_an_action_budget()
    {
        using var guard = Create();
        var actor = Guid.NewGuid();
        for (var i = 0; i < 120; i++) guard.Require(actor, AbusePolicies.Autosave);
        for (var i = 0; i < 90; i++) guard.Require(actor, AbusePolicies.Write);
        for (var i = 0; i < 40; i++) guard.Require(actor, AbusePolicies.Message, i % 2 == 0 ? "rest" : "mcp");
        Assert.Throws<ApiException>(() => guard.Require(actor, AbusePolicies.Message, "new-conversation"));
    }

    [Theory]
    [InlineData(AbusePolicies.Heavy, 2)]
    [InlineData(AbusePolicies.HubConnection, 5)]
    public void Concurrency_leases_release_on_disposal(string policy, int maximum)
    {
        using var guard = Create();
        var actor = Guid.NewGuid();
        var leases = Enumerable.Range(0, maximum).Select(_ => guard.Enter(actor, policy)).ToArray();
        Assert.Throws<ApiException>(() => guard.Enter(actor, policy));
        leases[0].Dispose();
        using var replacement = guard.Enter(actor, policy);
        foreach (var lease in leases) lease.Dispose();
    }

    [Fact]
    public async Task Token_bucket_replenishes_without_waiting_inside_requests()
    {
        var options = new AbuseProtectionOptions();
        options.Policies[AbusePolicies.Message] = new() { Permits = 2, Refill = 1, WindowSeconds = 1 };
        using var guard = Create(options);
        var actor = Guid.NewGuid();
        guard.Require(actor, AbusePolicies.Message); guard.Require(actor, AbusePolicies.Message);
        Assert.Throws<ApiException>(() => guard.Require(actor, AbusePolicies.Message));
        await Task.Delay(1250);
        guard.Require(actor, AbusePolicies.Message);
    }

    [Fact]
    public async Task Controlled_normal_and_bot_load_records_real_local_limiter_cost()
    {
        using var guard = Create();
        var process = Process.GetCurrentProcess();
        var startCpu = process.TotalProcessorTime;
        var stopwatch = Stopwatch.StartNew();
        var latencies = new System.Collections.Concurrent.ConcurrentBag<double>();
        var normalRejected = 0;
        // 100 identities, several tabs per identity, autosave and a quick chat burst. Same server, no network/DB traffic.
        await Parallel.ForEachAsync(Enumerable.Range(0, 100), async (index, ct) =>
        {
            var actor = Guid.NewGuid();
            for (var i = 0; i < 200; i++)
            {
                var started = Stopwatch.GetTimestamp();
                try
                {
                    guard.Require(actor, AbusePolicies.Global);
                    guard.Require(actor, i < 100 ? AbusePolicies.Read : i < 180 ? AbusePolicies.Autosave : AbusePolicies.Message);
                }
                catch (ApiException) { Interlocked.Increment(ref normalRejected); }
                latencies.Add(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            }
            await Task.CompletedTask;
        });
        Assert.Equal(0, normalRejected);
        var bot = Guid.NewGuid(); var botRejected = 0;
        for (var i = 0; i < 1000; i++)
        {
            try { guard.Require(bot, AbusePolicies.Global); }
            catch (ApiException) { botRejected++; }
        }
        Assert.Equal(400, botRejected);
        var samples = latencies.Order().ToArray();
        var report = new { scope = "in-process limiter only; not end-to-end API/DB latency", users = 100,
            normalRequests = samples.Length, normalRejected, botRequests = 1000, botRejected,
            p50Milliseconds = samples[samples.Length / 2], p95Milliseconds = samples[(int)(samples.Length * .95)],
            elapsedSeconds = stopwatch.Elapsed.TotalSeconds, cpuMilliseconds = (process.TotalProcessorTime - startCpu).TotalMilliseconds,
            workingSetBytes = process.WorkingSet64 };
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
        output.WriteLine(json);
        if (Environment.GetEnvironmentVariable("TRAINFLOW_ABUSE_RESULTS") is { } path) File.WriteAllText(path, json);
    }
}
