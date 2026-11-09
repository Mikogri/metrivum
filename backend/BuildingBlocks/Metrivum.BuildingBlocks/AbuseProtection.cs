using System.Diagnostics.Metrics;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;

namespace Metrivum.BuildingBlocks;

/// <summary>Defines the named request-abuse budgets used by API modules.</summary>
public static class AbusePolicies
{
    public const string Global = "global", Read = "read", Write = "write", Search = "search", Autosave = "autosave",
        ProgramCreate = "program-create", Export = "export", Heavy = "heavy", Message = "message", GroupCreate = "group-create",
        Invitation = "invitation", Application = "application", CheckInTemplate = "check-in-template", CheckInAssign = "check-in-assign",
        CheckInAnswer = "check-in-answer", UploadStart = "upload-start", SignedDownload = "signed-download", Payment = "payment",
        McpRead = "mcp-read", McpWrite = "mcp-write", HubInvocation = "hub-invocation", HubConnection = "hub-connection", Typing = "typing",
        OfferWrite = "offer-write", FormWrite = "form-write", AnalyticsQuery = "analytics-query";
}

public interface IAbuseProtection
{
    void Require(Guid userId, string policy, string? scope = null);
    IDisposable Enter(Guid userId, string policy, string? scope = null);
    Task RequireAsync(Guid userId, string policy, string? scope = null, CancellationToken cancellationToken = default)
    {
        Require(userId, policy, scope);
        return Task.CompletedTask;
    }
    Task<IAsyncDisposable> EnterAsync(Guid userId, string policy, string? scope = null, CancellationToken cancellationToken = default)
        => Task.FromResult<IAsyncDisposable>(new AsyncAbuseLease(Enter(userId, policy, scope)));
}

public interface IAbuseCounterStore
{
    Task<bool> TryAcquireAsync(Guid userId, string policy, AbuseLimit limit, CancellationToken cancellationToken);
    Task<IAsyncDisposable?> TryEnterAsync(Guid userId, string policy, AbuseLimit limit, CancellationToken cancellationToken)
        => throw new NotSupportedException("This counter store does not support concurrency leases.");
}

/// <summary>Releases an acquired abuse-protection lease when an operation completes.</summary>
internal sealed class AsyncAbuseLease(IDisposable local, IAsyncDisposable? shared = null) : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        try { if (shared is not null) await shared.DisposeAsync(); }
        finally { local.Dispose(); }
    }
}

/// <summary>Describes one abuse budget and its time window; contains no persistence logic.</summary>
public sealed class AbuseLimit
{
    public int Permits { get; set; }
    public int WindowSeconds { get; set; } = 60;
    public int Refill { get; set; }
    public bool Concurrent { get; set; }
}

/// <summary>Contains the configured abuse protection settings and bounds for shared infrastructure; does not itself access the database.</summary>
public sealed class AbuseProtectionOptions
{
    public const string Section = "AbuseProtection";
    public int MaximumIdentities { get; set; } = 20000;
    public bool DistributedEnabled { get; set; } = true;
    public string[] TrustedProxies { get; set; } = [];
    public Dictionary<string, AbuseLimit> Policies { get; set; } = new()
    {
        [AbusePolicies.Global] = Window(600), [AbusePolicies.Read] = Window(300), [AbusePolicies.Write] = Window(90),
        [AbusePolicies.Search] = Window(60), [AbusePolicies.Autosave] = Window(120), [AbusePolicies.ProgramCreate] = Window(30, 3600),
        [AbusePolicies.Export] = Window(20, 3600), [AbusePolicies.Heavy] = Concurrent(2),
        [AbusePolicies.Message] = new() { Permits = 40, Refill = 30 }, [AbusePolicies.GroupCreate] = Window(20, 86400),
        [AbusePolicies.Invitation] = Window(15, 3600), [AbusePolicies.Application] = Window(10, 3600),
        [AbusePolicies.CheckInTemplate] = Window(30, 3600), [AbusePolicies.CheckInAssign] = Window(60, 3600),
        [AbusePolicies.CheckInAnswer] = Window(10, 3600), [AbusePolicies.UploadStart] = Window(30, 3600),
        [AbusePolicies.SignedDownload] = Window(120), [AbusePolicies.Payment] = Window(10),
        [AbusePolicies.McpRead] = Window(60), [AbusePolicies.McpWrite] = Window(15),
        [AbusePolicies.HubInvocation] = Window(300), [AbusePolicies.HubConnection] = Concurrent(5), [AbusePolicies.Typing] = Window(30),
        [AbusePolicies.OfferWrite] = Window(60, 3600), [AbusePolicies.FormWrite] = Window(120, 3600), [AbusePolicies.AnalyticsQuery] = Window(60)
    };
    private static AbuseLimit Window(int permits, int seconds = 60) => new() { Permits = permits, WindowSeconds = seconds };
    private static AbuseLimit Concurrent(int permits) => new() { Permits = permits, Concurrent = true };
    public bool IsValid()
    {
        var defaults = new AbuseProtectionOptions().Policies;
        return MaximumIdentities is >= 100 and <= 1000000 && Policies is not null && TrustedProxies is not null
            && Policies.Count == defaults.Count && defaults.Keys.All(Policies.ContainsKey)
            && Policies.All(pair => pair.Value is { } x && x.Permits is > 0 and <= 1000000
                && x.WindowSeconds is > 0 and <= 86400 && x.Refill >= 0 && x.Refill <= x.Permits
                && x.Concurrent == defaults[pair.Key].Concurrent
                && (!x.Concurrent || x.Permits <= 100)
                && (pair.Key == AbusePolicies.Message ? x.Refill > 0 : x.Refill == 0))
            && TrustedProxies.All(x => System.Net.IPAddress.TryParse(x, out _));
    }
}

/// <summary>Enforces abuse budgets and concurrency leases through the configured counter store.</summary>
public sealed class AbuseProtection : IAbuseProtection, IDisposable
{
    private readonly AbuseProtectionOptions options;
    private readonly Dictionary<string, PartitionedRateLimiter<string>> limiters;
    private readonly Dictionary<string, DateTimeOffset> identities = new(StringComparer.Ordinal);
    private readonly object identityLock = new();
    private readonly TimeProvider clock;
    private readonly IAbuseCounterStore? distributed;
    private DateTimeOffset nextIdentitySweep;
    private readonly Meter meter = new("Metrivum.AbuseProtection", "1.0");
    private readonly Counter<long> decisions;
    private readonly Histogram<double> retrySeconds;

    public AbuseProtection(IOptions<AbuseProtectionOptions> configured, TimeProvider? timeProvider = null, IAbuseCounterStore? counterStore = null)
    {
        options = configured.Value;
        clock = timeProvider ?? TimeProvider.System;
        distributed = counterStore;
        if (!options.IsValid()) throw new OptionsValidationException(AbuseProtectionOptions.Section, typeof(AbuseProtectionOptions), ["Invalid abuse protection limits."]);
        decisions = meter.CreateCounter<long>("trainflow.abuse.decisions");
        retrySeconds = meter.CreateHistogram<double>("trainflow.abuse.retry_after", "s");
        limiters = options.Policies.ToDictionary(x => x.Key, x => PartitionedRateLimiter.Create<string, string>(identity =>
        {
            var rule = x.Value;
            if (rule.Concurrent) return RateLimitPartition.GetConcurrencyLimiter(identity, _ => new ConcurrencyLimiterOptions { PermitLimit = rule.Permits, QueueLimit = 0 });
            if (rule.Refill > 0) return RateLimitPartition.GetTokenBucketLimiter(identity, _ => new TokenBucketRateLimiterOptions
            { TokenLimit = rule.Permits, TokensPerPeriod = rule.Refill, ReplenishmentPeriod = TimeSpan.FromSeconds(rule.WindowSeconds), AutoReplenishment = true, QueueLimit = 0 });
            return RateLimitPartition.GetFixedWindowLimiter(identity, _ => new FixedWindowRateLimiterOptions
            { PermitLimit = rule.Permits, Window = TimeSpan.FromSeconds(rule.WindowSeconds), AutoReplenishment = true, QueueLimit = 0 });
        }));
    }

    // Scope never creates attacker-controlled resource partitions. MCP integrations share the stricter per-user budget.
    public void Require(Guid userId, string policy, string? scope = null) { using var lease = Acquire(userId.ToString("N"), policy); }
    public IDisposable Enter(Guid userId, string policy, string? scope = null) => Acquire(userId.ToString("N"), policy);
    public void RequireAnonymous(string address, string policy) { using var lease = Acquire("ip:" + address, policy); }

    public async Task RequireAsync(Guid userId, string policy, string? scope = null, CancellationToken cancellationToken = default)
    {
        Require(userId, policy, scope);
        var rule = options.Policies[policy];
        if (!options.DistributedEnabled || rule.Concurrent) return;
        if (distributed is null)
            throw new InvalidOperationException("Distributed abuse protection requires the Access counter store.");
        if (!await distributed.TryAcquireAsync(userId, policy, rule, cancellationToken))
            throw Rejected(policy, TimeSpan.FromSeconds(rule.WindowSeconds));
    }

    public async Task<IAsyncDisposable> EnterAsync(Guid userId, string policy, string? scope = null, CancellationToken cancellationToken = default)
    {
        if (!options.Policies.TryGetValue(policy, out var rule) || !rule.Concurrent)
            throw new ArgumentException("An async lease requires a registered concurrency policy.", nameof(policy));
        var local = Enter(userId, policy, scope);
        try
        {
            if (!options.DistributedEnabled) return new AsyncAbuseLease(local);
            if (distributed is null) throw new InvalidOperationException("Distributed abuse protection requires the Access counter store.");
            var shared = await distributed.TryEnterAsync(userId, policy, rule, cancellationToken);
            if (shared is null) throw Rejected(policy, TimeSpan.FromSeconds(1));
            return new AsyncAbuseLease(local, shared);
        }
        catch { local.Dispose(); throw; }
    }

    private RateLimitLease Acquire(string identity, string policy)
    {
        if (!limiters.TryGetValue(policy, out var limiter)) throw new ArgumentException("Unknown abuse policy.", nameof(policy));
        lock (identityLock)
        {
            var now = clock.GetUtcNow();
            if (!identities.ContainsKey(identity) && identities.Count >= options.MaximumIdentities)
            {
                // Keep identities beyond the longest window: eviction cannot reset a daily allowance.
                // Saturation must stay O(1) per rejection; an attacker must not trigger a full scan per IP.
                if (now >= nextIdentitySweep)
                {
                    foreach (var key in identities.Where(x => now - x.Value > TimeSpan.FromHours(25)).Select(x => x.Key).ToArray()) identities.Remove(key);
                    nextIdentitySweep = now.AddMinutes(1);
                }
                if (identities.Count >= options.MaximumIdentities) throw Rejected(policy, TimeSpan.FromMinutes(1));
            }
            identities[identity] = now;
        }
        var lease = limiter.AttemptAcquire(identity);
        if (lease.IsAcquired)
        {
            decisions.Add(1, new("policy", policy), new("outcome", "allowed"));
            return lease;
        }
        var retry = lease.TryGetMetadata(MetadataName.RetryAfter, out var delay) ? delay : TimeSpan.FromSeconds(1);
        lease.Dispose();
        throw Rejected(policy, retry);
    }
    private ApiException Rejected(string policy, TimeSpan delay)
    {
        decisions.Add(1, new("policy", policy), new("outcome", "rejected"));
        retrySeconds.Record(delay.TotalSeconds, new KeyValuePair<string, object?>("policy", policy));
        return new(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Please retry later.", retryAfter: delay);
    }
    public void Dispose() { foreach (var limiter in limiters.Values) limiter.Dispose(); meter.Dispose(); }
}
