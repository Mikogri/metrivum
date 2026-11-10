using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class CurrentServiceSummaryTests
{
    [CatalogPostgresFact]
    public async Task Current_services_batch_matches_latest_active_order_and_authorizes_all_ids_before_loading_billing()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var coachingReads = new Commands();
        var billingReads = new Commands();
        using var original = new ApiFactory(database);
        using var factory = original.WithWebHostBuilder(b =>
            b.ConfigureServices(s =>
            {
                s.AddScoped<IFeatureAccessService>(_ => new Features());
                s.AddDbContext<CoachingDbContext>((_, o) => o.AddInterceptors(coachingReads));
                s.AddDbContext<BillingDbContext>((_, o) => o.AddInterceptors(billingReads));
            })
        );
        using var http = factory.CreateClient();
        var coach = Guid.NewGuid();
        http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(coach));
        (
            await http.PutAsJsonAsync(
                "/api/v1/me/onboarding",
                new
                {
                    username = "s" + coach.ToString("N")[..25],
                    displayName = "Summary coach",
                    birthDate = "1990-01-01",
                    acceptedTerms = true,
                    locale = "en",
                    timeZone = "UTC",
                    role = "Coach",
                }
            )
        ).EnsureSuccessStatusCode();
        await using var accountDb = new AccountsDbContext(
            new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(database).Options
        );
        var workspace = await accountDb
            .Workspaces.Where(x => x.OwnerId == coach)
            .Select(x => x.Id)
            .SingleAsync();
        await using var db = new CoachingDbContext(
            new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(database).Options
        );
        await using var billing = new BillingDbContext(
            new DbContextOptionsBuilder<BillingDbContext>().UseNpgsql(database).Options
        );
        var at = DateTimeOffset.UtcNow.AddDays(-1);
        var ids = new List<Guid>();
        for (var i = 0; i < 21; i++)
        {
            var relationship = new Relationship
            {
                CoachId = coach,
                WorkspaceId = workspace,
                ClientId = Guid.NewGuid(),
                StartedAt = at,
                CreatedAt = at,
                UpdatedAt = at,
            };
            db.Add(relationship);
            ids.Add(relationship.Id);
            if (i == 20)
                continue;
            foreach (var kind in new[] { "old", "selected", "tie", "completed" })
            {
                var app = new CoachingApplication
                {
                    CoachId = coach,
                    WorkspaceId = workspace,
                    ApplicantUserId = relationship.ClientId,
                    CreatedAt = at,
                    UpdatedAt = at,
                };
                db.Add(app);
                var id = Guid.NewGuid();
                // Fixed UUID ordering checks the same tie breaker as the full service list.
                if (kind is "selected" or "tie")
                    id = Guid.Parse(
                        (kind == "selected" ? "00000000" : "ffffffff")
                            + Guid.NewGuid().ToString()[8..]
                    );
                var service = new RelationshipService
                {
                    Id = id,
                    RelationshipId = relationship.Id,
                    CoachId = coach,
                    WorkspaceId = workspace,
                    ClientId = relationship.ClientId,
                    ApplicationId = app.Id,
                    OfferName = kind,
                    OrderId = Guid.NewGuid(),
                    UpdatedAt = kind == "old" ? at : at.AddHours(1),
                    StartedAt = at,
                    Status = kind == "completed" ? ServiceStatus.Completed : ServiceStatus.Active,
                };
                db.Add(service);
                if (kind != "selected")
                    continue;
                var order = new Order
                {
                    Id = service.OrderId,
                    ServiceId = service.Id,
                    RelationshipId = relationship.Id,
                    CoachId = coach,
                    ClientId = relationship.ClientId,
                    Name = "Current",
                    OptionSnapshot = "{\"Model\":\"FixedPackage\"}",
                    Amount = 10,
                    CoachNetAmount = 10,
                    CreatedAt = at,
                    StartedAt = at,
                };
                billing.Add(order);
                billing.Add(
                    new PaymentDue
                    {
                        Id = Guid.NewGuid(),
                        OrderId = order.Id,
                        ServiceId = service.Id,
                        RelationshipId = relationship.Id,
                        CoachId = coach,
                        ClientId = relationship.ClientId,
                        Amount = 10,
                        CoachNetAmount = 10,
                        PeriodStart = at,
                        DueAt = at,
                        CreatedAt = at,
                    }
                );
            }
        }
        var foreign = new Relationship
        {
            CoachId = Guid.NewGuid(),
            WorkspaceId = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            StartedAt = at,
            CreatedAt = at,
            UpdatedAt = at,
        };
        db.Add(foreign);
        await db.SaveChangesAsync();
        await billing.SaveChangesAsync();
        string Url(IEnumerable<Guid> relationships) =>
            "/api/v1/coaching/services/current?"
            + string.Join("&", relationships.Select(x => "relationshipIds=" + x));
        coachingReads.Count = billingReads.Count = 0;
        var response = await http.GetAsync(Url(ids));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summaries = (await response.Content.ReadFromJsonAsync<JsonElement>())
            .EnumerateArray()
            .ToArray();
        Assert.Equal(20, summaries.Length);
        Assert.All(
            summaries,
            x =>
            {
                Assert.Equal("selected", x.GetProperty("offerName").GetString());
                Assert.Equal(
                    "Overdue",
                    x.GetProperty("currentBilling").GetProperty("status").GetString()
                );
            }
        );
        Assert.Equal(4, coachingReads.Count);
        Assert.Equal(1, billingReads.Count);
        coachingReads.Count = billingReads.Count = 0;
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync(Url([ids[0]]))).StatusCode);
        Assert.Equal(4, coachingReads.Count);
        Assert.Equal(1, billingReads.Count);
        billingReads.Count = 0;
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await http.GetAsync(Url([ids[0], foreign.Id]))).StatusCode
        );
        Assert.Equal(0, billingReads.Count);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await http.GetAsync(Url(Enumerable.Repeat(ids[0], 101)))).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await http.GetAsync(Url([Guid.Empty]))).StatusCode
        );
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Url(ids))).StatusCode);
    }

    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            Task.FromResult(
                new AccessSnapshot(
                    "test",
                    new[] { "coaching.clients.view", "coaching.services.manage" }
                        .Select(x => new FeatureDecision(x, true, "test"))
                        .ToArray(),
                    []
                )
            );
    }

    private sealed class Commands : DbCommandInterceptor
    {
        public int Count { get; set; }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData data,
            InterceptionResult<DbDataReader> result,
            CancellationToken ct = default
        )
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }
}
