using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Messaging.Contracts;
using Metrivum.Messaging.Domain;

namespace Metrivum.Messaging.Features;

public sealed partial class MessagingService : IMcpMessageOperations
{
    async Task<McpConversation[]> IMcpMessageOperations.ListAsync(string? search, int limit, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        if (limit is < 1 or > 50) throw ApiException.Invalid("Limit must be between 1 and 50.");
        return (await ListAsync(search, limit, ct)).Select(McpConversation).ToArray();
    }
    async Task<McpConversation> IMcpMessageOperations.GetAsync(Guid conversationId, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        return McpConversation(await GetAsync(conversationId, ct));
    }
    async Task<McpMessagePage> IMcpMessageOperations.MessagesAsync(Guid conversationId, string? before, int limit, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        if (limit is < 1 or > 100) throw ApiException.Invalid("Limit must be between 1 and 100.");
        var page = await HistoryAsync(conversationId, before, null, limit, ct);
        return new(page.Items.Select(x => new McpChatMessage(x.Id, x.ConversationId, x.SenderUserId, x.Type.ToString(), x.Body, x.CreatedAt,
            x.ReplyToMessageId, x.Cursor, x.DeletedAt)).ToArray(), page.OlderCursor, page.NewerCursor);
    }
    private static McpConversation McpConversation(ConversationDto x) => new(x.Id, x.Title, x.Type.ToString(), x.MembershipState.ToString(), x.CanSendMessages,
        x.Members.Select(member => new McpMessageRecipient(member.UserId, member.DisplayName)).ToArray());

    public async Task<McpMessagePreview> PreviewAsync(Guid conversationId, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        return await tx.RunAsync(async token =>
        {
            // Use the same locks as send, membership changes and blocking; hold them through the outer approval transaction.
            var conversation = await Conversation(conversationId, token);
            if (conversation.Type == ConversationType.Direct)
            {
                await PairLock(conversation.PairFirst!.Value, conversation.PairSecond!.Value, token);
                var recipient = conversation.PairFirst == Actor ? conversation.PairSecond!.Value : conversation.PairFirst!.Value;
                await Lock("messaging-preferences:" + recipient, token);
            }
            await Lock("messaging-conversation:" + conversationId, token);
            await db.Entry(conversation).ReloadAsync(token);
            await Member(conversationId, true, token);
            if (conversation.Type == ConversationType.Direct)
                await NotBlocked(conversation.PairFirst!.Value, conversation.PairSecond!.Value, token);
            await RequireConversationConsentAsync(conversation, token);
            var members = await db.Members.AsNoTracking().Where(x => x.ConversationId == conversationId)
                .OrderBy(x => x.UserId).Select(x => new { x.UserId, x.State, x.Excluded, x.JoinedAt, x.RemovedAt, x.Source, x.Role }).ToArrayAsync(token);
            var recipientIds = members.Where(x => x.State == MemberState.Active && !x.Excluded && x.UserId != Actor).Select(x => x.UserId).ToArray();
            if (recipientIds.Length == 0) throw ApiException.Invalid("A recipient is required.");
            var people = await directory.GetAccountsAsync(recipientIds, token);
            if (people.Count != recipientIds.Length) throw ApiException.Conflict("Conversation recipients are no longer active.");
            var request = await LatestRequestAsync(conversationId, token);
            var introductionRequiresApproval = await RequiresFirstMessageApprovalAsync(conversation, token);
            var contextHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            {
                conversation.Id, conversation.Type, conversation.Title, conversation.Sequence, members,
                RequestId = request?.Id, RequestState = request?.State, introductionRequiresApproval
            }))));
            var title = conversation.Type == ConversationType.Direct ? people[recipientIds[0]].DisplayName : conversation.Title;
            return new McpMessagePreview(conversationId, title,
                recipientIds.Select(id => new McpMessageRecipient(id, people[id].DisplayName)).ToArray(), contextHash, conversation.Sequence);
        }, ct);
    }

    async Task<Guid> IMcpMessageOperations.SendAsync(Guid conversationId, string body, string expectedContextHash, string idempotencyKey, CancellationToken ct)
    {
        return await tx.RunAsync(async token =>
        {
            var preview = await PreviewAsync(conversationId, token);
            if (preview.ContextHash != expectedContextHash)
                throw new ApiException(409, "STALE_REVISION", "Conversation state changed. Prepare and review a new action.");
            return (await SendAsync(conversationId, new(MessageType.Text, body, null, []), idempotencyKey, token)).Id;
        }, ct);
    }
}
