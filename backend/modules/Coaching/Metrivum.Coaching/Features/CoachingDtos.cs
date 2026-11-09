using Metrivum.Coaching.Contracts;

namespace Metrivum.Coaching.Features;

public sealed record PersonDto(Guid Id, string DisplayName, string? Username);
public sealed record CoachRelationshipDto(Guid Id, PersonDto Client, RelationshipStatus Status, DateTimeOffset StartedAt, DateTimeOffset? SuspendedAt, DateTimeOffset? ResumedAt, DateTimeOffset? CompletedAt, long Version, DateTimeOffset UpdatedAt, Guid[] GroupIds, StatusChangeDto[] StatusHistory, string[] AllowedActions, string? ClientPhone = null, Guid? TeamId = null, Guid? TeamClientCaseId = null, string? TeamName = null, PersonDto? AssignedCoach = null);
public sealed record StatusChangeDto(Guid ActorId, DateTimeOffset OccurredAt, RelationshipStatus PreviousStatus, RelationshipStatus NewStatus, string? InternalReason, long Version);
public sealed record ClientRelationshipDto(Guid Id, PersonDto Coach, RelationshipStatus Status, string[] AllowedActions, Guid? TeamId = null, Guid? TeamClientCaseId = null);
public sealed record GroupDto(Guid Id, string Name, string Description, string Color, bool Archived, long Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string[] AllowedActions, Guid? TeamId = null);
public sealed record GroupRequest(string Name, string Description, string Color, Guid? TeamId = null);
public sealed record StatusRequest(string? InternalReason);
public sealed record Paged<T>(T[] Items, int Page, int PageSize, long Total);
/// <summary>Carries coaching list query fields for Coaching filtering or query projection; has no independent database writes.</summary>
public sealed class CoachingListQuery
{
    public Guid? TeamId
    {
        get; set;
    }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Search
    {
        get; set;
    }
    public string Sort { get; set; } = "updated";
    public RelationshipStatus? Status
    {
        get; set;
    }
    public Guid[] GroupIds { get; set; } = [];
    /// <summary>Only clients whose current service comes from this offer.</summary>
    public Guid? OfferId
    {
        get; set;
    }
    /// <summary>Only clients whose current service is in this offer category (strength, endurance...).</summary>
    public string? OfferCategory
    {
        get; set;
    }
}
