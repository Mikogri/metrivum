using System.Net;
using System.Net.Http.Json;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;

namespace Metrivum.IntegrationTests;

/// <summary>Deleting offers: only the owner, only never-published drafts; published offers are archived.</summary>
public sealed partial class CoachingIntakeTests
{
    [CatalogPostgresFact]
    public async Task Only_a_never_published_draft_can_be_deleted_and_only_by_its_owner()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var other = await Onboard(factory, original, "Coach");

        var draftResponse = await coach.Http.PostAsJsonAsync("/api/v1/offers", new OfferRequest("Draft offer", "", "strength", CoachingMode.Online, null, ["draft"], [new(Guid.NewGuid(), "Free session", BillingModel.PerSession, 0)]));
        Assert.Equal(HttpStatusCode.OK, draftResponse.StatusCode);
        var draft = await Body(draftResponse);
        var draftId = draft.GetProperty("id").GetGuid();
        var draftVersion = draft.GetProperty("version").GetInt64();
        Assert.Equal(HttpStatusCode.NotFound, (await Delete(other.Http, draftId, draftVersion)).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Delete(coach.Http, draftId, draftVersion + 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Delete(coach.Http, draftId, draftVersion)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await coach.Http.GetAsync($"/api/v1/offers/{draftId}")).StatusCode);

        // A published offer keeps its immutable terms even when nobody used it: archive, not delete.
        var published = await PublishOffer(coach.Http, "Published offer");
        var inactive = await Body(await Mutate(coach.Http, $"/api/v1/offers/{published.Id}/deactivate", published.Version));
        Assert.False(inactive.GetProperty("hasClientHistory").GetBoolean());
        var refused = await Delete(coach.Http, published.Id, inactive.GetProperty("version").GetInt64());
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("OFFER_PUBLISHED", (await Body(refused)).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.OK, (await coach.Http.GetAsync($"/api/v1/offers/{published.Id}")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Offer_with_open_intake_or_client_history_cannot_be_deleted()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = Allow(original);
        var coach = await Onboard(factory, original, "Coach");
        var client = await Onboard(factory, original, "Client");
        var offer = await PublishOffer(coach.Http, "Used offer");
        var application = await Submitted(client.Http, offer);

        var inactive = await Body(await Mutate(coach.Http, $"/api/v1/offers/{offer.Id}/deactivate", offer.Version));
        var open = await Delete(coach.Http, offer.Id, inactive.GetProperty("version").GetInt64());
        Assert.Equal(HttpStatusCode.Conflict, open.StatusCode);
        Assert.Equal("OFFER_PUBLISHED", (await Body(open)).GetProperty("code").GetString());

        await Accept(coach.Http, application);
        var detail = await Get(coach.Http, $"/api/v1/offers/{offer.Id}");
        Assert.True(detail.GetProperty("hasClientHistory").GetBoolean());
        var used = await Delete(coach.Http, offer.Id, detail.GetProperty("version").GetInt64());
        Assert.Equal(HttpStatusCode.Conflict, used.StatusCode);
        Assert.Contains("archive", (await Body(used)).GetProperty("detail").GetString(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.OK, (await coach.Http.GetAsync($"/api/v1/offers/{offer.Id}")).StatusCode);
    }

    private static async Task<HttpResponseMessage> Delete(HttpClient http, Guid offerId, long version)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/offers/{offerId}");
        request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        return await http.SendAsync(request);
    }
}
