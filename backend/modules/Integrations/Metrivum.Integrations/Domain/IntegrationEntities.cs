namespace Metrivum.Integrations.Domain;

/// <summary>Represents persisted integration connection state in Integrations; mapped and saved by the owning module's EF services.</summary>
public sealed class IntegrationConnection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string ClientId { get; set; } = "";
    public string ClientName { get; set; } = "";
    public string AuthorizationId { get; set; } = "";
    public string[] Grants { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset TokenNotBefore { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public long Version { get; set; } = 1;
}

/// <summary>Represents persisted pending action state in Integrations; mapped and saved by the owning module's EF services.</summary>
public sealed class PendingAction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConnectionId { get; set; }
    public Guid UserId { get; set; }
    public string Type { get; set; } = "SendMessage";
    public string PayloadJson { get; set; } = "";
    public string PayloadHash { get; set; } = "";
    public Guid TargetId { get; set; }
    public long ExpectedRevision { get; set; }
    public long ConnectionVersion { get; set; }
    public string Status { get; set; } = "Pending";
    public Guid IdempotencyKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public Guid? ApprovedBy { get; set; }
    public DateTimeOffset? ExecutedAt { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? AssignmentId { get; set; }
    public string CorrelationId { get; set; } = "";
    public long Version { get; set; } = 1;
}

/// <summary>Represents persisted command receipt state in Integrations; mapped and saved by the owning module's EF services.</summary>
public sealed class CommandReceipt
{
    public Guid ConnectionId { get; set; }
    public string Tool { get; set; } = "";
    public Guid IdempotencyKey { get; set; }
    public string PayloadHash { get; set; } = "";
    public string ResultJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Represents persisted programming preferences state in Integrations; mapped and saved by the owning module's EF services.</summary>
public sealed class ProgrammingPreferences
{
    public Guid UserId { get; set; }
    public string Note { get; set; } = "";
    public bool ShareWithIntegrations { get; set; }
    public long Version { get; set; } = 1;
}

