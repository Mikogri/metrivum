using Metrivum.Offers.Contracts;

namespace Metrivum.Offers.Domain;

/// <summary>Represents persisted offer state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class Offer
{
    public OfferPurpose Purpose { get; set; }
    public Guid? TeamId
    {
        get; set;
    }
    public string? TeamName
    {
        get; set;
    }
    public Guid Id
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public CoachingMode CoachingMode
    {
        get; set;
    }
    public OfferStatus Status
    {
        get; set;
    }
    public Guid? ApplicationFormVersionId
    {
        get; set;
    }
    public Guid? CurrentPublishedRevisionId
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
}
/// <summary>Represents persisted offer category state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class OfferCategory
{
    public string Key { get; set; } = ""; public string Name { get; set; } = ""; public bool Active { get; set; } = true;
}
/// <summary>Represents persisted offer tag state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class OfferTag
{
    public Guid Id
    {
        get; set;
    }
    public string Name { get; set; } = "";
}
/// <summary>Represents persisted offer tag link state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class OfferTagLink
{
    public Guid OfferId
    {
        get; set;
    }
    public Guid TagId
    {
        get; set;
    }
}
/// <summary>Represents persisted offer revision state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class OfferRevision
{
    public OfferPurpose Purpose { get; set; }
    public Guid? TeamId
    {
        get; set;
    }
    public string? TeamName
    {
        get; set;
    }
    public Guid Id
    {
        get; set;
    }
    public Guid OfferId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public int Number
    {
        get; set;
    }
    public long DraftVersion
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public CoachingMode CoachingMode
    {
        get; set;
    }
    public string Tags { get; set; } = "[]";
    public Guid? ApplicationFormVersionId
    {
        get; set;
    }
    public string Currency { get; set; } = "EUR";
    public DateTimeOffset PublishedAt
    {
        get; set;
    }
}
/// <summary>Represents persisted offer billing option state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class OfferBillingOption
{
    public int? ValidityDays { get; set; }
    public Guid Id
    {
        get; set;
    }
    public Guid OfferId
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public BillingModel Model
    {
        get; set;
    }
    public decimal Price
    {
        get; set;
    }
    public int? MinSessions
    {
        get; set;
    }
    public int? MaxSessions
    {
        get; set;
    }
    public int? SessionCount
    {
        get; set;
    }
    public int? PeriodCount
    {
        get; set;
    }
    public PeriodUnit? PeriodUnit
    {
        get; set;
    }
    public DueRule DueRule
    {
        get; set;
    }
    public int? OffsetDays
    {
        get; set;
    }
}
/// <summary>Represents persisted revision billing option state in Offers; mapped and saved by the owning module's EF services.</summary>
public sealed class RevisionBillingOption
{
    public int? ValidityDays { get; set; }
    public Guid RevisionId
    {
        get; set;
    }
    public Guid Id
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public BillingModel Model
    {
        get; set;
    }
    public decimal Price
    {
        get; set;
    }
    public int? MinSessions
    {
        get; set;
    }
    public int? MaxSessions
    {
        get; set;
    }
    public int? SessionCount
    {
        get; set;
    }
    public int? PeriodCount
    {
        get; set;
    }
    public PeriodUnit? PeriodUnit
    {
        get; set;
    }
    public DueRule DueRule
    {
        get; set;
    }
    public int? OffsetDays
    {
        get; set;
    }
}
