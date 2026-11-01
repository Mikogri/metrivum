namespace Metrivum.Coaching.Domain;

public sealed class TeamClientCase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamId
    {
        get; set;
    }
    public Guid ClientId
    {
        get; set;
    }
    public string Status { get; set; } = "Active";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset? EndedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}

public sealed class TeamCoachAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamClientCaseId
    {
        get; set;
    }
    public Guid TeamId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public DateTimeOffset StartedAt
    {
        get; set;
    }
    public DateTimeOffset? EndedAt
    {
        get; set;
    }
    public Guid AssignedBy
    {
        get; set;
    }
}

public sealed class ClientTransferRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid TeamId
    {
        get; set;
    }
    public string TeamName { get; set; } = "";
    public Guid ClientId
    {
        get; set;
    }
    public Guid ProposedBy
    {
        get; set;
    }
    public string Status { get; set; } = "Pending";
    public string ConsentVersion { get; set; } = "team-future-scope-v1";
    public string ConsentText { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset ExpiresAt
    {
        get; set;
    }
    public DateTimeOffset? DecidedAt
    {
        get; set;
    }
    public Guid? DecidedBy
    {
        get; set;
    }
    public Guid? TeamClientCaseId
    {
        get; set;
    }
    public long SourceRelationshipVersion
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}

public sealed class TeamCaseChange
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamClientCaseId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public Guid? CoachId
    {
        get; set;
    }
    public string Kind { get; set; } = "";
    public DateTimeOffset OccurredAt
    {
        get; set;
    }
    public long Version
    {
        get; set;
    }
}

public sealed class TeamTransferChange
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TransferRequestId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public string Status { get; set; } = "";
    public DateTimeOffset OccurredAt
    {
        get; set;
    }
    public long Version
    {
        get; set;
    }
}
