using TrainFlow.Access.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Messaging.Domain;
using TrainFlow.Messaging.Features;

namespace TrainFlow.Messaging.Infrastructure;

public sealed class MessagingDispatcher(MessagingDbContext db, ModuleTransaction tx, IHubContext<MessagingHub> hub, ILogger<MessagingDispatcher> logger, IFeatureAudience audience)
{
    public async Task ConversationAsync(Guid id, string eventName, object payload, CancellationToken ct, Guid? activePublisher = null)
    {
        // Serialized with membership transitions. Never deliver using remembered SignalR conversation groups.
        try
        {
            await tx.RunAsync(async token =>
            {
                var c = await db.Conversations.AsNoTracking().SingleAsync(x => x.Id == id, token);
                if (c.Type == ConversationType.Direct)
                    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"messaging-pair:" + c.PairFirst + ":" + c.PairSecond},0))", token);
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"messaging-conversation:" + id},0))", token);
                var users = await db.Members.AsNoTracking().Where(x => x.ConversationId == id && x.State == MemberState.Active).Select(x => x.UserId).ToArrayAsync(token);
                if (activePublisher.HasValue && !users.Contains(activePublisher.Value))
                    return;
                if (c.Type == ConversationType.Direct && await db.Blocks.AnyAsync(x => (x.UserId == c.PairFirst && x.BlockedUserId == c.PairSecond) || (x.UserId == c.PairSecond && x.BlockedUserId == c.PairFirst), token))
                    return;
                var allowed = await audience.GetAllowedUsersAsync(users, c.Type == ConversationType.Direct ? "messaging.direct" : "messaging.groups", token);
                if (activePublisher.HasValue && !allowed.Contains(activePublisher.Value))
                    return;
                await hub.Clients.Users(users.Where(allowed.Contains).Select(x => x.ToString()).ToArray()).SendAsync(eventName, payload, token);
            }, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Messaging realtime delivery failed for {ConversationId}; durable API state remains authoritative", id);
        }
    }

    public async Task UserAsync(Guid user, string eventName, object payload, CancellationToken ct)
    {
        try
        {
            if ((await audience.GetAllowedUsersAsync([user], "messaging.direct", ct)).Contains(user))
                await hub.Clients.User(user.ToString()).SendAsync(eventName, payload, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Messaging realtime delivery failed; reconnect through REST");
        }
    }
}

public sealed class MessagingUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => Guid.TryParse(connection.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? connection.User?.FindFirst("sub")?.Value, out var id) ? id.ToString() : null;
}

[Authorize]
public sealed class MessagingHub(MessagingService service, IAccountContext accounts, MessagingDispatcher dispatcher, TimeProvider clock, MessagingHubAbuse abuse) : Hub
{
    public async Task Subscribe(Guid conversationId)
    {
        await service.ActiveAsync(conversationId, Context.ConnectionAborted);
    }

    public async Task Typing(Guid conversationId, bool typing)
    {
        await service.ActiveAsync(conversationId, Context.ConnectionAborted);
        if (!abuse.AdmitTypingEffect(accounts.UserId, conversationId)) return;
        var now = clock.GetUtcNow();
        await dispatcher.ConversationAsync(conversationId, "TypingChanged", new
        {
            ConversationId = conversationId,
            UserId = accounts.UserId,
            Typing = typing,
            ExpiresAt = now.AddSeconds(5)
        }, Context.ConnectionAborted, accounts.UserId);
    }

}
