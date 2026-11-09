namespace Metrivum.Accounts.Domain;

/// <summary>Represents persisted profile state in Accounts; mapped and saved by the owning module's EF services.</summary>
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
    /// <summary>Given name, entered on its own. DisplayName is "FirstName LastName" (null on accounts named before the split).</summary>
    public string? FirstName
    {
        get; set;
    }
    /// <summary>Family name, entered on its own.</summary>
    public string? LastName
    {
        get; set;
    }
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
    /// <summary>The profile photo (an image the person uploaded); null shows the initials.</summary>
    public Guid? AvatarMediaId
    {
        get; set;
    }
}

/// <summary>Represents persisted workspace state in Accounts; mapped and saved by the owning module's EF services.</summary>
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

/// <summary>Represents persisted user role state in Accounts; mapped and saved by the owning module's EF services.</summary>
public sealed class UserRole
{
    public Guid UserId
    {
        get; set;
    }
    public string Role { get; set; } = "";
}
