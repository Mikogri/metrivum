using System.Text.Json.Serialization;

namespace TrainFlow.Offers.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<OfferPurpose>))]
public enum OfferPurpose { CoachingService, TrainingPlan }

[JsonConverter(typeof(JsonStringEnumConverter<CoachingMode>))]
public enum CoachingMode
{
    Online, Offline, Hybrid
}
[JsonConverter(typeof(JsonStringEnumConverter<OfferStatus>))]
public enum OfferStatus
{
    Draft, Active, Inactive, Archived
}
[JsonConverter(typeof(JsonStringEnumConverter<BillingModel>))]
public enum BillingModel
{
    PerSession, CustomPackage, FixedPackage, PeriodSubscription, OneTime
}
[JsonConverter(typeof(JsonStringEnumConverter<PeriodUnit>))]
public enum PeriodUnit
{
    Week, Month, Year
}
[JsonConverter(typeof(JsonStringEnumConverter<DueRule>))]
public enum DueRule
{
    Upfront, OnStart, EndOfServicePeriod, EndOfCalendarMonth, CustomOffsetDays
}
public sealed record PaymentTerms(DueRule Rule, int? OffsetDays = null);
public sealed record BillingOptionSnapshot(Guid Id, string Name, BillingModel Model, decimal Price,
    int? MinSessions = null, int? MaxSessions = null, int? SessionCount = null,
    int? PeriodCount = null, PeriodUnit? PeriodUnit = null, PaymentTerms? PaymentTerms = null, int? ValidityDays = null);
public sealed record OfferRevisionDto(Guid Id, Guid OfferId, Guid CoachId, int Number, string Name,
    string Description, string Category, CoachingMode CoachingMode, IReadOnlyList<string> Tags,
    Guid? ApplicationFormVersionId, string Currency, IReadOnlyList<BillingOptionSnapshot> BillingOptions, DateTimeOffset PublishedAt, Guid? TeamId = null, string? TeamName = null, OfferPurpose Purpose = OfferPurpose.CoachingService);
public sealed record OfferQuote(Guid OfferId, Guid RevisionId, Guid CoachId, string Name, Guid? ApplicationFormVersionId,
    BillingOptionSnapshot BillingOption, int? SelectedSessionCount, decimal Amount, string Currency, Guid? TeamId = null, OfferPurpose Purpose = OfferPurpose.CoachingService);

/// <summary>What client workflows did with an offer. <c>HadClients</c>: an application for it was accepted at least once.
/// <c>HasOpenIntake</c>: an application or invitation for it is still waiting for someone.</summary>
public sealed record OfferUsage(bool HadClients, bool HasOpenIntake);

/// <summary>Implemented by the modules that run client workflows started from offers.</summary>
public interface IOfferUsage
{
    /// <param name="offerByRevision">Published revision ID to its offer ID, for workflows that only keep the revision.</param>
    Task<IReadOnlyDictionary<Guid, OfferUsage>> GetAsync(IReadOnlyCollection<Guid> offerIds, IReadOnlyDictionary<Guid, Guid> offerByRevision, CancellationToken ct);
}

// Internal workflow contracts. Callers authorize their own application/invitation/service context.
public interface IOfferLibrary
{
    Task<OfferRevisionDto> GetCurrentAsync(Guid offerId, CancellationToken ct);
    Task<OfferRevisionDto> GetRevisionAsync(Guid revisionId, CancellationToken ct);
    Task<OfferQuote> QuoteAsync(Guid revisionId, Guid billingOptionId, int? selectedSessionCount, CancellationToken ct);
}
