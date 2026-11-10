using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Forms.Infrastructure;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed partial class CoachingIntakeTests
{
    [CatalogPostgresFact]
    public async Task Invitations_persist_offer_form_cards_in_direct_chat_without_activating_relationship()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var invitationKey = Guid.NewGuid().ToString();
        async Task<HttpResponseMessage> Invite()
        {
            using var input = new HttpRequestMessage(HttpMethod.Post, Root + "/invitations")
            {
                Content = JsonContent.Create(
                    new
                    {
                        username = client.Username,
                        offerId = offer.Id,
                        message = "Join me",
                    }
                ),
            };
            input.Headers.Add("Idempotency-Key", invitationKey);
            return await coach.Http.SendAsync(input);
        }
        var response = await Invite();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var invitationId = (await Body(response)).GetProperty("id").GetGuid();
        Assert.Equal(invitationId, (await Body(await Invite())).GetProperty("id").GetGuid());
        var chat = Assert.Single(
            (await Get(client.Http, "/api/v1/messaging/conversations")).EnumerateArray()
        );
        var card = chat.GetProperty("lastMessage").GetProperty("coachingEntry");
        Assert.Equal(invitationId, card.GetProperty("invitationId").GetGuid());
        Assert.Equal(offer.RevisionId, card.GetProperty("offerRevisionId").GetGuid());
        Assert.Equal(offer.FormVersionId, card.GetProperty("formVersionId").GetGuid());
        Assert.Single(
            (
                await Get(
                    client.Http,
                    "/api/v1/messaging/conversations/"
                        + chat.GetProperty("id").GetGuid()
                        + "/messages"
                )
            )
                .GetProperty("items")
                .EnumerateArray()
        );
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        Assert.False(
            await db.Relationships.AnyAsync(x => x.CoachId == coach.Id && x.ClientId == client.Id)
        );
        var messaging =
            scope.ServiceProvider.GetRequiredService<Metrivum.Messaging.Infrastructure.MessagingDbContext>();
        var chatId = chat.GetProperty("id").GetGuid();
        await messaging.Messages.Where(x => x.ConversationId == chatId).ExecuteDeleteAsync();
        var notifications =
            scope.ServiceProvider.GetRequiredService<Metrivum.Notifications.NotificationsDbContext>();
        var noticeCount = await notifications.Notifications.CountAsync(x =>
            x.RecipientUserId == client.Id
        );
        var invitationNotice = Assert.Single(
            await notifications
                .Notifications.Where(x => x.RecipientUserId == client.Id)
                .ToArrayAsync()
        );
        Assert.Equal("InvitationReceived", invitationNotice.Type);
        Assert.Equal("Coaching", invitationNotice.Category);
        Assert.Equal("/app/messages?conversation=" + chatId, invitationNotice.DeepLink);
        scope
            .ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>()
            .HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext
        {
            User = new System.Security.Claims.ClaimsPrincipal(
                new System.Security.Claims.ClaimsIdentity(
                    [new System.Security.Claims.Claim("sub", coach.Id.ToString())],
                    "ReplayTest"
                )
            ),
        };
        var replay = scope.ServiceProvider.GetRequiredService<CoachingIntakeService>();
        await replay.ReplayPendingInvitationChatsAsync(null, 100, false, default);
        Assert.Empty(
            await messaging.Messages.Where(x => x.ConversationId == chatId).ToArrayAsync()
        );
        await replay.ReplayPendingInvitationChatsAsync(null, 100, true, default);
        await replay.ReplayPendingInvitationChatsAsync(null, 100, true, default);
        Assert.Single(
            await messaging.Messages.Where(x => x.ConversationId == chatId).ToArrayAsync()
        );
        Assert.Equal(
            noticeCount,
            await notifications.Notifications.CountAsync(x => x.RecipientUserId == client.Id)
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.Http.PostAsync($"/api/v1/me/blocked-users/{coach.Id}", null)).StatusCode
        );
        var before = await db.Invitations.CountAsync(x =>
            x.CoachId == coach.Id && x.TargetUserId == client.Id
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await coach.Http.PostAsJsonAsync(
                    Root + "/invitations",
                    new { username = client.Username, offerId = offer.Id }
                )
            ).StatusCode
        );
        Assert.Equal(
            before,
            await db.Invitations.CountAsync(x =>
                x.CoachId == coach.Id && x.TargetUserId == client.Id
            )
        );
    }

    [CatalogPostgresFact]
    public async Task Form_shares_are_idempotent_and_never_create_invitations_or_relationships()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var key = Guid.NewGuid().ToString();
        async Task<JsonElement> Share()
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Root + "/form-shares")
            {
                Content = JsonContent.Create(new { userId = client.Id, offerId = offer.Id }),
            };
            request.Headers.Add("Idempotency-Key", key);
            var response = await coach.Http.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await Body(response);
        }
        var first = await Share();
        Assert.Equal(first.GetRawText(), (await Share()).GetRawText());
        var chatId = first.GetProperty("conversationId").GetGuid();
        var card = Assert.Single(
            (await Get(client.Http, $"/api/v1/messaging/conversations/{chatId}/messages"))
                .GetProperty("items")
                .EnumerateArray()
        );
        Assert.Equal(
            "OfferForm",
            card.GetProperty("coachingEntry").GetProperty("kind").GetString()
        );
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        Assert.False(
            await db.Invitations.AnyAsync(x => x.CoachId == coach.Id && x.TargetUserId == client.Id)
        );
        Assert.False(
            await db.Relationships.AnyAsync(x => x.CoachId == coach.Id && x.ClientId == client.Id)
        );
    }

    private const string Root = "/api/v1/coaching";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static Dictionary<string, JsonElement> Answers(decimal weight = 80) =>
        new()
        {
            ["weight"] = JsonSerializer.SerializeToElement(weight),
            ["notes"] = JsonSerializer.SerializeToElement("private custom response"),
            ["days"] = JsonSerializer.SerializeToElement(new[] { "1", "3" }),
        };

    private sealed record User(Guid Id, string Username, HttpClient Http);

    private sealed record Offer(
        Guid Id,
        Guid OptionId,
        Guid RevisionId,
        Guid FormVersionId,
        long Version
    );

    [CatalogPostgresFact]
    public async Task Drafts_stay_private_submission_saves_only_mapped_own_fields_and_rejection_keeps_history()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var other = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var draft = await Start(client.Http, offer);
        var id = draft.GetProperty("application").GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await coach.Http.GetAsync($"{Root}/applications/{id}")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await other.Http.GetAsync($"{Root}/applications/{id}")).StatusCode
        );
        Assert.DoesNotContain(
            (await Get(coach.Http, Root + "/leads?status=InProgress"))
                .GetProperty("items")
                .EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == id
        );
        var bad = await Mutate(
            client.Http,
            $"{Root}/applications/{id}/submit",
            1,
            new SubmitApplicationRequest(Answers(), [SystemFieldKey.Height], 1)
        );
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var submittedResponse = await Mutate(
            client.Http,
            $"{Root}/applications/{id}/submit",
            1,
            new SubmitApplicationRequest(
                Answers(),
                [SystemFieldKey.Weight, SystemFieldKey.PreferredTrainingDays],
                draft.GetProperty("profileVersion").GetInt64()
            )
        );
        Assert.Equal(HttpStatusCode.OK, submittedResponse.StatusCode);
        var submitted = await Body(submittedResponse);
        var version = submitted.GetProperty("application").GetProperty("version").GetInt64();
        Assert.Equal(
            80,
            (await Get(client.Http, "/api/v1/me/profile-fields"))
                .GetProperty("values")
                .GetProperty("Weight")
                .GetDecimal()
        );
        Assert.Equal(
            new[] { 1, 3 },
            (await Get(client.Http, "/api/v1/me/profile-fields"))
                .GetProperty("values")
                .GetProperty("PreferredTrainingDays")
                .EnumerateArray()
                .Select(x => x.GetInt32())
                .ToArray()
        );
        var lead = await Get(coach.Http, $"{Root}/applications/{id}");
        Assert.Equal(
            "private custom response",
            lead.GetProperty("detail").GetProperty("answers").GetProperty("notes").GetString()
        );
        Assert.Equal(
            80,
            lead.GetProperty("currentAllowedProfile").GetProperty("Weight").GetDecimal()
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await other.Http.GetAsync($"{Root}/applications/{id}")).StatusCode
        );
        var rejected = await Mutate(
            coach.Http,
            $"{Root}/applications/{id}/reject",
            version,
            new RejectApplicationRequest("private rejection note")
        );
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        var clientHistory = await Get(client.Http, $"{Root}/applications/{id}");
        Assert.DoesNotContain("private rejection note", clientHistory.GetRawText());
        Assert.Equal(
            "Rejected",
            clientHistory.GetProperty("application").GetProperty("status").GetString()
        );
        Assert.Contains(
            "private rejection note",
            (await Get(coach.Http, $"{Root}/applications/{id}")).GetRawText()
        );
        var second = await Start(client.Http, offer);
        Assert.NotEqual(id, second.GetProperty("application").GetProperty("id").GetGuid());
        var secondId = second.GetProperty("application").GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.OK,
            (await Mutate(client.Http, $"{Root}/applications/{secondId}/withdraw", 1)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await coach.Http.GetAsync($"{Root}/applications/{secondId}")).StatusCode
        );
    }

    [CatalogPostgresFact]
    public async Task Concurrent_acceptance_creates_one_relationship_service_order_and_unchanged_retry_is_safe()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var app = await Submitted(client.Http, offer);
        var id = app.GetProperty("id").GetGuid();
        var version = app.GetProperty("version").GetInt64();
        var requests = await Task.WhenAll(
            Mutate(
                coach.Http,
                $"{Root}/applications/{id}/accept",
                version,
                new AcceptApplicationRequest()
            ),
            Mutate(
                coach.Http,
                $"{Root}/applications/{id}/accept",
                version,
                new AcceptApplicationRequest()
            )
        );
        Assert.Single(requests, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(requests, x => x.StatusCode == HttpStatusCode.PreconditionFailed);
        var accepted = await Body(requests.Single(x => x.StatusCode == HttpStatusCode.OK));
        var relationship = accepted.GetProperty("relationshipId").GetGuid();
        var service = accepted.GetProperty("serviceId").GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await coach.Http.GetAsync(
                    $"{Root}/relationships/{relationship}/applications/{Guid.NewGuid()}"
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await coach.Http.GetAsync($"{Root}/relationships/{relationship}/applications/{id}")
            ).StatusCode
        );
        var profile = await Get(coach.Http, $"{Root}/relationships/{relationship}/profile");
        Assert.Equal(JsonValueKind.Object, profile.GetProperty("currentAllowedProfile").ValueKind);
        var applications = await Get(
            coach.Http,
            $"{Root}/relationships/{relationship}/applications?pageSize=1"
        );
        Assert.Equal(
            id,
            Assert
                .Single(applications.GetProperty("items").EnumerateArray())
                .GetProperty("id")
                .GetGuid()
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await coach.Http.GetAsync($"{Root}/relationships/{Guid.NewGuid()}/profile")).StatusCode
        );
        var stranger = await Onboard(factory, original, "Coach");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await stranger.Http.GetAsync($"{Root}/relationships/{relationship}/profile")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await stranger.Http.GetAsync($"{Root}/relationships/{relationship}/applications")
            ).StatusCode
        );
        var retry = await Mutate(
            coach.Http,
            $"{Root}/applications/{id}/accept",
            accepted.GetProperty("version").GetInt64(),
            new AcceptApplicationRequest()
        );
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(service, (await Body(retry)).GetProperty("serviceId").GetGuid());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        Assert.Equal(
            1,
            await db.Relationships.CountAsync(x => x.CoachId == coach.Id && x.ClientId == client.Id)
        );
        Assert.Equal(1, await db.Services.CountAsync(x => x.ApplicationId == id));
        Assert.Equal(2, await db.ApplicationChanges.CountAsync(x => x.ApplicationId == id));
        var services = await Get(client.Http, $"{Root}/relationships/{relationship}/services");
        Assert.Single(services.GetProperty("items").EnumerateArray());
        var order = (await Get(client.Http, "/api/v1/me/orders"))
            .GetProperty("items")
            .EnumerateArray();
        Assert.Single(order, x => x.GetProperty("serviceId").GetGuid() == service);
    }

    [CatalogPostgresFact]
    public async Task Multiple_offers_reuse_active_pair_completed_returns_with_audit_and_suspended_acceptance_conflicts()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var secondOffer = await PublishOffer(coach.Http, "Second offer", 123.45m);
        var first = await Accept(coach.Http, await Submitted(client.Http, offer));
        var relationship = first.GetProperty("relationshipId").GetGuid();
        var second = await Accept(coach.Http, await Submitted(client.Http, secondOffer));
        Assert.Equal(relationship, second.GetProperty("relationshipId").GetGuid());
        Assert.NotEqual(
            first.GetProperty("serviceId").GetGuid(),
            second.GetProperty("serviceId").GetGuid()
        );
        Assert.Equal(
            2,
            (await Get(client.Http, $"{Root}/relationships/{relationship}/services"))
                .GetProperty("total")
                .GetInt64()
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    $"{Root}/relationships/{relationship}/suspend",
                    1,
                    new StatusRequest("manual suspension")
                )
            ).StatusCode
        );
        var third = await Submitted(client.Http, offer);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await Mutate(
                    coach.Http,
                    $"{Root}/applications/{third.GetProperty("id").GetGuid()}/accept",
                    third.GetProperty("version").GetInt64(),
                    new AcceptApplicationRequest()
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.Http.GetAsync($"{Root}/relationships/{relationship}/services")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    $"{Root}/relationships/{relationship}/resume",
                    2,
                    new StatusRequest(null)
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    $"{Root}/relationships/{relationship}/complete",
                    3,
                    new StatusRequest(null)
                )
            ).StatusCode
        );
        var returning = await Accept(coach.Http, third);
        Assert.Equal(relationship, returning.GetProperty("relationshipId").GetGuid());
        var relation = await Get(coach.Http, $"{Root}/clients/{relationship}");
        Assert.Equal("Active", relation.GetProperty("status").GetString());
        Assert.Contains(
            relation.GetProperty("statusHistory").EnumerateArray(),
            x =>
                x.GetProperty("previousStatus").GetString() == "Completed"
                && x.GetProperty("newStatus").GetString() == "Active"
        );
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        Assert.Equal(
            1,
            await db.Relationships.CountAsync(x => x.CoachId == coach.Id && x.ClientId == client.Id)
        );
        Assert.Equal(3, await db.Services.CountAsync(x => x.RelationshipId == relationship));
    }

    [CatalogPostgresFact]
    public async Task Invitation_requires_explicit_recipient_response_keeps_frozen_terms_and_never_activates_by_accepting()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var other = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (
                await coach.Http.PostAsJsonAsync(
                    Root + "/invitations",
                    new CreateInvitationRequest(coach.Username, offer.Id)
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await other.Http.PostAsJsonAsync(
                    Root + "/invitations",
                    new CreateInvitationRequest(client.Username, offer.Id)
                )
            ).StatusCode
        );
        var created = await coach.Http.PostAsJsonAsync(
            Root + "/invitations",
            new CreateInvitationRequest(
                client.Username.ToUpperInvariant(),
                offer.Id,
                offer.OptionId,
                "Apply if interested"
            )
        );
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var invite = await Body(created);
        var id = invite.GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Mutate(other.Http, $"{Root}/invitations/{id}/revoke", 1)).StatusCode
        );
        var accepted = await Mutate(client.Http, $"{Root}/invitations/{id}/accept", 1);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        using (var scope = factory.Services.CreateScope())
            Assert.False(
                await scope
                    .ServiceProvider.GetRequiredService<CoachingDbContext>()
                    .Relationships.AnyAsync(x => x.CoachId == coach.Id && x.ClientId == client.Id)
            );
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await Mutate(coach.Http, $"{Root}/invitations/{id}/revoke", 2)).StatusCode
        );
        var issuedForm = await Get(coach.Http, $"/api/v1/forms/versions/{offer.FormVersionId}");
        var templateId = issuedForm.GetProperty("templateId").GetGuid();
        var editedForm = await Patch(
            coach.Http,
            $"/api/v1/forms/{templateId}",
            2,
            new FormTemplateRequest(
                FormPurpose.Application,
                "New definition",
                "",
                new([
                    new(
                        "main",
                        "Main",
                        0,
                        [
                            new(
                                "different",
                                "Different required question",
                                QuestionType.ShortText,
                                true
                            ),
                        ]
                    ),
                ])
            )
        );
        Assert.Equal(HttpStatusCode.OK, editedForm.StatusCode);
        var newForm = await Mutate(
            coach.Http,
            $"/api/v1/forms/{templateId}/publish",
            (await Body(editedForm)).GetProperty("version").GetInt64()
        );
        Assert.Equal(HttpStatusCode.OK, newForm.StatusCode);
        var nextFormVersion = (await Body(newForm))
            .GetProperty("currentPublishedVersionId")
            .GetGuid();
        var editedOffer = await Patch(
            coach.Http,
            $"/api/v1/offers/{offer.Id}",
            offer.Version,
            new OfferRequest(
                "New terms",
                "",
                "strength",
                CoachingMode.Online,
                nextFormVersion,
                [],
                [
                    new(
                        offer.OptionId,
                        "Updated price",
                        BillingModel.PerSession,
                        999,
                        PaymentTerms: new(DueRule.OnStart)
                    ),
                ]
            )
        );
        Assert.Equal(HttpStatusCode.OK, editedOffer.StatusCode);
        var publishedOffer = await Mutate(
            coach.Http,
            $"/api/v1/offers/{offer.Id}/publish",
            (await Body(editedOffer)).GetProperty("version").GetInt64()
        );
        Assert.Equal(HttpStatusCode.OK, publishedOffer.StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    $"/api/v1/offers/{offer.Id}/deactivate",
                    (await Body(publishedOffer)).GetProperty("version").GetInt64()
                )
            ).StatusCode
        );
        var application = await Start(client.Http, offer, id);
        Assert.Equal(
            offer.RevisionId,
            application.GetProperty("offerRevision").GetProperty("id").GetGuid()
        );
        Assert.Equal(
            offer.FormVersionId,
            application.GetProperty("formVersion").GetProperty("id").GetGuid()
        );
        Assert.Equal(
            80m,
            application.GetProperty("application").GetProperty("amount").GetDecimal()
        );
        var appId = application.GetProperty("application").GetProperty("id").GetGuid();
        Assert.Equal(
            appId,
            (await Start(client.Http, offer, id))
                .GetProperty("application")
                .GetProperty("id")
                .GetGuid()
        );
        Assert.Equal(
            JsonValueKind.Null,
            (await Get(coach.Http, $"{Root}/invitations/{id}"))
                .GetProperty("applicationId")
                .ValueKind
        );
        var submitted = await Mutate(
            client.Http,
            $"{Root}/applications/{appId}/submit",
            1,
            new SubmitApplicationRequest(Answers())
        );
        Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
        Assert.Equal(
            appId,
            (await Get(coach.Http, $"{Root}/invitations/{id}"))
                .GetProperty("applicationId")
                .GetGuid()
        );
        var metadata = (await Body(submitted)).GetProperty("application");
        var lead = await Accept(coach.Http, metadata);
        Assert.NotEqual(Guid.Empty, lead.GetProperty("relationshipId").GetGuid());
        var pendingOffer = await PublishOffer(coach.Http, "Pending");
        var pending = await Body(
            await coach.Http.PostAsJsonAsync(
                Root + "/invitations",
                new CreateInvitationRequest(client.Username, pendingOffer.Id)
            )
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    client.Http,
                    $"{Root}/invitations/{pending.GetProperty("id").GetGuid()}/decline",
                    1
                )
            ).StatusCode
        );
    }

    [CatalogPostgresFact]
    public async Task Inactive_offer_blocks_draft_submission_but_existing_submitted_terms_stay_acceptible()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var submitted = await Submitted(client.Http, offer);
        var draft = await Start(client.Http, offer);
        var draftId = draft.GetProperty("application").GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(coach.Http, $"/api/v1/offers/{offer.Id}/deactivate", offer.Version)
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await Mutate(
                    client.Http,
                    $"{Root}/applications/{draftId}/submit",
                    1,
                    new SubmitApplicationRequest(Answers())
                )
            ).StatusCode
        );
        var accepted = await Accept(coach.Http, submitted);
        var service = await Get(
            client.Http,
            $"{Root}/services/{accepted.GetProperty("serviceId").GetGuid()}"
        );
        Assert.Equal(80m, service.GetProperty("amount").GetDecimal());
        Assert.Equal(
            offer.RevisionId,
            service.GetProperty("offerRevision").GetProperty("id").GetGuid()
        );
        var outsider = await Onboard(factory, original, "Coach");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await outsider.Http.GetAsync(
                    $"{Root}/services/{accepted.GetProperty("serviceId").GetGuid()}"
                )
            ).StatusCode
        );
        var completed = await Mutate(
            coach.Http,
            $"{Root}/services/{accepted.GetProperty("serviceId").GetGuid()}/complete",
            1
        );
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        Assert.Equal(
            "Active",
            (
                await Get(
                    coach.Http,
                    $"{Root}/clients/{accepted.GetProperty("relationshipId").GetGuid()}"
                )
            )
                .GetProperty("status")
                .GetString()
        );
    }

    [CatalogPostgresFact]
    public async Task Failure_after_billing_write_rolls_back_acceptance_relationship_service_order_and_returning_status()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var app = await Submitted(client.Http, offer);
        var id = app.GetProperty("id").GetGuid();
        using var failing = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.AddScoped<IFeatureAccessService>(_ => new Features());
                services.AddScoped<IBillingOrders>(p => new FailingBilling(
                    p.GetRequiredService<BillingService>()
                ));
            })
        );
        using var coachFailed = failing.CreateClient();
        coachFailed.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(coach.Id));
        Assert.Equal(
            HttpStatusCode.InternalServerError,
            (
                await Mutate(
                    coachFailed,
                    $"{Root}/applications/{id}/accept",
                    app.GetProperty("version").GetInt64(),
                    new AcceptApplicationRequest()
                )
            ).StatusCode
        );
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            Assert.False(
                await db.Relationships.AnyAsync(x =>
                    x.CoachId == coach.Id && x.ClientId == client.Id
                )
            );
            Assert.False(await db.Services.AnyAsync(x => x.ApplicationId == id));
            Assert.Equal(
                ApplicationStatus.Submitted,
                (await db.Applications.AsNoTracking().SingleAsync(x => x.Id == id)).Status
            );
        }
        Assert.Empty(
            (await Get(client.Http, "/api/v1/me/orders")).GetProperty("items").EnumerateArray()
        );
        var accepted = await Accept(coach.Http, app);
        var relationship = accepted.GetProperty("relationshipId").GetGuid();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    coach.Http,
                    $"{Root}/relationships/{relationship}/complete",
                    1,
                    new StatusRequest(null)
                )
            ).StatusCode
        );
        var returning = await Submitted(client.Http, offer);
        Assert.Equal(
            HttpStatusCode.InternalServerError,
            (
                await Mutate(
                    coachFailed,
                    $"{Root}/applications/{returning.GetProperty("id").GetGuid()}/accept",
                    returning.GetProperty("version").GetInt64(),
                    new AcceptApplicationRequest()
                )
            ).StatusCode
        );
        Assert.Equal(
            "Completed",
            (await Get(coach.Http, $"{Root}/clients/{relationship}"))
                .GetProperty("status")
                .GetString()
        );
        using var verify = factory.Services.CreateScope();
        Assert.Equal(
            1,
            await verify
                .ServiceProvider.GetRequiredService<CoachingDbContext>()
                .StatusChanges.CountAsync(x => x.RelationshipId == relationship)
        );
    }

    [CatalogPostgresFact]
    public async Task Failure_after_profile_and_form_writes_rolls_back_submit_and_profile_changes()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var draft = await Start(client.Http, offer);
        var id = draft.GetProperty("application").GetProperty("id").GetGuid();
        using var failing = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.AddScoped<IFeatureAccessService>(_ => new Features());
                services.AddScoped<IFormLibrary>(p => new FailingForms(
                    p.GetRequiredService<FormsService>()
                ));
            })
        );
        using var clientFailed = failing.CreateClient();
        clientFailed.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(client.Id));
        Assert.Equal(
            HttpStatusCode.InternalServerError,
            (
                await Mutate(
                    clientFailed,
                    $"{Root}/applications/{id}/submit",
                    1,
                    new SubmitApplicationRequest(
                        Answers(),
                        [SystemFieldKey.Weight],
                        draft.GetProperty("profileVersion").GetInt64()
                    )
                )
            ).StatusCode
        );
        Assert.Empty(
            (await Get(client.Http, "/api/v1/me/profile-fields"))
                .GetProperty("values")
                .EnumerateObject()
        );
        Assert.Equal(
            "InProgress",
            (await Get(client.Http, $"{Root}/applications/{id}"))
                .GetProperty("application")
                .GetProperty("status")
                .GetString()
        );
        using var verify = factory.Services.CreateScope();
        Assert.False(
            await verify
                .ServiceProvider.GetRequiredService<FormsDbContext>()
                .Submissions.AnyAsync(x => x.SourceKey == "application:" + id)
        );
    }

    [CatalogPostgresFact]
    public async Task Lists_versions_roles_and_revoked_features_are_checked_on_service_calls()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var draft = await Start(client.Http, offer);
        var id = draft.GetProperty("application").GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.Http.GetAsync(Root + "/leads")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.Http.GetAsync(Root + "/applications?pageSize=101")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.Http.GetAsync(Root + "/applications?sort=arbitrary")).StatusCode
        );
        Assert.Equal(
            (HttpStatusCode)428,
            (
                await client.Http.PostAsJsonAsync(
                    $"{Root}/applications/{id}/submit",
                    new SubmitApplicationRequest(Answers())
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await Mutate(
                    client.Http,
                    $"{Root}/applications/{id}/submit",
                    1,
                    new SubmitApplicationRequest(Answers())
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.PreconditionFailed,
            (await Mutate(client.Http, $"{Root}/applications/{id}/withdraw", 1)).StatusCode
        );
        using var denied = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddScoped<IFeatureAccessService>(_ => new Features(false))
            )
        );
        using var deniedClient = denied.CreateClient();
        deniedClient.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(client.Id));
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await deniedClient.GetAsync($"{Root}/applications/{id}")).StatusCode
        );
        using var noService = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddScoped<IFeatureAccessService>(_ => new FeaturesWithoutServices())
            )
        );
        using var coachNoService = noService.CreateClient();
        coachNoService.DefaultRequestHeaders.Authorization = new(
            "Bearer",
            original.Token(coach.Id)
        );
        var actions = (await Get(coachNoService, $"{Root}/applications/{id}"))
            .GetProperty("detail")
            .GetProperty("application")
            .GetProperty("allowedActions")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ToArray();
        Assert.DoesNotContain("accept", actions);
        Assert.Contains("reject", actions);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await Mutate(
                    coachNoService,
                    $"{Root}/applications/{id}/accept",
                    2,
                    new AcceptApplicationRequest()
                )
            ).StatusCode
        );
    }

    [CatalogPostgresFact]
    public async Task Composite_service_constraint_rejects_substituting_another_client_relationship_below_handler()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var firstClient = await Onboard(factory, original, "Client");
        var secondClient = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http);
        var first = await Accept(coach.Http, await Submitted(firstClient.Http, offer));
        var second = await Accept(coach.Http, await Submitted(secondClient.Http, offer));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        var firstRelationship = first.GetProperty("relationshipId").GetGuid();
        var secondService = second.GetProperty("serviceId").GetGuid();
        var error = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE coaching.\"Services\" SET \"RelationshipId\"={firstRelationship} WHERE \"Id\"={secondService}"
            )
        );
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, error.SqlState);
        Assert.Equal(
            second.GetProperty("relationshipId").GetGuid(),
            (
                await db.Services.AsNoTracking().SingleAsync(x => x.Id == secondService)
            ).RelationshipId
        );
    }

    [CatalogPostgresFact]
    public async Task Batch_policy_matches_single_decisions_and_reads_roles_features_once_for_owned_rows()
    {
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var another = await Onboard(factory, original, "Client");
        var otherCoach = await Onboard(factory, original, "Coach");
        var offer = await PublishOffer(coach.Http);
        var first = await Accept(coach.Http, await Submitted(client.Http, offer));
        var second = await Accept(coach.Http, await Submitted(another.Http, offer));
        var foreign = await Accept(
            otherCoach.Http,
            await Submitted(client.Http, await PublishOffer(otherCoach.Http))
        );
        var firstId = first.GetProperty("relationshipId").GetGuid();
        var secondId = second.GetProperty("relationshipId").GetGuid();
        var foreignId = foreign.GetProperty("relationshipId").GetGuid();
        var missing = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
        var relationship = await db.Relationships.AsNoTracking().SingleAsync(x => x.Id == firstId);
        var account = new BatchAccount(coach.Id, relationship.WorkspaceId);
        var features = new CountingFeatures();
        var policy = new CoachingService(
            db,
            account,
            scope.ServiceProvider.GetRequiredService<IAccountDirectory>(),
            features,
            TimeProvider.System,
            scope.ServiceProvider.GetRequiredService<IHostEnvironment>()
        );
        Assert.Empty(await policy.DecideManyAsync([], RelationshipOperation.Manage, default));
        Assert.Equal(0, features.Reads);
        var decisions = await policy.DecideManyAsync(
            [firstId, secondId, foreignId, missing, firstId],
            RelationshipOperation.Manage,
            default
        );
        Assert.Equal(4, decisions.Count);
        Assert.True(decisions[firstId].Allowed);
        Assert.True(decisions[secondId].Allowed);
        Assert.Equal("RESOURCE_NOT_FOUND", decisions[foreignId].Reason);
        Assert.Equal("RESOURCE_NOT_FOUND", decisions[missing].Reason);
        Assert.Equal(1, features.Reads);
        Assert.Equal(1, account.RoleReads);
        foreach (var (id, decision) in decisions)
            Assert.Equal(
                decision,
                await policy.DecideAsync(id, RelationshipOperation.Manage, default)
            );
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    policy.DecideManyAsync(
                        Enumerable.Repeat(firstId, 1001).ToArray(),
                        RelationshipOperation.Manage,
                        default
                    )
                )
            ).Status
        );
    }

    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Allow(
        ApiFactory original
    ) =>
        original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddScoped<IFeatureAccessService>(_ => new Features())
            )
        );

    private static async Task<User> Onboard(
        Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> factory,
        ApiFactory original,
        string role
    )
    {
        var id = Guid.NewGuid();
        var username = "i" + id.ToString("N")[..20];
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await http.PutAsJsonAsync(
                    "/api/v1/me/onboarding",
                    new
                    {
                        username,
                        displayName = "Intake test",
                        birthDate = "1990-01-01",
                        acceptedTerms = true,
                        locale = "en",
                        timeZone = "UTC",
                        role,
                    }
                )
            ).StatusCode
        );
        return new(id, username, http);
    }

    private static async Task<Offer> PublishOffer(
        HttpClient coach,
        string name = "Intake offer",
        decimal amount = 80,
        OfferPurpose purpose = OfferPurpose.CoachingService
    )
    {
        var request = new FormTemplateRequest(
            FormPurpose.Application,
            "Intake",
            "",
            new([
                new(
                    "main",
                    "Main",
                    0,
                    [
                        new(
                            "weight",
                            "Weight",
                            QuestionType.Number,
                            true,
                            Min: 1,
                            Max: 600,
                            SystemField: SystemFieldKey.Weight
                        ),
                        new("notes", "Notes", QuestionType.LongText),
                        new(
                            "days",
                            "Days",
                            QuestionType.MultiChoice,
                            Choices: [new("1", "Monday"), new("3", "Wednesday")],
                            SystemField: SystemFieldKey.PreferredTrainingDays
                        ),
                    ]
                ),
            ])
        );
        var created = await coach.PostAsJsonAsync("/api/v1/forms", request);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var form = await Body(created);
        var published = await Mutate(
            coach,
            $"/api/v1/forms/{form.GetProperty("id").GetGuid()}/publish",
            1
        );
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        var formVersion = (await Body(published))
            .GetProperty("currentPublishedVersionId")
            .GetGuid();
        var optionId = Guid.NewGuid();
        var offer = await coach.PostAsJsonAsync(
            "/api/v1/offers",
            new OfferRequest(
                name,
                "",
                "strength",
                CoachingMode.Online,
                formVersion,
                [],
                [
                    new(
                        optionId,
                        "Session",
                        purpose == OfferPurpose.TrainingPlan
                            ? BillingModel.OneTime
                            : BillingModel.PerSession,
                        amount,
                        PaymentTerms: new(DueRule.Upfront)
                    ),
                ],
                Purpose: purpose
            )
        );
        Assert.Equal(HttpStatusCode.OK, offer.StatusCode);
        var offerBody = await Body(offer);
        var id = offerBody.GetProperty("id").GetGuid();
        var active = await Mutate(
            coach,
            $"/api/v1/offers/{id}/publish",
            offerBody.GetProperty("version").GetInt64()
        );
        Assert.Equal(HttpStatusCode.OK, active.StatusCode);
        var body = await Body(active);
        return new(
            id,
            optionId,
            body.GetProperty("currentPublishedRevisionId").GetGuid(),
            formVersion,
            body.GetProperty("version").GetInt64()
        );
    }

    private static async Task<JsonElement> Start(
        HttpClient client,
        Offer offer,
        Guid? invitationId = null
    )
    {
        var response = await client.PostAsJsonAsync(
            Root + "/applications",
            new StartApplicationRequest(offer.Id, offer.OptionId, InvitationId: invitationId)
        );
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await Body(response);
    }

    private static async Task<JsonElement> Submitted(HttpClient client, Offer offer)
    {
        var draft = await Start(client, offer);
        var app = draft.GetProperty("application");
        var response = await Mutate(
            client,
            $"{Root}/applications/{app.GetProperty("id").GetGuid()}/submit",
            app.GetProperty("version").GetInt64(),
            new SubmitApplicationRequest(Answers())
        );
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Body(response)).GetProperty("application");
    }

    private static async Task<JsonElement> Accept(HttpClient coach, JsonElement app)
    {
        var response = await Mutate(
            coach,
            $"{Root}/applications/{app.GetProperty("id").GetGuid()}/accept",
            app.GetProperty("version").GetInt64(),
            new AcceptApplicationRequest()
        );
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await Body(response);
    }

    private static async Task<HttpResponseMessage> Mutate(
        HttpClient http,
        string path,
        long version,
        object? body = null
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        if (body != null)
            request.Content = JsonContent.Create(body);
        return await http.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> Patch(
        HttpClient http,
        string path,
        long version,
        object body
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, path)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        return await http.SendAsync(request);
    }

    private static async Task<JsonElement> Get(HttpClient http, string path)
    {
        var response = await http.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await Body(response);
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Json);

    private sealed class Features(bool allowed = true) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) =>
            allowed
                ? Task.CompletedTask
                : Task.FromException(
                    new ApiException(403, "FEATURE_UNAVAILABLE", "Feature revoked.")
                );

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            Task.FromResult(
                new AccessSnapshot(
                    "test",
                    new[]
                    {
                        "messaging.direct",
                        "messaging.groups",
                        "coaching.clients.view",
                        "coaching.clients.manage",
                        "coaching.relationships.read-own",
                        "coaching.services.manage",
                        "coaching.services.read-own",
                        "coaching.applications.submit-own",
                        "coaching.applications.manage",
                        "coaching.invitations.send",
                        "coaching.invitations.respond-own",
                    }
                        .Select(x => new FeatureDecision(
                            x,
                            allowed,
                            allowed ? "AVAILABLE" : "REVOKED"
                        ))
                        .ToArray(),
                    []
                )
            );
    }

    private sealed class BatchAccount(Guid userId, Guid workspaceId) : IAccountContext
    {
        public int RoleReads { get; private set; }
        public Guid UserId => userId;

        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) =>
            Task.FromResult(new AccountIdentity(userId, workspaceId));

        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) =>
            Task.FromResult(new AccountIdentity(userId, workspaceId));

        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct)
        {
            RoleReads++;
            return Task.FromResult<IReadOnlyList<AccountRole>>([
                AccountRole.Coach,
                AccountRole.Client,
            ]);
        }

        public Task RequireAdminAsync(string permission, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class CountingFeatures : IFeatureAccessService
    {
        public int Reads { get; private set; }

        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct)
        {
            Reads++;
            return new Features().GetAsync(ct);
        }
    }

    private sealed class FeaturesWithoutServices : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) =>
            key == "coaching.services.manage"
                ? Task.FromException(
                    new ApiException(403, "FEATURE_UNAVAILABLE", "Feature revoked.")
                )
                : Task.CompletedTask;

        public async Task<AccessSnapshot> GetAsync(CancellationToken ct)
        {
            var value = await new Features().GetAsync(ct);
            return value with
            {
                Features = value
                    .Features.Select(x =>
                        x.Key == "coaching.services.manage"
                            ? x with
                            {
                                Available = false,
                                Reason = "REVOKED",
                            }
                            : x
                    )
                    .ToArray(),
            };
        }
    }

    private sealed class FailingBilling(BillingService inner) : IBillingOrders
    {
        public async Task<ServiceOrderSnapshot> CreateForServiceAsync(
            CreateServiceOrderCommand command,
            CancellationToken ct
        )
        {
            await inner.CreateForServiceAsync(command, ct);
            throw new InvalidOperationException("Injected failure after real order persistence.");
        }

        public Task EndServiceAsync(Guid serviceId, CancellationToken ct) =>
            inner.EndServiceAsync(serviceId, ct);
    }

    private sealed class FailingForms(FormsService inner) : IFormLibrary
    {
        public Task<FormVersionDto> GetVersionAsync(Guid id, CancellationToken ct) =>
            inner.GetVersionAsync(id, ct);

        public Task<FormVersionDto> RequireUsableVersionAsync(
            Guid id,
            Guid coachId,
            FormPurpose purpose,
            CancellationToken ct
        ) => inner.RequireUsableVersionAsync(id, coachId, purpose, ct);

        public Task<IReadOnlyDictionary<Guid, FormVersionDto>> GetVersionsAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct
        ) => inner.GetVersionsAsync(ids, ct);

        public Task<FormVersionDto> GetCurrentVersionAsync(Guid templateId, CancellationToken ct) =>
            inner.GetCurrentVersionAsync(templateId, ct);

        public Task ValidateAsync(
            Guid versionId,
            IReadOnlyDictionary<string, JsonElement> answers,
            CancellationToken ct
        ) => inner.ValidateAsync(versionId, answers, ct);

        public async Task<FormSubmissionDto> SubmitAsync(
            FormSubmissionCommand command,
            CancellationToken ct
        )
        {
            await inner.SubmitAsync(command, ct);
            throw new InvalidOperationException("Injected failure after form persistence.");
        }

        public Task<FormSubmissionDto> GetSubmissionAsync(Guid id, CancellationToken ct) =>
            inner.GetSubmissionAsync(id, ct);
    }
}
