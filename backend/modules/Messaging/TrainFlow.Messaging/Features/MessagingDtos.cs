using System.Text;
using System.Text.Json;
using TrainFlow.BuildingBlocks;
using TrainFlow.Messaging.Domain;
using TrainFlow.Coaching.Contracts;

namespace TrainFlow.Messaging.Features;

public sealed record DirectRequest(Guid UserId);
public sealed record GroupRequest(string Title, Guid[] UserIds);
public sealed record RenameRequest(string Title);
public sealed record AddMemberRequest(Guid UserId);
public sealed record SendMessageRequest(MessageType Type, string? Body, Guid? ReplyToMessageId, Guid[]? MediaIds);
public sealed record ContactRequest(Guid UserId, string Body);
public sealed record UsernameContactRequest(string Username, string Body);
public sealed record ReportRequest(string Category, string? Details);
public sealed record ReportCreatedDto(Guid ReportId);
public sealed record ReadRequest(Guid MessageId);
public sealed record MessagingPreferenceDto(bool RequireApproval);
public sealed record AttachmentDto(Guid MediaId, string ContentType, long Size, long? DurationMs);
public sealed record MessageDto(Guid Id, Guid ConversationId, Guid SenderUserId, MessageType Type, string? Body, Guid? ReplyToMessageId, DateTimeOffset CreatedAt, string Cursor, AttachmentDto[] Attachments, string? ClientMessageId = null, DateTimeOffset? DeletedAt = null, CoachingChatEntry? CoachingEntry = null);
public sealed record MemberDto(Guid UserId, string DisplayName, MemberRole Role, MemberSource Source, MemberState State, bool Excluded, DateTimeOffset JoinedAt, DateTimeOffset? RemovedAt, Guid? LastReadMessageId, string? Username = null);
public sealed record ConversationDto(Guid Id, ConversationType Type, string Title, Guid? ClientGroupId, MemberState MembershipState, MessageDto? LastMessage, long UnreadCount, MemberDto[] Members, RequestDto? Request = null, bool CanSendMessages = true, bool CanUploadAttachments = true);
public sealed record MessagePage(MessageDto[] Items, string? OlderCursor, string? NewerCursor);
public sealed record RequestDto(Guid Id, Guid SenderUserId, Guid RecipientUserId, string Body, RequestState State, Guid? ConversationId, DateTimeOffset CreatedAt, string? SenderDisplayName = null, string? RecipientDisplayName = null);
public sealed record MessageCursor(Guid ConversationId, DateTimeOffset CreatedAt, Guid Id)
{
    public string Encode() => Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(this)));
    public static MessageCursor Decode(string value, Guid conversationId)
    {
        try
        {
            if (value.Length > 500)
                throw new FormatException();
            var c = JsonSerializer.Deserialize<MessageCursor>(Encoding.UTF8.GetString(Convert.FromBase64String(value)))!;
            if (c == null || c.ConversationId != conversationId || c.Id == Guid.Empty || c.CreatedAt.Offset != TimeSpan.Zero)
                throw new FormatException();
            return c;
        }
        catch (Exception ex) when (ex is FormatException or JsonException or ArgumentException)
        {
            throw ApiException.Invalid("Invalid conversation cursor.");
        }
    }
}

public sealed class MessagingOptions
{
    public int MaxAttachments { get; set; } = 10;
    public long MaxAttachmentBytes { get; set; } = 100 * 1024 * 1024;
    public long MaxVoiceDurationMs { get; set; } = 300000;
    public int MaxGroupMembers { get; set; } = 500;
}

public static class MessagingRules
{
    public static (Guid First, Guid Second) Pair(Guid a, Guid b)
    {
        if (a == Guid.Empty || b == Guid.Empty || a == b)
            throw ApiException.Invalid("Two distinct users are required.");
        return string.CompareOrdinal(a.ToString(), b.ToString()) < 0 ? (a, b) : (b, a);
    }

    public static void Text(string? value, int max, bool required = false)
    {
        if ((required && string.IsNullOrWhiteSpace(value)) || value?.Length > max || value?.Any(c => char.IsControl(c) && c != '\n' && c != '\r' && c != '\t') == true)
            throw ApiException.Invalid($"Text must contain at most {max} characters.");
    }
}
