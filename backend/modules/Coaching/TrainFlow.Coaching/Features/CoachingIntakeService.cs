using TrainFlow.Notifications.Contracts;
using System.Text.Json;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Forms.Contracts;
using TrainFlow.Offers.Contracts;

namespace TrainFlow.Coaching.Features;

public sealed class CoachingIntakeService(CoachingDbContext db, IAccountContext accounts, IAccountDirectory directory,
    IAccountProfileFields profile, IFeatureAccessService access, IOfferLibrary offers, IFormLibrary forms,
    IBillingOrders billing, IRelationshipActivation activation, IRelationshipAccessPolicy policy,
    ModuleTransaction transactions, TimeProvider clock, INotificationPublisher notifications, ITeamContext? teams = null, TeamClientsService? teamClients = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<ApplicationDetailDto> StartApplicationAsync(StartApplicationRequest request, CancellationToken ct)
    {
        var client = await ClientAsync("coaching.applications.submit-own", ct);
        return await transactions.RunAsync(async token =>
        {
            CoachingInvitation? invitation = null;
            OfferRevisionDto revision;
            if (request.InvitationId.HasValue)
            {
                await LockAsync("invitation:" + request.InvitationId, token);
                invitation = await db.Invitations.SingleOrDefaultAsync(x => x.Id == request.InvitationId && x.TargetUserId == client.UserId, token) ?? throw ApiException.NotFound();
                if (invitation.Status != InvitationStatus.Accepted)
                    throw ApiException.Conflict("Accept this invitation before starting its application.");
                revision = Read<OfferRevisionDto>(invitation.OfferSnapshot);
                if (request.OfferId != revision.OfferId)
                    throw ApiException.Invalid("Use the offer linked to this invitation.");
                if (invitation.BillingOptionId.HasValue && invitation.BillingOptionId != request.BillingOptionId)
                    throw ApiException.Invalid("Use the invitation's selected billing option.");
                var previous = await db.Applications.AsNoTracking().SingleOrDefaultAsync(x => x.InvitationId == invitation.Id, token);
                if (previous != null)
                    return await OwnDetailAsync(previous, token);
            }
            else
                revision = await offers.GetCurrentAsync(request.OfferId, token);
            if (revision.CoachId == client.UserId)
                throw ApiException.Invalid("You cannot apply to your own offer.");
            var people = await directory.GetAccountsAsync([revision.CoachId], token);
            if (!people.TryGetValue(revision.CoachId, out var coach) || !coach.Roles.Contains(AccountRole.Coach))
                throw ApiException.NotFound();
            var form = invitation == null
                ? await forms.RequireUsableVersionAsync(revision.ApplicationFormVersionId, revision.CoachId, FormPurpose.Application, token)
                : await forms.GetVersionAsync(revision.ApplicationFormVersionId, token);
            if (form.CoachId != revision.CoachId || form.Purpose != FormPurpose.Application)
                throw ApiException.Conflict("The offer does not reference its owner's application form.");
            var quote = await offers.QuoteAsync(revision.Id, request.BillingOptionId, request.SelectedSessionCount, token);
            var now = clock.GetUtcNow();
            var application = new CoachingApplication { TeamId = revision.TeamId, CoachId = coach.UserId, WorkspaceId = coach.WorkspaceId, ApplicantUserId = client.UserId, OfferId = revision.OfferId, OfferRevisionId = revision.Id, OfferName = revision.Name, OfferSnapshot = Write(revision), FormVersionId = form.Id, BillingOptionId = quote.BillingOption.Id, SelectedSessionCount = quote.SelectedSessionCount, Amount = quote.Amount, Currency = quote.Currency, Source = invitation == null ? ApplicationSource.Direct : ApplicationSource.Invitation, InvitationId = invitation?.Id, CreatedAt = now, UpdatedAt = now };
            db.Applications.Add(application);
            await SaveAsync(token);
            return await OwnDetailAsync(application, token);
        }, ct);
    }

    public async Task<ApplicationDetailDto> SaveDraftAsync(Guid id, SaveApplicationRequest request, long version, CancellationToken ct)
    {
        var client = await ClientAsync("coaching.applications.submit-own", ct);
        var app = await OwnApplicationAsync(id, client.UserId, ct);
        CoachingService.CheckVersion(app.Version, version);
        RequireState(app, ApplicationStatus.InProgress);
        ValidateDraftAnswers(request.Answers);
        var form = await forms.GetVersionAsync(app.FormVersionId, ct);
        var known = form.Definition.Sections.SelectMany(x => x.Questions).Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
        if (request.Answers.Keys.Any(x => !known.Contains(x)))
            throw ApiException.Invalid("Answers contain an unknown question.");
        if (request.BillingOptionId.HasValue)
        {
            if (app.InvitationId.HasValue)
            {
                var invitation = await db.Invitations.AsNoTracking().SingleAsync(x => x.Id == app.InvitationId, ct);
                if (invitation.BillingOptionId.HasValue && invitation.BillingOptionId != request.BillingOptionId)
                    throw ApiException.Invalid("Use the invitation's selected billing option.");
            }
            var quote = await offers.QuoteAsync(app.OfferRevisionId, request.BillingOptionId.Value, request.SelectedSessionCount, ct);
            app.BillingOptionId = quote.BillingOption.Id;
            app.SelectedSessionCount = quote.SelectedSessionCount;
            app.Amount = quote.Amount;
            app.Currency = quote.Currency;
        }
        app.Answers = Write(request.Answers);
        Touch(app);
        await SaveAsync(ct);
        return await OwnDetailAsync(app, ct);
    }

    public async Task<ApplicationDetailDto> SubmitAsync(Guid id, SubmitApplicationRequest request, long version, CancellationToken ct)
    {
        var client = await ClientAsync("coaching.applications.submit-own", ct);
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("application:" + id, token);
            var app = await OwnApplicationAsync(id, client.UserId, token);
            CoachingService.CheckVersion(app.Version, version);
            if (app.TeamId != null && !request.AcceptTeamScope)
                throw ApiException.Invalid("Explicitly accept this Team as your organizational coaching counterparty before submitting.");
            if (app.Status == ApplicationStatus.Submitted)
            {
                ValidateDraftAnswers(request.Answers);
                await forms.SubmitAsync(new(app.FormVersionId, client.UserId, "application:" + app.Id, request.Answers), token);
                return await OwnDetailAsync(app, token);
            }
            RequireState(app, ApplicationStatus.InProgress);
            ValidateDraftAnswers(request.Answers);
            if (app.Source == ApplicationSource.Direct)
            {
                OfferRevisionDto current;
                try
                {
                    current = await offers.GetCurrentAsync(app.OfferId, token);
                }
                catch (ApiException ex) when (ex.Status == 404) { throw ApiException.Conflict("This offer is no longer accepting direct applications."); }
                if (current.CoachId != app.CoachId)
                    throw ApiException.Conflict("The offer is no longer available.");
            }
            else
            {
                var invitation = await db.Invitations.AsNoTracking().SingleAsync(x => x.Id == app.InvitationId, token);
                if (invitation.Status != InvitationStatus.Accepted || invitation.TargetUserId != client.UserId)
                    throw ApiException.Conflict("The invitation is not accepted.");
            }
            await offers.QuoteAsync(app.OfferRevisionId, app.BillingOptionId, app.SelectedSessionCount, token);
            await forms.ValidateAsync(app.FormVersionId, request.Answers, token);
            var form = await forms.GetVersionAsync(app.FormVersionId, token);
            if (request.SaveProfileFields is { Count: > 0 })
            {
                if (request.ProfileVersion is null)
                    throw ApiException.Invalid("ProfileVersion is required when saving mapped profile values.");
                var mappings = form.Definition.Sections.SelectMany(x => x.Questions).Where(x => x.SystemField.HasValue).ToDictionary(x => x.SystemField!.Value, x => x.Key);
                var values = new Dictionary<SystemFieldKey, JsonElement>();
                foreach (var field in request.SaveProfileFields.Distinct())
                {
                    if (!Enum.IsDefined(field) || !mappings.TryGetValue(field, out var key) || !request.Answers.TryGetValue(key, out var value))
                        throw ApiException.Invalid("Only answered system fields mapped by this exact form version can update your profile.");
                    values[field] = field == SystemFieldKey.PreferredTrainingDays
                        ? JsonSerializer.SerializeToElement(value.EnumerateArray().Select(x => int.Parse(x.GetString()!, CultureInfo.InvariantCulture)).ToArray())
                        : value.Clone();
                }
                await profile.UpdateOwnAsync(values, request.ProfileVersion.Value, token);
            }
            var submission = await forms.SubmitAsync(new(app.FormVersionId, client.UserId, "application:" + app.Id, request.Answers), token);
            app.FormSubmissionId = submission.Id;
            app.Answers = Write(submission.Answers);
            app.SubmittedAt = clock.GetUtcNow();
            if (app.TeamId != null)
            {
                app.TeamConsentVersion = "team-acquisition-v1";
                app.TeamConsentAt = app.SubmittedAt;
            }
            Change(app, ApplicationStatus.Submitted, client.UserId, null);
            await notifications.PublishAsync(new(app.CoachId, "application:" + app.Id + ":Submitted", "ApplicationSubmitted", "Coaching", "Coaching", app.Id, "/app/applications/" + app.Id), token);
            await SaveAsync(token);
            return await OwnDetailAsync(app, token);
        }, ct);
    }

    public async Task<ApplicationDto> WithdrawAsync(Guid id, long version, CancellationToken ct)
    {
        var client = await ClientAsync("coaching.applications.submit-own", ct);
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("application:" + id, token);
            var app = await OwnApplicationAsync(id, client.UserId, token);
            CoachingService.CheckVersion(app.Version, version);
            if (app.Status == ApplicationStatus.Withdrawn)
                return (await ApplicationDtosAsync([app], false, token))[0];
            if (app.Status is not (ApplicationStatus.InProgress or ApplicationStatus.Submitted))
                throw ApiException.Conflict("Only a draft or submitted application can be withdrawn.");
            Change(app, ApplicationStatus.Withdrawn, client.UserId, null);
            await SaveAsync(token);
            return (await ApplicationDtosAsync([app], false, token))[0];
        }, ct);
    }

    public async Task<ApplicationDto> RejectAsync(Guid id, RejectApplicationRequest request, long version, CancellationToken ct)
    {
        var coach = await CoachAsync("coaching.applications.manage", ct);
        Text(request.InternalReason, 1000);
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("application:" + id, token);
            var app = await CoachApplicationAsync(id, coach, token);
            CoachingService.CheckVersion(app.Version, version);
            if (app.Status == ApplicationStatus.Rejected)
                return (await ApplicationDtosAsync([app], true, token))[0];
            RequireState(app, ApplicationStatus.Submitted);
            app.DecidedAt = clock.GetUtcNow();
            Change(app, ApplicationStatus.Rejected, coach.UserId, request.InternalReason);
            await notifications.PublishAsync(new(app.ApplicantUserId, "application:" + app.Id + ":Rejected", "ApplicationRejected", "Coaching", "Coaching", app.Id, "/app/applications/" + app.Id), token);
            await SaveAsync(token);
            return (await ApplicationDtosAsync([app], true, token))[0];
        }, ct);
    }

    public async Task<ApplicationDto> AcceptAsync(Guid id, AcceptApplicationRequest request, long version, CancellationToken ct)
    {
        var coach = await CoachAsync("coaching.applications.manage", ct);
        await access.RequireAsync("coaching.services.manage", ct);
        if (!Enum.IsDefined(request.SettlementMode))
            throw ApiException.Invalid("Invalid settlement mode.");
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("application:" + id, token);
            var app = await CoachApplicationAsync(id, coach, token);
            CoachingService.CheckVersion(app.Version, version);
            if (app.Status == ApplicationStatus.Accepted)
                return (await ApplicationDtosAsync([app], true, token))[0];
            RequireState(app, ApplicationStatus.Submitted);
            var quote = await offers.QuoteAsync(app.OfferRevisionId, app.BillingOptionId, app.SelectedSessionCount, token);
            if (quote.CoachId != coach.UserId || quote.Amount != app.Amount || quote.Currency != app.Currency || quote.ApplicationFormVersionId != app.FormVersionId)
                throw ApiException.Conflict("The application's historical terms do not match its offer revision.");
            var submission = await forms.GetSubmissionAsync(app.FormSubmissionId!.Value, token);
            if (submission.RespondentId != app.ApplicantUserId || submission.FormVersionId != app.FormVersionId)
                throw ApiException.Conflict("The application submission does not match.");
            Relationship? teamRelationship = app.TeamId == null ? null : await (teamClients ?? throw ApiException.Conflict("Team intake is unavailable.")).AcceptApplicationAsync(app, token);
            var relationshipId = teamRelationship?.Id ?? await activation.ActivateAcceptedApplicationAsync(coach.UserId, app.ApplicantUserId, token);
            var now = clock.GetUtcNow();
            var service = new RelationshipService { TeamId = app.TeamId, TeamClientCaseId = teamRelationship?.TeamClientCaseId, RelationshipId = relationshipId, ApplicationId = app.Id, CoachId = coach.UserId, WorkspaceId = coach.WorkspaceId, ClientId = app.ApplicantUserId, OfferRevisionId = app.OfferRevisionId, OfferName = app.OfferName, OfferSnapshot = app.OfferSnapshot, BillingOptionId = app.BillingOptionId, SelectedSessionCount = app.SelectedSessionCount, Amount = app.Amount, Currency = app.Currency, StartedAt = now, UpdatedAt = now };
            var order = await billing.CreateForServiceAsync(new(service.Id, relationshipId, coach.UserId, app.ApplicantUserId, app.OfferRevisionId, app.BillingOptionId, app.SelectedSessionCount, now, request.SettlementMode, app.TeamId, teamRelationship?.TeamClientCaseId), token);
            if (order.Amount != service.Amount || order.Currency != service.Currency)
                throw ApiException.Conflict("The order does not match the accepted historical terms.");
            service.OrderId = order.OrderId;
            db.Services.Add(service);
            app.DecidedAt = now;
            Change(app, ApplicationStatus.Accepted, coach.UserId, null);
            await notifications.PublishAsync(new(app.ApplicantUserId, "application:" + app.Id + ":Accepted", "ApplicationAccepted", "Coaching", "Coaching", app.Id, "/app/applications/" + app.Id), token);
            await SaveAsync(token);
            return (await ApplicationDtosAsync([app], true, token))[0];
        }, ct);
    }

    public async Task<Paged<ApplicationDto>> ApplicationsAsync(bool coachSide, int page, int pageSize, string? search, string sort, ApplicationStatus? status, Guid? offerId, CancellationToken ct)
    {
        ValidateList(page, pageSize, search, sort);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid application status.");
        IQueryable<CoachingApplication> query;
        if (coachSide)
        {
            var coach = await CoachAsync("coaching.applications.manage", ct);
            var team = teams == null ? null : await teams.GetForUserAsync(coach.UserId, ct);
            var teamId = team?.TeamId ?? Guid.Empty;
            query = db.Applications.AsNoTracking().Where(x => x.CoachId == coach.UserId && x.WorkspaceId == coach.WorkspaceId && x.SubmittedAt != null);
            query = query.Where(x => x.TeamId == null || x.TeamId == teamId);
        }
        else
        {
            var client = await ClientAsync("coaching.applications.submit-own", ct);
            query = db.Applications.AsNoTracking().Where(x => x.ApplicantUserId == client.UserId);
        }
        if (status.HasValue)
            query = query.Where(x => x.Status == status);
        if (offerId.HasValue)
            query = query.Where(x => x.OfferId == offerId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.OfferName.ToLower().Contains(text));
        }
        var total = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "created" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            "status" => query.OrderBy(x => x.Status).ThenBy(x => x.Id),
            "name" => query.OrderBy(x => x.OfferName).ThenBy(x => x.Id),
            _ => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
        };
        var rows = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(await ApplicationDtosAsync(rows, coachSide, ct), page, pageSize, total);
    }

    public async Task<object> ApplicationAsync(Guid id, CancellationToken ct)
    {
        var app = await db.Applications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (x.ApplicantUserId == accounts.UserId || x.CoachId == accounts.UserId && x.SubmittedAt != null), ct) ?? throw ApiException.NotFound();
        if (app.ApplicantUserId == accounts.UserId)
        {
            await ClientAsync("coaching.applications.submit-own", ct);
            return await OwnDetailAsync(app, ct);
        }
        var coach = await CoachAsync("coaching.applications.manage", ct);
        if (app.WorkspaceId != coach.WorkspaceId)
            throw ApiException.NotFound();
        await CheckTeam(app.TeamId, false, ct);
        var detail = await DetailAsync(app, true, ct);
        var currentProfile = await profile.GetAllowedForUserAsync(app.ApplicantUserId, ct);
        var history = await db.ApplicationChanges.AsNoTracking().Where(x => x.ApplicationId == app.Id).OrderBy(x => x.Version).Select(x => new ApplicationDecisionDto(x.ActorId, x.OccurredAt, x.PreviousStatus, x.NewStatus, x.InternalReason, x.Version)).ToArrayAsync(ct);
        return new CoachApplicationDetailDto(detail, currentProfile.Values, history);
    }

    public async Task<InvitationDto> CreateInvitationAsync(CreateInvitationRequest request, CancellationToken ct)
    {
        var coach = await CoachAsync("coaching.invitations.send", ct);
        Text(request.Username, 100, true);
        Text(request.Message, 2000);
        var target = await directory.ResolveExactUsernameAsync(request.Username.Trim(), ct) ?? throw ApiException.NotFound();
        if (target.UserId == coach.UserId)
            throw ApiException.Invalid("You cannot invite yourself.");
        var revision = await offers.GetCurrentAsync(request.OfferId, ct);
        if (revision.CoachId != coach.UserId)
            throw ApiException.NotFound();
        await forms.RequireUsableVersionAsync(revision.ApplicationFormVersionId, coach.UserId, FormPurpose.Application, ct);
        if (request.BillingOptionId.HasValue && !revision.BillingOptions.Any(x => x.Id == request.BillingOptionId))
            throw ApiException.Invalid("Invalid billing option for this offer revision.");
        await CheckTeam(revision.TeamId, true, ct);
        var invitation = new CoachingInvitation { TeamId = revision.TeamId, CoachId = coach.UserId, WorkspaceId = coach.WorkspaceId, TargetUserId = target.UserId, OfferRevisionId = revision.Id, OfferName = revision.Name, OfferSnapshot = Write(revision), BillingOptionId = request.BillingOptionId, Message = request.Message, CreatedAt = clock.GetUtcNow() };
        await transactions.RunAsync(async token =>
        {
            db.Invitations.Add(invitation);
            await SaveAsync(token);
            await notifications.PublishAsync(new(invitation.TargetUserId, "invitation:" + invitation.Id, "InvitationReceived", "Coaching", "Coaching", invitation.Id, "/app/invitations/" + invitation.Id), token);
        }, ct);
        return (await InvitationDtosAsync([invitation], true, ct))[0];
    }

    public async Task<InvitationDto> RespondInvitationAsync(Guid id, InvitationStatus target, long version, CancellationToken ct)
    {
        var coachSide = target == InvitationStatus.Revoked;
        var identity = coachSide ? await CoachAsync("coaching.invitations.send", ct) : await ClientAsync("coaching.invitations.respond-own", ct);
        if (target is not (InvitationStatus.Accepted or InvitationStatus.Declined or InvitationStatus.Revoked))
            throw ApiException.Invalid("Unsupported invitation response.");
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("invitation:" + id, token);
            var invitation = await db.Invitations.SingleOrDefaultAsync(x => x.Id == id && (coachSide ? x.CoachId == identity.UserId && x.WorkspaceId == identity.WorkspaceId : x.TargetUserId == identity.UserId), token) ?? throw ApiException.NotFound();
            if (coachSide)
                await CheckTeam(invitation.TeamId, true, token);
            CoachingService.CheckVersion(invitation.Version, version);
            if (invitation.Status == target)
                return (await InvitationDtosAsync([invitation], coachSide, token))[0];
            if (invitation.Status != InvitationStatus.Pending)
                throw ApiException.Conflict("Only a pending invitation can be answered or revoked.");
            await notifications.PublishAsync(new(coachSide ? invitation.TargetUserId : invitation.CoachId, "invitation:" + invitation.Id + ":" + target, "Invitation" + target, "Coaching", "Coaching", invitation.Id, "/app/invitations/" + invitation.Id), token);
            invitation.Status = target;
            invitation.RespondedAt = clock.GetUtcNow();
            invitation.Version++;
            await SaveAsync(token);
            return (await InvitationDtosAsync([invitation], coachSide, token))[0];
        }, ct);
    }

    public async Task<Paged<InvitationDto>> InvitationsAsync(bool coachSide, int page, int pageSize, string? search, string sort, InvitationStatus? status, CancellationToken ct)
    {
        ValidateList(page, pageSize, search, sort);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid invitation status.");
        var identity = coachSide ? await CoachAsync("coaching.invitations.send", ct) : await ClientAsync("coaching.invitations.respond-own", ct);
        var query = db.Invitations.AsNoTracking().Where(x => coachSide ? x.CoachId == identity.UserId && x.WorkspaceId == identity.WorkspaceId : x.TargetUserId == identity.UserId);
        if (coachSide)
        {
            var team = teams == null ? null : await teams.GetForUserAsync(identity.UserId, ct);
            var teamId = team?.TeamId ?? Guid.Empty;
            query = query.Where(x => x.TeamId == null || x.TeamId == teamId);
        }
        if (status.HasValue)
            query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.OfferName.ToLower().Contains(text));
        }
        var total = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "name" => query.OrderBy(x => x.OfferName).ThenBy(x => x.Id),
            "status" => query.OrderBy(x => x.Status).ThenBy(x => x.Id),
            _ => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
        };
        var rows = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(await InvitationDtosAsync(rows, coachSide, ct), page, pageSize, total);
    }
    public async Task<InvitationDto> InvitationAsync(Guid id, CancellationToken ct)
    {
        var invitation = await db.Invitations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (x.CoachId == accounts.UserId || x.TargetUserId == accounts.UserId), ct) ?? throw ApiException.NotFound();
        if (invitation.CoachId == accounts.UserId)
            await CheckTeam(invitation.TeamId, false, ct);
        var coachSide = invitation.CoachId == accounts.UserId;
        var identity = coachSide ? await CoachAsync("coaching.invitations.send", ct) : await ClientAsync("coaching.invitations.respond-own", ct);
        if (coachSide && identity.WorkspaceId != invitation.WorkspaceId)
            throw ApiException.NotFound();
        return (await InvitationDtosAsync([invitation], coachSide, ct))[0];
    }

    public async Task<Paged<RelationshipServiceDto>> ServicesAsync(Guid relationshipId, int page, int pageSize, string? search, string sort, ServiceStatus? status, CancellationToken ct)
    {
        ValidateList(page, pageSize, search, sort);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid service status.");
        var coachSide = await ServiceAccessAsync(relationshipId, false, ct);
        var teamScoped = await db.Relationships.AnyAsync(x => x.Id == relationshipId && x.TeamId != null, ct);
        var canComplete = coachSide && (teamScoped || (await policy.DecideAsync(relationshipId, RelationshipOperation.Manage, ct)).Allowed);
        var query = db.Services.AsNoTracking().Where(x => x.RelationshipId == relationshipId);
        if (status.HasValue)
            query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.OfferName.ToLower().Contains(text));
        }
        var total = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "name" => query.OrderBy(x => x.OfferName).ThenBy(x => x.Id),
            "status" => query.OrderBy(x => x.Status).ThenBy(x => x.Id),
            "created" => query.OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id),
            _ => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
        };
        return new((await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct)).Select(x => ServiceDto(x, canComplete)).ToArray(), page, pageSize, total);
    }
    public async Task<RelationshipServiceDto> ServiceAsync(Guid id, CancellationToken ct)
    {
        var service = await db.Services.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId || x.TeamId != null), ct) ?? throw ApiException.NotFound();
        var coachSide = await ServiceAccessAsync(service.RelationshipId, false, ct);
        var canComplete = coachSide && (service.TeamId != null || (await policy.DecideAsync(service.RelationshipId, RelationshipOperation.Manage, ct)).Allowed);
        return ServiceDto(service, canComplete);
    }
    public async Task<RelationshipServiceDto> CompleteServiceAsync(Guid id, long version, CancellationToken ct)
    {
        return await transactions.RunAsync(async token =>
        {
            await LockAsync("service:" + id, token);
            var service = await db.Services.SingleOrDefaultAsync(x => x.Id == id && (x.CoachId == accounts.UserId || x.TeamId != null), token) ?? throw ApiException.NotFound();
            if (service.TeamId != null)
                await LockAsync("team:" + service.TeamId, token);
            await ServiceAccessAsync(service.RelationshipId, true, token);
            CoachingService.CheckVersion(service.Version, version);
            if (service.Status == ServiceStatus.Completed)
                return ServiceDto(service, true);
            await billing.EndServiceAsync(service.Id, token);
            service.Status = ServiceStatus.Completed;
            service.CompletedAt = clock.GetUtcNow();
            service.UpdatedAt = service.CompletedAt.Value;
            service.Version++;
            await SaveAsync(token);
            return ServiceDto(service, true);
        }, ct);
    }

    private async Task<bool> ServiceAccessAsync(Guid relationshipId, bool write, CancellationToken ct)
    {
        var relationship = await db.Relationships.AsNoTracking().SingleOrDefaultAsync(x => x.Id == relationshipId && (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId || x.TeamId != null), ct) ?? throw ApiException.NotFound();
        if (relationship.TeamClientCaseId is { } caseId)
        {
            var teamAccess = teamClients == null ? null : await teamClients.DecideAsync(caseId, accounts.UserId, false, ct);
            if (teamAccess?.Allowed != true)
                throw ApiException.NotFound();
            var staff = teamAccess.Administrative || teamAccess.Assigned;
            if (write && !staff)
                throw ApiException.NotFound();
            if (staff)
                await CoachAsync("coaching.services.manage", ct);
            else
                await ClientAsync("coaching.services.read-own", ct);
            return staff;
        }
        var coachSide = relationship.CoachId == accounts.UserId;
        if (write && !coachSide)
            throw ApiException.NotFound();
        if (coachSide)
        {
            var coach = await CoachAsync("coaching.services.manage", ct);
            if (relationship.WorkspaceId != coach.WorkspaceId)
                throw ApiException.NotFound();
        }
        else
            await ClientAsync("coaching.services.read-own", ct);
        var decision = await policy.DecideAsync(relationshipId, write ? RelationshipOperation.Manage : RelationshipOperation.HistoricalSharedRead, ct);
        if (!decision.Allowed)
            throw new ApiException(403, decision.Reason, "This relationship does not allow access to its services.");
        return coachSide;
    }
    private async Task<ApplicationDetailDto> OwnDetailAsync(CoachingApplication app, CancellationToken ct) => await DetailAsync(app, false, ct);
    private async Task<ApplicationDetailDto> DetailAsync(CoachingApplication app, bool coachSide, CancellationToken ct)
    {
        var form = await forms.GetVersionAsync(app.FormVersionId, ct);
        var answers = app.FormSubmissionId.HasValue ? (await forms.GetSubmissionAsync(app.FormSubmissionId.Value, ct)).Answers : Read<Dictionary<string, JsonElement>>(app.Answers);
        AccountProfileFields? ownProfile = !coachSide && app.Status == ApplicationStatus.InProgress ? await profile.GetOwnAsync(ct) : null;
        var mapped = form.Definition.Sections.SelectMany(x => x.Questions).Where(x => x.SystemField.HasValue).Select(x => x.SystemField!.Value).ToHashSet();
        var prefill = ownProfile?.Values.Where(x => mapped.Contains(x.Key)).ToDictionary(x => x.Key, x => x.Value);
        return new((await ApplicationDtosAsync([app], coachSide, ct))[0], Read<OfferRevisionDto>(app.OfferSnapshot), form, answers, prefill, ownProfile?.Version);
    }
    private async Task<ApplicationDto[]> ApplicationDtosAsync(CoachingApplication[] rows, bool coachSide, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var services = await db.Services.AsNoTracking().Where(x => ids.Contains(x.ApplicationId)).ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(rows.Select(x => x.ApplicantUserId).Distinct().ToArray(), ct);
        var canAccept = coachSide && (await access.GetAsync(ct)).Features.Any(x => x.Key == "coaching.services.manage" && x.Available);
        return rows.Select(x => { var service = services.SingleOrDefault(s => s.ApplicationId == x.Id); return new ApplicationDto(x.Id, x.CoachId, x.ApplicantUserId, Person(x.ApplicantUserId, people), x.OfferName, x.OfferRevisionId, x.BillingOptionId, x.SelectedSessionCount, x.Amount, x.Currency, x.Source, x.InvitationId, x.Status, x.SubmittedAt, x.DecidedAt, x.CreatedAt, x.UpdatedAt, x.Version, service?.RelationshipId, service?.Id, coachSide ? x.Status == ApplicationStatus.Submitted ? canAccept ? ["accept", "reject"] : ["reject"] : [] : x.Status == ApplicationStatus.InProgress ? ["save", "submit", "withdraw"] : x.Status == ApplicationStatus.Submitted ? ["withdraw"] : []); }).ToArray();
    }
    private async Task<InvitationDto[]> InvitationDtosAsync(CoachingInvitation[] rows, bool coachSide, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var applications = await db.Applications.AsNoTracking().Where(x => x.InvitationId.HasValue && ids.Contains(x.InvitationId.Value) && (!coachSide || x.SubmittedAt != null)).Select(x => new { x.Id, x.InvitationId }).ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(rows.SelectMany(x => new[] { x.CoachId, x.TargetUserId }).Distinct().ToArray(), ct);
        var canApply = !coachSide && (await access.GetAsync(ct)).Features.Any(x => x.Key == "coaching.applications.submit-own" && x.Available);
        return rows.Select(x => new InvitationDto(x.Id, x.CoachId, Person(x.CoachId, people), x.TargetUserId, Person(x.TargetUserId, people), Read<OfferRevisionDto>(x.OfferSnapshot), x.BillingOptionId, x.Message, x.Status, x.CreatedAt, x.RespondedAt, x.Version, applications.SingleOrDefault(a => a.InvitationId == x.Id)?.Id, x.Status == InvitationStatus.Pending ? coachSide ? ["revoke"] : ["accept", "decline"] : canApply && x.Status == InvitationStatus.Accepted ? ["apply"] : [])).ToArray();
    }
    private static RelationshipServiceDto ServiceDto(RelationshipService x, bool coachSide) => new(x.Id, x.RelationshipId, x.ApplicationId, x.OfferName, Read<OfferRevisionDto>(x.OfferSnapshot), x.BillingOptionId, x.SelectedSessionCount, x.Amount, x.Currency, x.OrderId, x.Status, x.StartedAt, x.CompletedAt, x.UpdatedAt, x.Version, coachSide && x.Status == ServiceStatus.Active ? ["complete"] : []);
    private static PersonDto Person(Guid id, IReadOnlyDictionary<Guid, AccountDirectoryEntry> people) => people.TryGetValue(id, out var p) ? new(id, p.DisplayName, p.Username) : new(id, "Unavailable account", null);
    private async Task<AccountIdentity> ClientAsync(string feature, CancellationToken ct)
    {
        var client = await accounts.RequireClientAsync(ct);
        await access.RequireAsync(feature, ct);
        return client;
    }
    private async Task<AccountIdentity> CoachAsync(string feature, CancellationToken ct)
    {
        var coach = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync(feature, ct);
        return coach;
    }
    private async Task<CoachingApplication> OwnApplicationAsync(Guid id, Guid userId, CancellationToken ct) => await db.Applications.SingleOrDefaultAsync(x => x.Id == id && x.ApplicantUserId == userId, ct) ?? throw ApiException.NotFound();
    private async Task<CoachingApplication> CoachApplicationAsync(Guid id, AccountIdentity coach, CancellationToken ct)
    {
        var app = await db.Applications.SingleOrDefaultAsync(x => x.Id == id && x.CoachId == coach.UserId && x.WorkspaceId == coach.WorkspaceId && x.SubmittedAt != null, ct) ?? throw ApiException.NotFound();
        await CheckTeam(app.TeamId, true, ct);
        return app;
    }
    private async Task CheckTeam(Guid? teamId, bool write, CancellationToken ct)
    {
        if (teamId == null)
            return;
        var team = teams == null ? throw ApiException.NotFound() : await teams.RequireAsync(teamId.Value, accounts.UserId, false, ct);
        if (write && !team.IsActive)
            throw ApiException.Conflict("An active Team is required for organizational client intake.");
    }
    private Task<int> LockAsync(string key, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    private void Touch(CoachingApplication app)
    {
        app.Version++;
        app.UpdatedAt = clock.GetUtcNow();
    }
    private void Change(CoachingApplication app, ApplicationStatus status, Guid actor, string? reason)
    {
        var previous = app.Status;
        app.Status = status;
        Touch(app);
        db.ApplicationChanges.Add(new()
        {
            ApplicationId = app.Id,
            ActorId = actor,
            PreviousStatus = previous,
            NewStatus = status,
            InternalReason = reason,
            OccurredAt = app.UpdatedAt,
            Version = app.Version
        });
    }
    private static void RequireState(CoachingApplication app, ApplicationStatus status)
    {
        if (app.Status != status)
            throw ApiException.Conflict("This application is not in the required state.");
    }
    private static void ValidateDraftAnswers(IReadOnlyDictionary<string, JsonElement>? answers)
    {
        if (answers is null || answers.Count > 200 || JsonSerializer.SerializeToUtf8Bytes(answers, Json).Length > 262144)
            throw ApiException.Invalid("Supply at most 200 answers within 256 KiB.");
    }
    private static void Text(string? text, int max, bool required = false)
    {
        if (text?.Length > max || text?.Any(char.IsControl) == true || required && string.IsNullOrWhiteSpace(text))
            throw ApiException.Invalid($"Text must contain at most {max} characters without control characters.");
    }
    private static void ValidateList(int page, int pageSize, string? search, string sort)
    {
        if (page is < 1 or > 1000000 || pageSize is < 1 or > 100)
            throw ApiException.Invalid("Page must be 1–1000000 and pageSize 1–100.");
        Text(search, 200);
        if (sort is not ("updated" or "created" or "name" or "status"))
            throw ApiException.Invalid("Sort must be updated, created, name, or status.");
    }
    private static string Write<T>(T value) => JsonSerializer.Serialize(value, Json);
    private static T Read<T>(string value) => JsonSerializer.Deserialize<T>(value, Json) ?? throw ApiException.Conflict("The stored workflow snapshot is invalid.");
    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException) { throw new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload it before retrying."); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw ApiException.Conflict("A concurrent workflow already changed this resource."); }
    }
}
