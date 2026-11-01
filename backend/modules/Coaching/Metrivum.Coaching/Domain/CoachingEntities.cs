using Metrivum.Coaching.Contracts;

namespace Metrivum.Coaching.Domain;

public sealed class Relationship
{
    public Guid? TeamId
    {
        get; set;
    }
    public Guid? TeamClientCaseId
    {
        get; set;
    }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId
    {
        get; set;
    }
    public Guid ClientId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public RelationshipStatus Status { get; set; } = RelationshipStatus.Active;
    public ActivationSource ActivationSource
    {
        get; set;
    }
    public DateTimeOffset StartedAt
    {
        get; set;
    }
    public DateTimeOffset? SuspendedAt
    {
        get; set;
    }
    public DateTimeOffset? ResumedAt
    {
        get; set;
    }
    public DateTimeOffset? CompletedAt
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
    public long Version { get; set; } = 1;
}
public sealed class ClientGroup
{
    public Guid? TeamId
    {
        get; set;
    }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Color { get; set; } = "#808080";
    public bool Archived
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
    public long Version { get; set; } = 1;
}
public sealed class GroupMembership
{
    public Guid GroupId
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
public sealed class RelationshipStatusChanged
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public RelationshipStatus PreviousStatus
    {
        get; set;
    }
    public RelationshipStatus NewStatus
    {
        get; set;
    }
    public string? InternalReason
    {
        get; set;
    }
    public DateTimeOffset OccurredAt
    {
        get; set;
    }
    public long Version
    {
        get; set;
    }
}
public sealed class ClientGroupMembershipChanged
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public bool Added
    {
        get; set;
    }
    public DateTimeOffset OccurredAt
    {
        get; set;
    }
    public long Version
    {
        get; set;
    }
}
