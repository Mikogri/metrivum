using Metrivum.Messaging.Contracts;
using Metrivum.Training.Contracts;

namespace Metrivum.Integrations.Features;

public sealed record ConnectionDto(
    Guid Id,
    string ClientId,
    string ClientName,
    string[] Grants,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastUsedAt,
    DateTimeOffset? RevokedAt,
    long Version
);

public sealed record GrantUpdate(string[] Grants, long ExpectedVersion);

public sealed record ActionDecision(long ExpectedVersion);

public sealed record ConsentRequest(string[] Grants);

public sealed record ConsentDetails(
    string AuthorizationId,
    string ClientId,
    string ClientName,
    string RedirectUri,
    string[] Scopes,
    string[] AvailableGrants
);

public sealed record ConsentResult(string RedirectUrl, ConnectionDto Connection);

public sealed record RedirectResult(string RedirectUrl);

public sealed record PreferencesDto(string Note, bool ShareWithIntegrations, long Version);

public sealed record PreferencesUpdate(
    string Note,
    bool ShareWithIntegrations,
    long ExpectedVersion
);

public sealed record MessagePayload(
    Guid ConversationId,
    string ConversationTitle,
    McpMessageRecipient[] Recipients,
    string Body,
    string ContextHash
);

public sealed record PendingActionDto(
    Guid Id,
    Guid ConnectionId,
    string ClientName,
    string Type,
    string Status,
    Guid ConversationId,
    string ConversationTitle,
    McpMessageRecipient[] Recipients,
    string Body,
    string PayloadHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? ApprovedAt,
    DateTimeOffset? ExecutedAt,
    Guid? MessageId,
    long Version,
    string ReviewUrl,
    McpProgramAssignmentPreview? Assignment = null,
    Guid? AssignmentId = null
);

public sealed record SendApprovedResult(
    Guid ActionId,
    Guid MessageId,
    Guid ConversationId,
    string Status
);

public sealed record AssignApprovedResult(
    Guid ActionId,
    Guid AssignmentId,
    Guid RelationshipId,
    string Status
);

public sealed record IntegrationActivityDto(
    Guid ConnectionId,
    string ClientName,
    string Operation,
    string Status,
    DateTimeOffset At,
    Guid? ActionId,
    Guid? ResultId
);

/// <summary>Defines supported AI integration grants and their validation rules.</summary>
public static class IntegrationGrants
{
    public const string ReadTraining = "read_training";
    public const string WriteTrainingDrafts = "write_training_drafts";
    public const string AssignPrograms = "assign_programs";
    public const string ReadClients = "read_clients";
    public const string ReadCheckins = "read_checkins";
    public const string ManageCheckins = "manage_checkins";
    public const string ReadMessages = "read_messages";
    public const string PrepareMessages = "prepare_messages";
    public const string SendApprovedMessages = "send_approved_messages";
    public const string ReadFinances = "read_finances";
    public const string ReadCalendar = "read_calendar";
    public static readonly string[] All =
    [
        ReadTraining,
        WriteTrainingDrafts,
        AssignPrograms,
        ReadClients,
        ReadCheckins,
        ManageCheckins,
        ReadMessages,
        PrepareMessages,
        SendApprovedMessages,
        ReadFinances,
        ReadCalendar,
    ];

    public static string Feature(string grant) =>
        grant switch
        {
            "connect" => "integrations.mcp.connect",
            ReadTraining => "integrations.mcp.read-training",
            WriteTrainingDrafts => "integrations.mcp.write-training-drafts",
            AssignPrograms => "integrations.mcp.assign-programs",
            ReadClients => "integrations.mcp.read-clients",
            ReadCheckins => "integrations.mcp.read-checkins",
            ManageCheckins => "integrations.mcp.manage-checkins",
            ReadMessages => "integrations.mcp.read-messages",
            PrepareMessages => "integrations.mcp.prepare-message",
            SendApprovedMessages => "integrations.mcp.send-approved-message",
            ReadFinances => "integrations.mcp.read-analytics",
            ReadCalendar => "integrations.mcp.read-calendar",
            _ => throw Metrivum.BuildingBlocks.ApiException.Invalid("Unknown integration grant."),
        };

    public static string[] Validate(string[]? grants)
    {
        if (
            grants is null
            || grants.Length > All.Length
            || grants.Any(x => !All.Contains(x, StringComparer.Ordinal))
        )
            throw Metrivum.BuildingBlocks.ApiException.Invalid(
                "Select supported Metrivum permissions."
            );
        return grants.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    }
}
