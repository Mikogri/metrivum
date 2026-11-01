using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;
using Metrivum.Messaging.Infrastructure;

namespace Metrivum.UnitTests;

public sealed class MessagingHubAbuseTests
{
    [Fact]
    public async Task Sixth_connection_is_rejected_and_disconnect_or_failed_connect_returns_permit()
    {
        using var limiter = new AbuseProtection(Options.Create(new AbuseProtectionOptions()));
        var filter = new MessagingHubAbuse(limiter, TimeProvider.System);
        var user = Guid.NewGuid();
        var contexts = Enumerable.Range(0, 6).Select(_ => Lifetime(user)).ToArray();
        foreach (var context in contexts.Take(5)) await filter.OnConnectedAsync(context, _ => Task.CompletedTask);
        await Assert.ThrowsAsync<HubException>(() => filter.OnConnectedAsync(contexts[5], _ => Task.CompletedTask));
        Assert.True(((Caller)contexts[5].Context).Aborted);
        await filter.OnDisconnectedAsync(contexts[0], null, (_, _) => Task.CompletedTask);
        await Assert.ThrowsAsync<IOException>(() => filter.OnConnectedAsync(contexts[5], _ => throw new IOException()));
        await filter.OnConnectedAsync(contexts[5], _ => Task.CompletedTask);
        await Assert.ThrowsAsync<IOException>(() => filter.OnDisconnectedAsync(contexts[5], null, (_, _) => throw new IOException()));
        await filter.OnConnectedAsync(Lifetime(user), _ => Task.CompletedTask);
    }

    [Fact]
    public void Typing_coalesces_across_tabs_and_resumes_after_two_seconds()
    {
        var clock = new Clock();
        using var limiter = new AbuseProtection(Options.Create(new AbuseProtectionOptions()));
        var filter = new MessagingHubAbuse(limiter, clock);
        var user = Guid.NewGuid(); var conversation = Guid.NewGuid();
        Assert.True(filter.AdmitTypingEffect(user, conversation));
        Assert.False(filter.AdmitTypingEffect(user, conversation));
        clock.Now = clock.Now.AddSeconds(2);
        Assert.True(filter.AdmitTypingEffect(user, conversation));
        Assert.True(filter.AdmitTypingEffect(Guid.NewGuid(), conversation));
    }

    [Fact]
    public async Task Invocation_budget_rejects_before_authorization_and_is_shared_across_tabs()
    {
        var options = new AbuseProtectionOptions(); options.Policies[AbusePolicies.HubInvocation].Permits = 2;
        using var limiter = new AbuseProtection(Options.Create(options));
        var filter = new MessagingHubAbuse(limiter, TimeProvider.System);
        var user = Guid.NewGuid(); var calls = 0;
        ValueTask<object?> Next(HubInvocationContext _) { calls++; return ValueTask.FromResult<object?>(null); }
        await filter.InvokeMethodAsync(Invocation(user, nameof(MessagingHub.Subscribe), Guid.NewGuid()), Next);
        await filter.InvokeMethodAsync(Invocation(user, nameof(MessagingHub.Subscribe), Guid.NewGuid()), Next);
        await Assert.ThrowsAsync<HubException>(async () => await filter.InvokeMethodAsync(Invocation(user, nameof(MessagingHub.Subscribe), Guid.NewGuid()), Next));
        Assert.Equal(2, calls);
        await filter.InvokeMethodAsync(Invocation(Guid.NewGuid(), nameof(MessagingHub.Subscribe), Guid.NewGuid()), Next);
        Assert.Equal(3, calls);
    }

    [Fact]
    public void Distinct_conversation_typing_still_has_a_sender_wide_budget()
    {
        var options = new AbuseProtectionOptions(); options.Policies[AbusePolicies.Typing].Permits = 2;
        using var limiter = new AbuseProtection(Options.Create(options));
        var filter = new MessagingHubAbuse(limiter, TimeProvider.System); var user = Guid.NewGuid();
        for (var i = 0; i < 2; i++) Assert.True(filter.AdmitTypingEffect(user, Guid.NewGuid()));
        Assert.Equal(429, Assert.Throws<ApiException>(() => filter.AdmitTypingEffect(user, Guid.NewGuid())).Status);
    }

    private static readonly IServiceProvider Services = new ServiceCollection().BuildServiceProvider();
    private static MessagingHub Hub() => new(null!, null!, null!, TimeProvider.System, null!);
    private static HubLifetimeContext Lifetime(Guid user) => new(new Caller(user), Services, Hub());
    private static HubInvocationContext Invocation(Guid user, string method, Guid conversation) =>
        new(new Caller(user), Services, Hub(), typeof(MessagingHub).GetMethod(method)!, method == nameof(MessagingHub.Typing) ? [conversation, true] : [conversation]);
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Caller(Guid user) : HubCallerContext
    {
        public bool Aborted { get; private set; }
        public override string ConnectionId { get; } = Guid.NewGuid().ToString();
        public override string UserIdentifier => user.ToString();
        public override ClaimsPrincipal User { get; } = new();
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => default;
        public override void Abort() => Aborted = true;
    }
}
