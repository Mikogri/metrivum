using System.Text.Json;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Forms.Contracts;
using Metrivum.Offers.Contracts;

namespace Metrivum.Coaching.Features;

public sealed record StartApplicationRequest(Guid OfferId, Guid BillingOptionId, int? SelectedSessionCount = null, Guid? InvitationId = null);
public sealed record SaveApplicationRequest(IReadOnlyDictionary<string, JsonElement> Answers, Guid? BillingOptionId = null, int? SelectedSessionCount = null);
public sealed record SubmitApplicationRequest(IReadOnlyDictionary<string, JsonElement> Answers, IReadOnlyList<SystemFieldKey>? SaveProfileFields = null, long? ProfileVersion = null, bool AcceptTeamScope = false);
public sealed record AcceptApplicationRequest(SettlementMode SettlementMode = SettlementMode.Simulated, Guid? TrainingPlanRevisionId = null);
public sealed record RejectApplicationRequest(string? InternalReason = null);
public sealed record CreateInvitationRequest(string Username, Guid OfferId, Guid? BillingOptionId = null, string? Message = null);
public sealed record ApplicationDto(Guid Id, Guid CoachId, Guid ApplicantUserId, PersonDto Applicant, string OfferName, Guid OfferRevisionId, Guid BillingOptionId, int? SelectedSessionCount, decimal Amount, string Currency, ApplicationSource Source, Guid? InvitationId, ApplicationStatus Status, DateTimeOffset? SubmittedAt, DateTimeOffset? DecidedAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, long Version, Guid? RelationshipId, Guid? ServiceId, string[] AllowedActions, string? OfferCategory = null);
public sealed record ApplicationDetailDto(ApplicationDto Application, OfferRevisionDto OfferRevision, FormVersionDto? FormVersion, IReadOnlyDictionary<string, JsonElement> Answers, IReadOnlyDictionary<SystemFieldKey, JsonElement>? ProfilePrefill, long? ProfileVersion);
public sealed record ApplicationDecisionDto(Guid ActorId, DateTimeOffset OccurredAt, ApplicationStatus PreviousStatus, ApplicationStatus NewStatus, string? InternalReason, long Version);
public sealed record CoachApplicationDetailDto(ApplicationDetailDto Detail, IReadOnlyDictionary<SystemFieldKey, JsonElement> CurrentAllowedProfile, ApplicationDecisionDto[] History);
public sealed record InvitationDto(Guid Id, Guid CoachId, PersonDto Coach, Guid TargetUserId, PersonDto Target, OfferRevisionDto OfferRevision, Guid? BillingOptionId, string? Message, InvitationStatus Status, DateTimeOffset CreatedAt, DateTimeOffset? RespondedAt, long Version, Guid? ApplicationId, string[] AllowedActions);
public sealed record RelationshipServiceDto(Guid Id, Guid RelationshipId, Guid ApplicationId, string OfferName, OfferRevisionDto OfferRevision, Guid BillingOptionId, int? SelectedSessionCount, decimal Amount, string Currency, Guid OrderId, ServiceStatus Status, DateTimeOffset StartedAt, DateTimeOffset? CompletedAt, DateTimeOffset UpdatedAt, long Version, string[] AllowedActions, ServiceBillingState? CurrentBilling = null);
public sealed record CurrentRelationshipServiceDto(Guid RelationshipId, string OfferName, ServiceBillingState? CurrentBilling, CoachingMode? CoachingMode = null, string? OfferCategory = null);

public sealed record RelationshipProfileDto(IReadOnlyDictionary<SystemFieldKey, JsonElement> CurrentAllowedProfile);
