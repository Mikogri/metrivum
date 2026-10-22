namespace TrainFlow.Coaching.Contracts;

public sealed record McpClient(Guid RelationshipId, Guid ClientId, string DisplayName, string? Username, RelationshipStatus Status,
    DateTimeOffset StartedAt, DateTimeOffset UpdatedAt, long Revision);
public sealed record McpClientPage(McpClient[] Items, int Page, int PageSize, long Total);
public sealed record McpClientTrainingContext(McpClient Relationship,
    IReadOnlyDictionary<string, System.Text.Json.JsonElement> TrainingPreferences, DateTimeOffset? ProfileMeasuredAt);
public sealed record McpLead(Guid Id, Guid ApplicantId, string DisplayName, string OfferName, string Source, string Status,
    DateTimeOffset CreatedAt, DateTimeOffset? SubmittedAt, Guid? RelationshipId);
public sealed record McpLeadPage(McpLead[] Items, int Page, int PageSize, long Total);
public interface IMcpClientOperations
{
    Task<McpClientPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct);
    Task<McpClient> GetAsync(Guid relationshipId, CancellationToken ct);
    Task<McpClientTrainingContext> ContextAsync(Guid relationshipId, CancellationToken ct);
    Task<McpLeadPage> LeadsAsync(int page, int pageSize, string? search, CancellationToken ct);
}
