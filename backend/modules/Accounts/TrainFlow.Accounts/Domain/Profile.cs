namespace TrainFlow.Accounts.Domain;

public sealed class Profile
{
    public Guid Id
    {
        get; set;
    }
    public string? Username
    {
        get; set;
    }
    public string? NormalizedUsername
    {
        get; set;
    }
    public string DisplayName { get; set; } = "";
    /// <summary>A short public introduction shown on the profile page (at most 500 characters).</summary>
    public string? Bio
    {
        get; set;
    }
    public string? Phone
    {
        get; set;
    }
    public bool PhoneVisibleToCoach
    {
        get; set;
    }
    public DateOnly? BirthDate
    {
        get; set;
    }
    public string Locale { get; set; } = "en";
    public string TimeZone { get; set; } = "UTC";
    public DateTimeOffset? TermsAcceptedAt
    {
        get; set;
    }
    public string? TermsVersion
    {
        get; set;
    }
    public bool Onboarded
    {
        get; set;
    }
    public bool Active { get; set; } = true;
    public long Version { get; set; } = 1;
    public string Currency { get; set; } = "EUR";
    public string SystemValues { get; set; } = "{}";
    /// <summary>The animated profile cover the person chose: {"background": name, "props": {...}} (null = default).</summary>
    public string? CoverStyle
    {
        get; set;
    }
}

public sealed class Workspace
{
    public Guid Id
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
}

public sealed class UserRole
{
    public Guid UserId
    {
        get; set;
    }
    public string Role { get; set; } = "";
}
