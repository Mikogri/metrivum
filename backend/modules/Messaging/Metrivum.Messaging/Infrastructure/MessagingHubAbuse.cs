using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.SignalR;

namespace Metrivum.Messaging.Infrastructure;

/// <summary>Applies abuse limits to realtime messaging operations.</summary>
public sealed class MessagingHubAbuse(IAbuseProtection abuse, TimeProvider clock) : IHubFilter
{
    private const string LeaseKey = "Metrivum.HubConnectionLease";
    private readonly Dictionary<(Guid User, Guid Conversation), DateTimeOffset> typing = [];
    private readonly object typingLock = new();
    private DateTimeOffset nextCleanup;

    public async Task OnConnectedAsync(
        HubLifetimeContext context,
        Func<HubLifetimeContext, Task> next
    )
    {
        var user = User(context.Context);
        IDisposable lease;
        try
        {
            lease = abuse.Enter(user, AbusePolicies.HubConnection);
        }
        catch (ApiException)
        {
            context.Context.Abort();
            throw new HubException("RATE_LIMIT_EXCEEDED");
        }
        context.Context.Items[LeaseKey] = lease;
        try
        {
            await next(context);
        }
        catch
        {
            lease.Dispose();
            context.Context.Items.Remove(LeaseKey);
            throw;
        }
    }

    public async Task OnDisconnectedAsync(
        HubLifetimeContext context,
        Exception? exception,
        Func<HubLifetimeContext, Exception?, Task> next
    )
    {
        try
        {
            await next(context, exception);
        }
        finally
        {
            if (context.Context.Items.Remove(LeaseKey, out var lease))
                (lease as IDisposable)?.Dispose();
        }
    }

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext context,
        Func<HubInvocationContext, ValueTask<object?>> next
    )
    {
        var user = User(context.Context);
        try
        {
            abuse.Require(user, AbusePolicies.HubInvocation);
            return await next(context);
        }
        catch (ApiException error) when (error.Status == 429)
        {
            throw new HubException("RATE_LIMIT_EXCEEDED");
        }
    }

    // Called after current membership authorization; coalescing must not hide a revoked membership.
    public bool AdmitTypingEffect(Guid user, Guid conversation)
    {
        var key = (user, conversation);
        lock (typingLock)
        {
            var now = clock.GetUtcNow();
            if (now >= nextCleanup)
            {
                foreach (
                    var expired in typing.Where(x => x.Value <= now).Select(x => x.Key).ToArray()
                )
                    typing.Remove(expired);
                nextCleanup = now.AddSeconds(2);
            }
            if (typing.TryGetValue(key, out var expires) && expires > now)
                return false;
            // Never evict a live entry: that would let capacity pressure bypass coalescing.
            if (!typing.ContainsKey(key) && typing.Count >= 20000)
                throw new HubException("RATE_LIMIT_EXCEEDED");
            abuse.Require(user, AbusePolicies.Typing);
            typing[key] = now.AddSeconds(2);
            return true;
        }
    }

    private static Guid User(HubCallerContext context) =>
        Guid.TryParse(context.UserIdentifier, out var id) && id != Guid.Empty
            ? id
            : throw new HubException("AUTHENTICATION_REQUIRED");
}
