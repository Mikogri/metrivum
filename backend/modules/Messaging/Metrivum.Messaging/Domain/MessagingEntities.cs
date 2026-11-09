namespace Metrivum.Messaging.Domain;

public enum ConversationType
{
    Direct,
    Group,
    ClientGroupLinked
}

public enum MemberSource
{
    Direct,
    Manual,
    ClientGroupSync
}

public enum MemberRole
{
    Owner,
    Admin,
    Member
}

public enum MemberState
{
    Active,
    Removed,
    Left,
    Banned
}

public enum MessageType
{
    Text,
    Image,
    File,
    Video,
    VoiceMessage,
    System
}

public enum RequestState
{
    Pending,
    Accepted,
    Declined,
    Cancelled
}

/// <summary>Represents persisted conversation state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public ConversationType Type
    {
        get; set;
    }
    public string Title { get; set; } = "";
    public Guid? PairFirst
    {
        get; set;
    }
    public Guid? PairSecond
    {
        get; set;
    }
    public Guid? ClientGroupId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Sequence
    {
        get; set;
    }
}

/// <summary>Represents persisted conversation member state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class ConversationMember
{
    public Guid ConversationId
    {
        get; set;
    }
    public Guid UserId
    {
        get; set;
    }
    public MemberSource Source
    {
        get; set;
    }
    public MemberRole Role
    {
        get; set;
    }
    public MemberState State
    {
        get; set;
    }
    public bool Excluded
    {
        get; set;
    }
    public DateTimeOffset JoinedAt
    {
        get; set;
    }
    public DateTimeOffset? RemovedAt
    {
        get; set;
    }
    public long? CutoffSequence
    {
        get; set;
    }
    public long LastReadSequence
    {
        get; set;
    }
    public Guid? LastReadMessageId
    {
        get; set;
    }
    public DateTimeOffset? LastReadAt
    {
        get; set;
    }
}

/// <summary>Represents persisted membership change state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MembershipChange
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId
    {
        get; set;
    }
    public Guid UserId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public MemberState State
    {
        get; set;
    }
    public MemberSource Source
    {
        get; set;
    }
    public DateTimeOffset OccurredAt
    {
        get; set;
    }
    public long BoundarySequence
    {
        get; set;
    }
}

/// <summary>Represents persisted message state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class Message
{
    public string? CoachingEntryJson { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId
    {
        get; set;
    }
    public Guid SenderUserId
    {
        get; set;
    }
    public MessageType Type
    {
        get; set;
    }
    public string? Body
    {
        get; set;
    }
    public Guid? ReplyToMessageId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public long Sequence
    {
        get; set;
    }
    public DateTimeOffset? DeletedAt
    {
        get; set;
    }
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
}

/// <summary>Represents persisted message attachment state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MessageAttachment
{
    public Guid MessageId
    {
        get; set;
    }
    public Guid MediaId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public string ContentType { get; set; } = "";
    public long Size
    {
        get; set;
    }
    public long? DurationMs
    {
        get; set;
    }
}

/// <summary>Represents persisted message request state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MessageRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? IntroductionMessageId { get; set; }
    public Guid SenderUserId
    {
        get; set;
    }
    public Guid RecipientUserId
    {
        get; set;
    }
    public Guid PairFirst
    {
        get; set;
    }
    public Guid PairSecond
    {
        get; set;
    }
    public string Body { get; set; } = "";
    public RequestState State
    {
        get; set;
    }
    public Guid? ConversationId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
}

/// <summary>Represents persisted user block state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class UserBlock
{
    public Guid UserId
    {
        get; set;
    }
    public Guid BlockedUserId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}

/// <summary>Represents persisted messaging preference state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MessagingPreference
{
    public Guid UserId { get; set; }
    public bool RequireApproval { get; set; }
}

/// <summary>Represents persisted message report state in Messaging; mapped and saved by the owning module's EF services.</summary>
public sealed class MessageReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ReporterUserId
    {
        get; set;
    }
    public Guid MessageId
    {
        get; set;
    }
    public Guid ConversationId
    {
        get; set;
    }
    public string Category { get; set; } = "";
    public string? Details
    {
        get; set;
    }
    public string Evidence { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
