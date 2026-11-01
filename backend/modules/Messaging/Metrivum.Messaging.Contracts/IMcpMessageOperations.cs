namespace Metrivum.Messaging.Contracts;

public sealed record McpMessageRecipient(Guid UserId, string DisplayName);
public sealed record McpMessagePreview(Guid ConversationId, string ConversationTitle, McpMessageRecipient[] Recipients, string ContextHash, long ExpectedRevision);
public sealed record McpConversation(Guid Id, string Title, string Type, string MembershipState, bool CanSendMessages, McpMessageRecipient[] Members);
public sealed record McpChatMessage(Guid Id, Guid ConversationId, Guid SenderUserId, string Type, string? Body, DateTimeOffset CreatedAt, Guid? ReplyToMessageId, string Cursor, DateTimeOffset? DeletedAt);
public sealed record McpMessagePage(McpChatMessage[] Items, string? OlderCursor, string? NewerCursor);

public interface IMcpMessageOperations
{
    Task<McpConversation[]> ListAsync(string? search, int limit, CancellationToken ct);
    Task<McpConversation> GetAsync(Guid conversationId, CancellationToken ct);
    Task<McpMessagePage> MessagesAsync(Guid conversationId, string? before, int limit, CancellationToken ct);
    Task<McpMessagePreview> PreviewAsync(Guid conversationId, CancellationToken ct);
    Task<Guid> SendAsync(Guid conversationId, string body, string expectedContextHash, string idempotencyKey, CancellationToken ct);
}
