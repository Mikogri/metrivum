using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Accounts.Contracts;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;

namespace Metrivum.IntegrationTests;

public sealed partial class CoachingIntakeTests
{
    [CatalogPostgresFact]
    public async Task Optional_form_supports_direct_and_invited_intake_without_answers_or_profile_updates()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var other = await Onboard(factory, original, "Coach");
        var optionId = Guid.NewGuid();
        var created = await coach.Http.PostAsJsonAsync("/api/v1/offers", new OfferRequest("No form", "", "strength", CoachingMode.Online, null, [], [new(optionId, "Free session", BillingModel.PerSession, 0)]));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var offerId = (await Body(created)).GetProperty("id").GetGuid();
        var published = await Mutate(coach.Http, $"/api/v1/offers/{offerId}/publish", 1);
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        var publishedBody = await Body(published);
        Assert.Equal(JsonValueKind.Null, publishedBody.GetProperty("applicationFormVersionId").ValueKind);
        var offer = new Offer(offerId, optionId, publishedBody.GetProperty("currentPublishedRevisionId").GetGuid(), Guid.Empty, publishedBody.GetProperty("version").GetInt64());
        foreach (var invited in new[] { false, true })
        {
            var client = await Onboard(factory, original, "Client");
            Guid? invitationId = null;
            if (invited)
            {
                var invitation = await coach.Http.PostAsJsonAsync(Root + "/invitations", new { username = client.Username, offerId });
                Assert.Equal(HttpStatusCode.OK, invitation.StatusCode);
                var body = await Body(invitation);
                invitationId = body.GetProperty("id").GetGuid();
                Assert.Equal(HttpStatusCode.OK, (await Mutate(client.Http, $"{Root}/invitations/{invitationId}/accept", body.GetProperty("version").GetInt64())).StatusCode);
            }
            else
            {
                using var shareRequest = new HttpRequestMessage(HttpMethod.Post, Root + "/form-shares")
                { Content = JsonContent.Create(new { userId = client.Id, offerId }) };
                shareRequest.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
                var share = await coach.Http.SendAsync(shareRequest);
                Assert.Equal(HttpStatusCode.OK, share.StatusCode);
                var chatId = (await Body(share)).GetProperty("conversationId").GetGuid();
                var card = Assert.Single((await Get(client.Http, $"/api/v1/messaging/conversations/{chatId}/messages")).GetProperty("items").EnumerateArray());
                Assert.Equal(JsonValueKind.Null, card.GetProperty("coachingEntry").GetProperty("formVersionId").ValueKind);
            }
            var draft = await Start(client.Http, offer, invitationId);
            Assert.Equal(JsonValueKind.Null, draft.GetProperty("formVersion").ValueKind);
            Assert.Equal(JsonValueKind.Null, draft.GetProperty("profileVersion").ValueKind);
            var id = draft.GetProperty("application").GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.NotFound, (await coach.Http.GetAsync($"{Root}/applications/{id}")).StatusCode);
            using var save = new HttpRequestMessage(HttpMethod.Put, $"{Root}/applications/{id}") { Content = JsonContent.Create(new SaveApplicationRequest(Answers())) };
            save.Headers.TryAddWithoutValidation("If-Match", "\"1\"");
            Assert.Equal(HttpStatusCode.BadRequest, (await client.Http.SendAsync(save)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Mutate(client.Http, $"{Root}/applications/{id}/submit", 1, new SubmitApplicationRequest(Answers()))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Mutate(client.Http, $"{Root}/applications/{id}/submit", 1, new SubmitApplicationRequest(new Dictionary<string, JsonElement>(), [SystemFieldKey.Weight], 1))).StatusCode);
            var submitted = await Mutate(client.Http, $"{Root}/applications/{id}/submit", 1, new SubmitApplicationRequest(new Dictionary<string, JsonElement>()));
            Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
            var app = (await Body(submitted)).GetProperty("application");
            var version = app.GetProperty("version").GetInt64();
            Assert.Equal(HttpStatusCode.OK, (await Mutate(client.Http, $"{Root}/applications/{id}/submit", version, new SubmitApplicationRequest(new Dictionary<string, JsonElement>()))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Mutate(client.Http, $"{Root}/applications/{id}/submit", version, new SubmitApplicationRequest(Answers()))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Mutate(other.Http, $"{Root}/applications/{id}/accept", version, new AcceptApplicationRequest())).StatusCode);
            var accepted = await Accept(coach.Http, app);
            Assert.Equal("Accepted", accepted.GetProperty("status").GetString());
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            var stored = await db.Applications.SingleAsync(x => x.Id == id);
            Assert.Null(stored.FormVersionId);
            Assert.Null(stored.FormSubmissionId);
            Assert.Equal("{}", stored.Answers);
            Assert.Single(await db.Services.Where(x => x.ApplicationId == id).ToArrayAsync());
            Assert.Equal(HttpStatusCode.OK, (await Mutate(coach.Http, $"{Root}/applications/{id}/accept", accepted.GetProperty("version").GetInt64(), new AcceptApplicationRequest())).StatusCode);
        }
    }
}
