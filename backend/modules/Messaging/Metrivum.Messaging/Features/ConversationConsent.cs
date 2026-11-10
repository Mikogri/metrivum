using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Messaging.Domain;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Messaging.Features;

/// <summary>Reads and changes authorized conversations, messages, requests and moderation state in the Messaging database.</summary>
public sealed partial class MessagingService
{
    public async Task<MessagingPreferenceDto> PreferencesAsync(CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        return new(await db.Preferences.AnyAsync(x => x.UserId == Actor && x.RequireApproval, ct));
    }

    public async Task<MessagingPreferenceDto> SavePreferencesAsync(
        MessagingPreferenceDto input,
        CancellationToken ct
    )
    {
        await Feature("messaging.direct", ct);
        await tx.RunAsync(
            async token =>
            {
                await Lock("messaging-preferences:" + Actor, token);
                var row = await db.Preferences.SingleOrDefaultAsync(x => x.UserId == Actor, token);
                if (row == null)
                    db.Preferences.Add(row = new() { UserId = Actor });
                row.RequireApproval = input.RequireApproval;
                await db.SaveChangesAsync(token);
            },
            ct
        );
        return input;
    }

    private Task<bool> RequiresApprovalAsync(Guid recipient, CancellationToken ct) =>
        db.Preferences.AnyAsync(x => x.UserId == recipient && x.RequireApproval, ct);

    private Task<bool> RequiresFirstMessageApprovalAsync(Conversation c, CancellationToken ct) =>
        c.Type == ConversationType.Direct && c.Sequence == 0
            ? RequiresApprovalAsync(
                c.PairFirst == Actor ? c.PairSecond!.Value : c.PairFirst!.Value,
                ct
            )
            : Task.FromResult(false);

    private async Task<Dictionary<Guid, RequestDto>> RequestDtosAsync(
        MessageRequest[] rows,
        CancellationToken ct
    )
    {
        if (rows.Length == 0)
            return [];
        var introductions = rows.Where(x => x.IntroductionMessageId.HasValue)
            .Select(x => x.IntroductionMessageId!.Value)
            .ToArray();
        var deleted =
            introductions.Length == 0
                ? []
                : await db
                    .Messages.AsNoTracking()
                    .Where(x => introductions.Contains(x.Id) && x.DeletedAt != null)
                    .Select(x => x.Id)
                    .ToArrayAsync(ct);
        var deletedIds = deleted.ToHashSet();
        return rows.ToDictionary(
            x => x.Id,
            x => new RequestDto(
                x.Id,
                x.SenderUserId,
                x.RecipientUserId,
                x.IntroductionMessageId is { } intro && deletedIds.Contains(intro) ? "" : x.Body,
                x.State,
                x.ConversationId,
                x.CreatedAt
            )
        );
    }

    private async Task<RequestDto> RequestDtoAsync(MessageRequest row, CancellationToken ct) =>
        (await RequestDtosAsync([row], ct))[row.Id];

    private Task<MessageRequest?> LatestRequestAsync(Guid conversationId, CancellationToken ct) =>
        db
            .Requests.AsNoTracking()
            .Where(x => x.ConversationId == conversationId)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);

    private async Task RequireConversationConsentAsync(Conversation c, CancellationToken ct)
    {
        if (c.Type != ConversationType.Direct)
            return;
        var request = await LatestRequestAsync(c.Id, ct);
        if (request != null && request.State != RequestState.Accepted)
            throw new ApiException(
                403,
                "MESSAGE_REQUEST_REQUIRED",
                "Conversation approval is required before sending another message."
            );
    }

    public async Task RequireUploadAsync(Guid conversationId, CancellationToken ct)
    {
        await ActiveAsync(conversationId, ct);
        var c = await Conversation(conversationId, ct);
        await RequireConversationConsentAsync(c, ct);
        if (await RequiresFirstMessageApprovalAsync(c, ct))
            throw new ApiException(
                403,
                "MESSAGE_REQUEST_REQUIRED",
                "Send a text introduction and wait for approval before uploading attachments."
            );
    }

    private async Task<Message> AppendEntryAsync(
        Conversation c,
        Guid sender,
        string key,
        string body,
        CoachingChatEntry? entry,
        CancellationToken ct,
        bool historical = false
    )
    {
        var now = clock.GetUtcNow();
        now = new DateTimeOffset(now.Ticks - now.Ticks % 10, TimeSpan.Zero);
        if (now <= c.UpdatedAt)
            now = c.UpdatedAt.AddTicks(10);
        c.UpdatedAt = now;
        var message = new Message
        {
            ConversationId = c.Id,
            SenderUserId = sender,
            Type = entry == null ? MessageType.Text : MessageType.System,
            Body = body,
            CreatedAt = now,
            Sequence = ++c.Sequence,
            IdempotencyKey = key,
            RequestHash = Convert.ToHexString(
                SHA256.HashData(
                    Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { body, entry }))
                )
            ),
            CoachingEntryJson = entry == null ? null : JsonSerializer.Serialize(entry),
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync(ct);
        var recipient = c.PairFirst == sender ? c.PairSecond!.Value : c.PairFirst!.Value;
        if (!historical)
        {
            // Coaching publishes its category-specific invitation event in this same transaction.
            if (entry?.Kind != "Invitation")
                await notifications.PublishAsync(
                    new(
                        recipient,
                        "message:" + message.Id,
                        "MessageCreated",
                        "Messaging",
                        "Messaging",
                        c.Id,
                        "/app/messages?conversation=" + c.Id
                    ),
                    ct
                );
            tx.OnCommitted(async token =>
                await dispatcher.ConversationAsync(
                    c.Id,
                    "MessageCreated",
                    (await Dtos([message], token))[0],
                    token
                )
            );
        }
        return message;
    }

    public async Task<CoachingChatDelivery> PublishAsync(
        Guid recipientId,
        string eventKey,
        CoachingChatEntry entry,
        string? body,
        CancellationToken ct,
        bool historical = false
    )
    {
        await Feature("messaging.direct", ct);
        if (entry.CoachId != Actor)
            throw ApiException.NotFound();
        await Known([recipientId], ct);
        return await tx.RunAsync(
            async token =>
            {
                await PairLock(Actor, recipientId, token);
                await NotBlocked(Actor, recipientId, token);
                var c = await CreateDirect(Actor, recipientId, token);
                await Lock("messaging-conversation:" + c.Id, token);
                await db.Entry(c).ReloadAsync(token);
                var previous = await db.Messages.SingleOrDefaultAsync(
                    x =>
                        x.ConversationId == c.Id
                        && x.SenderUserId == Actor
                        && x.IdempotencyKey == eventKey,
                    token
                );
                if (previous != null)
                {
                    if (
                        JsonSerializer.Deserialize<CoachingChatEntry>(previous.CoachingEntryJson!)
                            != entry
                        || previous.Body != (body ?? entry.Title)
                    )
                        throw ApiException.Conflict(
                            "Idempotency key was used for a different share."
                        );
                    return new CoachingChatDelivery(c.Id, previous.Id);
                }
                await RequireConversationConsentAsync(c, token);
                if (!historical)
                {
                    if (abuse is not null)
                        await abuse.RequireAsync(
                            Actor,
                            AbusePolicies.Message,
                            cancellationToken: token
                        );
                    await AdmitDirectContactAsync(c, token);
                }
                var initial = c.Sequence == 0 && await RequiresApprovalAsync(recipientId, token);
                MessageRequest? request = null;
                if (initial)
                    db.Requests.Add(
                        request = new()
                        {
                            SenderUserId = Actor,
                            RecipientUserId = recipientId,
                            PairFirst = c.PairFirst!.Value,
                            PairSecond = c.PairSecond!.Value,
                            ConversationId = c.Id,
                            Body = body ?? entry.Title,
                            CreatedAt = clock.GetUtcNow(),
                            UpdatedAt = clock.GetUtcNow(),
                        }
                    );
                var message = await AppendEntryAsync(
                    c,
                    Actor,
                    eventKey,
                    body ?? entry.Title,
                    entry,
                    token,
                    historical
                );
                if (request != null)
                {
                    request.IntroductionMessageId = message.Id;
                    await db.SaveChangesAsync(token);
                }
                return new CoachingChatDelivery(c.Id, message.Id);
            },
            ct
        );
    }
}
