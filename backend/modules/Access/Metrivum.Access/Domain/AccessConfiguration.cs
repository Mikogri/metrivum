namespace Metrivum.Access.Domain;

/// <summary>Represents persisted access configuration state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class AccessConfiguration
{
    public string Id { get; set; } = "";
    public long Version { get; set; } = 1;
    public string[] GrantedFeatures { get; set; } = [];
}
/// <summary>Represents persisted access assignment state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class AccessAssignment
{
    public Guid UserId
    {
        get; set;
    }
    public string ConfigurationId { get; set; } = "v1-default";
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted feature override state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class FeatureOverride
{
    public Guid UserId
    {
        get; set;
    }
    public string Key { get; set; } = "";
    public bool Granted
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted feature flag state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class FeatureFlag
{
    public string Key { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public long Version { get; set; } = 1;
}
/// <summary>Represents persisted access audit state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class AccessAudit
{
    public Guid Id
    {
        get; set;
    }
    public Guid ActorId
    {
        get; set;
    }
    public string Operation { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Change { get; set; } = "";
    public DateTimeOffset At
    {
        get; set;
    }
}
