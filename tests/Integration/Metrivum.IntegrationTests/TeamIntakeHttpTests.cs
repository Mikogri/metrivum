using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class TeamIntakeHttpTests
{
    [CatalogPostgresFact]
    public async Task Existing_intake_requires_team_consent_and_preserves_personal_pair_and_seller_scope()
    {
        var teamId = Guid.NewGuid();
        var coachId = Guid.NewGuid();
        var clientId = Guid.NewGuid();
        var outsiderId = Guid.NewGuid();
        using var original = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        using var factory = original.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.AddScoped<IFeatureAccessService>(_ => new Features());
                services.AddSingleton<ITeamContext>(new TeamDirectory(teamId, coachId));
            })
        );
        using var coach = factory.CreateClient();
        coach.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(coachId));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(clientId));
        using var outsider = factory.CreateClient();
        outsider.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(outsiderId));
        await Onboard(coach, coachId, "Coach");
        await Onboard(client, clientId, "Client");
        await Onboard(outsider, outsiderId, "Coach");
        Guid personal;
        using (var scope = factory.Services.CreateScope())
            personal = await scope
                .ServiceProvider.GetRequiredService<IRelationshipActivation>()
                .ActivateDevFixtureAsync(coachId, clientId, default);
        var definition = new FormDefinition([
            new("main", "Main", 0, [new("notes", "Goals", QuestionType.LongText)]),
        ]);
        var form = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/forms",
                new FormTemplateRequest(FormPurpose.Application, "Team intake", "", definition)
            )
        );
        var publishedForm = await Body(
            await Mutate(coach, $"/api/v1/forms/{form.GetProperty("id").GetGuid()}/publish", 1)
        );
        var optionId = Guid.NewGuid();
        var offer = await Body(
            await coach.PostAsJsonAsync(
                "/api/v1/offers",
                new OfferRequest(
                    "Team coaching",
                    "Organizational service",
                    "strength",
                    CoachingMode.Online,
                    publishedForm.GetProperty("currentPublishedVersionId").GetGuid(),
                    [],
                    [
                        new(
                            optionId,
                            "Session",
                            BillingModel.PerSession,
                            80,
                            PaymentTerms: new(DueRule.Upfront)
                        ),
                    ],
                    teamId
                )
            )
        );
        var offerId = offer.GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Mutate(outsider, $"/api/v1/offers/{offerId}/publish", 1)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/v1/offers?teamId={teamId}")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await coach.GetAsync($"/api/v1/offers?teamId={Guid.NewGuid()}")).StatusCode
        );
        var published = await Body(
            await Mutate(
                coach,
                $"/api/v1/offers/{offerId}/publish",
                offer.GetProperty("version").GetInt64()
            )
        );
        Assert.Equal(teamId, published.GetProperty("teamId").GetGuid());
        Assert.Empty(
            (await Body(await coach.GetAsync("/api/v1/offers")))
                .GetProperty("items")
                .EnumerateArray()
        );
        Assert.Single(
            (await Body(await coach.GetAsync($"/api/v1/offers?teamId={teamId}")))
                .GetProperty("items")
                .EnumerateArray()
        );
        var started = await Body(
            await client.PostAsJsonAsync(
                "/api/v1/coaching/applications",
                new StartApplicationRequest(offerId, optionId)
            )
        );
        Assert.Equal(teamId, started.GetProperty("offerRevision").GetProperty("teamId").GetGuid());
        Assert.Equal(
            "Team counterparty",
            started.GetProperty("offerRevision").GetProperty("teamName").GetString()
        );
        var appId = started.GetProperty("application").GetProperty("id").GetGuid();
        var answers = new Dictionary<string, JsonElement>
        {
            ["notes"] = JsonSerializer.SerializeToElement(
                "Shared with the Team under submitted consent"
            ),
        };
        var noConsent = await Mutate(
            client,
            $"/api/v1/coaching/applications/{appId}/submit",
            1,
            new SubmitApplicationRequest(answers)
        );
        Assert.Equal(HttpStatusCode.BadRequest, noConsent.StatusCode);
        var submitted = await Body(
            await Mutate(
                client,
                $"/api/v1/coaching/applications/{appId}/submit",
                1,
                new SubmitApplicationRequest(answers, AcceptTeamScope: true)
            )
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await Mutate(
                    outsider,
                    $"/api/v1/coaching/applications/{appId}/accept",
                    submitted.GetProperty("application").GetProperty("version").GetInt64(),
                    new AcceptApplicationRequest(SettlementMode.External)
                )
            ).StatusCode
        );
        var accepted = await Body(
            await Mutate(
                coach,
                $"/api/v1/coaching/applications/{appId}/accept",
                submitted.GetProperty("application").GetProperty("version").GetInt64(),
                new AcceptApplicationRequest(SettlementMode.External)
            )
        );
        Assert.Equal(
            HttpStatusCode.PreconditionFailed,
            (
                await Mutate(
                    coach,
                    $"/api/v1/coaching/applications/{appId}/accept",
                    submitted.GetProperty("application").GetProperty("version").GetInt64(),
                    new AcceptApplicationRequest(SettlementMode.External)
                )
            ).StatusCode
        );
        var retried = await Body(
            await Mutate(
                coach,
                $"/api/v1/coaching/applications/{appId}/accept",
                accepted.GetProperty("version").GetInt64(),
                new AcceptApplicationRequest(SettlementMode.External)
            )
        );
        Assert.Equal(
            accepted.GetProperty("serviceId").GetGuid(),
            retried.GetProperty("serviceId").GetGuid()
        );
        var teamRelationship = accepted.GetProperty("relationshipId").GetGuid();
        Assert.NotEqual(personal, teamRelationship);
        using var verify = factory.Services.CreateScope();
        var coaching = verify.ServiceProvider.GetRequiredService<CoachingDbContext>();
        var relationships = await coaching
            .Relationships.Where(x => x.CoachId == coachId && x.ClientId == clientId)
            .ToArrayAsync();
        Assert.Equal(2, relationships.Length);
        Assert.Equal(RelationshipStatus.Active, relationships.Single(x => x.Id == personal).Status);
        Assert.Null(relationships.Single(x => x.Id == personal).TeamId);
        Assert.Equal(teamId, relationships.Single(x => x.Id == teamRelationship).TeamId);
        var savedApp = await coaching.Applications.SingleAsync(x => x.Id == appId);
        Assert.Equal("team-acquisition-v1", savedApp.TeamConsentVersion);
        Assert.NotNull(savedApp.TeamConsentAt);
        var billing = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        var order = await billing.Orders.SingleAsync(x => x.RelationshipId == teamRelationship);
        Assert.Equal(teamId, order.TeamId);
        Assert.NotNull(order.TeamClientCaseId);
        Assert.Equal(teamId, (await billing.Dues.SingleAsync(x => x.OrderId == order.Id)).TeamId);
        var personalList = (await Body(await coach.GetAsync("/api/v1/coaching/clients")))
            .GetProperty("items")
            .EnumerateArray()
            .ToArray();
        Assert.Single(personalList);
        Assert.Equal(personal, personalList[0].GetProperty("id").GetGuid());
    }

    private static async Task Onboard(HttpClient http, Guid id, string role) =>
        await Body(
            await http.PutAsJsonAsync(
                "/api/v1/me/onboarding",
                new
                {
                    username = "team" + id.ToString("N")[..20],
                    displayName = "Team intake test",
                    birthDate = "1990-01-01",
                    acceptedTerms = true,
                    locale = "en",
                    timeZone = "UTC",
                    role,
                }
            )
        );

    private static Task<HttpResponseMessage> Mutate(
        HttpClient client,
        string path,
        long version,
        object? body = null
    )
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
        if (body != null)
            request.Content = JsonContent.Create(body);
        return client.SendAsync(request);
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {content}");
        return JsonDocument.Parse(content).RootElement.Clone();
    }

    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            Task.FromResult(
                new AccessSnapshot(
                    "test",
                    new[]
                    {
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
                        .Select(x => new FeatureDecision(x, true, "test"))
                        .ToArray(),
                    []
                )
            );
    }

    private sealed class TeamDirectory(Guid teamId, Guid coachId) : ITeamContext
    {
        public Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult<TeamAccess?>(
                userId == coachId
                    ? new(teamId, coachId, "Owner", "Active", true, "Team counterparty")
                    : null
            );

        public async Task<TeamAccess> RequireAsync(
            Guid requestedTeamId,
            Guid userId,
            bool administrative,
            CancellationToken ct
        ) =>
            requestedTeamId == teamId
                ? await GetForUserAsync(userId, ct) ?? throw ApiException.NotFound()
                : throw ApiException.NotFound();
    }
}
