namespace Metrivum.Coaching.Domain;

/// <summary>What a coach tells people looking at their profile: a headline, experience and competencies.</summary>
public sealed class CoachShowcase
{
    public Guid CoachId { get; set; }
    public string? Headline { get; set; }
    public int? YearsExperience { get; set; }
    public List<string> Competencies { get; set; } = [];
    /// <summary>A custom cover photo (Pro plan only); without one the profile shows the animated default.</summary>
    public Guid? CoverMediaId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; } = 1;
}

public enum PortfolioKind
{
    Certificate,
    ClientResult,
    Other
}

/// <summary>One portfolio file (a certificate, a client's result, …) shown on the coach's profile.</summary>
public sealed class CoachPortfolioItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public PortfolioKind Kind { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public Guid MediaId { get; set; }
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
