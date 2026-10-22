namespace TrainFlow.Coaching.Domain;

public enum ApplicationStatus
{
    InProgress, Submitted, Accepted, Rejected, Withdrawn
}
public enum ApplicationSource
{
    Direct, Invitation
}
public enum InvitationStatus
{
    Pending, Accepted, Declined, Revoked
}
public enum ServiceStatus
{
    Active, Completed
}

public sealed class CoachingApplication
{
    public Guid? TeamId
    {
        get; set;
    }
    public string? TeamConsentVersion
    {
        get; set;
    }
    public DateTimeOffset? TeamConsentAt
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
    public Guid ApplicantUserId
    {
        get; set;
    }
    public Guid OfferId
    {
        get; set;
    }
    public Guid OfferRevisionId
    {
        get; set;
    }
    public string OfferName { get; set; } = "";
    public string OfferSnapshot { get; set; } = "{}";
    public Guid BillingOptionId
    {
        get; set;
    }
    public int? SelectedSessionCount
    {
        get; set;
    }
    public decimal Amount
    {
        get; set;
    }
    public string Currency { get; set; } = "EUR";
    public ApplicationSource Source
    {
        get; set;
    }
    public Guid? InvitationId
    {
        get; set;
    }
    public Guid? FormVersionId
    {
        get; set;
    }
    public Guid? FormSubmissionId
    {
        get; set;
    }
    public string Answers { get; set; } = "{}";
    public ApplicationStatus Status
    {
        get; set;
    }
    public DateTimeOffset? SubmittedAt
    {
        get; set;
    }
    public DateTimeOffset? DecidedAt
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
public sealed class CoachingInvitation
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
    public Guid TargetUserId
    {
        get; set;
    }
    public Guid OfferRevisionId
    {
        get; set;
    }
    public string OfferName { get; set; } = "";
    public string OfferSnapshot { get; set; } = "{}";
    public Guid? BillingOptionId
    {
        get; set;
    }
    public string? Message
    {
        get; set;
    }
    public InvitationStatus Status
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset? RespondedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class RelationshipService
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
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid ApplicationId
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
    public Guid ClientId
    {
        get; set;
    }
    public Guid OfferRevisionId
    {
        get; set;
    }
    public string OfferName { get; set; } = "";
    public string OfferSnapshot { get; set; } = "{}";
    public Guid BillingOptionId
    {
        get; set;
    }
    public int? SelectedSessionCount
    {
        get; set;
    }
    public decimal Amount
    {
        get; set;
    }
    public string Currency { get; set; } = "EUR";
    public Guid OrderId
    {
        get; set;
    }
    public ServiceStatus Status
    {
        get; set;
    }
    public DateTimeOffset StartedAt
    {
        get; set;
    }
    public DateTimeOffset? CompletedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class ApplicationStatusChanged
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public ApplicationStatus PreviousStatus
    {
        get; set;
    }
    public ApplicationStatus NewStatus
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
