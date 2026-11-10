namespace Metrivum.Coaching.Domain;

/// <summary>Represents persisted coach discovery profile state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class CoachDiscoveryProfile
{
    public Guid CoachId { get; set; }
    public bool Published { get; set; }
    public List<string> Specializations { get; set; } = [];
    public List<string> Languages { get; set; } = [];
    public List<string> Modes { get; set; } = [];

    // Entered explicitly for Discovery. Private account location fields are never copied here.
    public string? Location { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; } = 1;
}

/// <summary>Represents persisted discovery publication changed state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class DiscoveryPublicationChanged
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public bool PreviousPublished { get; set; }
    public bool Published { get; set; }
    public long Version { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
}
