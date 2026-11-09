namespace Metrivum.Access.Infrastructure;

/// <summary>Represents persisted abuse window state in Access; mapped and saved by the owning module's EF services.</summary>
public sealed class AbuseWindow
{
    public Guid UserId { get; set; }
    public string Policy { get; set; } = "";
    public DateTimeOffset WindowStart { get; set; }
    public int Count { get; set; }
}
