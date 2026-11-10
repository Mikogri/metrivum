using Metrivum.BuildingBlocks;
using Microsoft.Extensions.Options;

namespace Metrivum.UnitTests;

public sealed class AbuseProtectionConfigurationTests
{
    [Fact]
    public async Task Distributed_admission_fails_closed_when_store_is_missing_or_unavailable()
    {
        using var missing = new AbuseProtection(Options.Create(new AbuseProtectionOptions()));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            missing.RequireAsync(Guid.NewGuid(), AbusePolicies.McpWrite)
        );
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            missing.EnterAsync(Guid.NewGuid(), AbusePolicies.Heavy)
        );
        using var unavailable = new AbuseProtection(
            Options.Create(new AbuseProtectionOptions()),
            counterStore: new UnavailableStore()
        );
        await Assert.ThrowsAsync<TimeoutException>(() =>
            unavailable.RequireAsync(Guid.NewGuid(), AbusePolicies.McpWrite)
        );
    }

    [Fact]
    public async Task Explicit_local_test_mode_does_not_require_a_database()
    {
        using var guard = new AbuseProtection(
            Options.Create(new AbuseProtectionOptions { DistributedEnabled = false })
        );
        await guard.RequireAsync(Guid.NewGuid(), AbusePolicies.McpWrite);
    }

    [Fact]
    public void Malformed_or_semantically_invalid_options_fail_validation()
    {
        Assert.False(new AbuseProtectionOptions { Policies = null! }.IsValid());
        Assert.False(new AbuseProtectionOptions { TrustedProxies = null! }.IsValid());
        var options = new AbuseProtectionOptions();
        options.Policies[AbusePolicies.Read] = null!;
        Assert.False(options.IsValid());
        Assert.Throws<OptionsValidationException>(() =>
            new AbuseProtection(Options.Create(options))
        );
        options = new();
        options.Policies[AbusePolicies.Heavy].Concurrent = false;
        Assert.False(options.IsValid());
        options = new();
        options.Policies[AbusePolicies.Message].Refill = 0;
        Assert.False(options.IsValid());
        options = new();
        options.Policies["unbounded-metric-label"] = new() { Permits = 1 };
        Assert.False(options.IsValid());
    }

    [Fact]
    public void Global_budget_aggregates_all_categories()
    {
        using var guard = new AbuseProtection(Options.Create(new AbuseProtectionOptions()));
        var user = Guid.NewGuid();
        foreach (
            var (policy, requests) in new[]
            {
                (AbusePolicies.Read, 300),
                (AbusePolicies.Write, 90),
                (AbusePolicies.Autosave, 120),
                (AbusePolicies.Search, 60),
                (AbusePolicies.Message, 30),
            }
        )
            for (var i = 0; i < requests; i++)
            {
                guard.Require(user, AbusePolicies.Global);
                guard.Require(user, policy);
            }
        Assert.Equal(
            429,
            Assert.Throws<ApiException>(() => guard.Require(user, AbusePolicies.Global)).Status
        );
    }

    [Fact]
    public void Admission_is_bounded_retains_existing_users_and_reclaims_expired_identities()
    {
        var clock = new TestClock();
        using var guard = new AbuseProtection(
            Options.Create(new AbuseProtectionOptions { MaximumIdentities = 100 }),
            clock
        );
        var user = Guid.NewGuid();
        guard.Require(user, AbusePolicies.Read);
        for (var i = 1; i < 100; i++)
            guard.Require(Guid.NewGuid(), AbusePolicies.Read);
        Assert.Throws<ApiException>(() => guard.Require(Guid.NewGuid(), AbusePolicies.Read));
        guard.Require(user, AbusePolicies.Read);
        Assert.Throws<ArgumentException>(() => guard.Require(user, "arbitrary-client-policy"));
        clock.Now = clock.Now.AddHours(26);
        guard.Require(Guid.NewGuid(), AbusePolicies.Read);
    }

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class UnavailableStore : IAbuseCounterStore
    {
        public Task<bool> TryAcquireAsync(
            Guid userId,
            string policy,
            AbuseLimit limit,
            CancellationToken cancellationToken
        ) => throw new TimeoutException("Admission store unavailable.");
    }
}
