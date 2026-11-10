using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Infrastructure;
using Metrivum.Coaching.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class CoachSpecializationTests
{
    [CatalogPostgresFact]
    public async Task Canonical_selection_is_versioned_authorized_public_and_used_for_SQL_relevance()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!
        );
        using var coach = factory.CreateClient();
        using var other = factory.CreateClient();
        using var client = factory.CreateClient();
        var marker = "special" + Guid.NewGuid().ToString("N")[..12];
        var coachId = Guid.NewGuid();
        foreach (
            var (http, id, role) in new[]
            {
                (coach, coachId, "Coach"),
                (other, Guid.NewGuid(), "Coach"),
                (client, Guid.NewGuid(), "Client"),
            }
        )
        {
            http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
            (
                await http.PutAsJsonAsync(
                    "/api/v1/me/onboarding",
                    new
                    {
                        username = "s" + id.ToString("N")[..20],
                        displayName = marker,
                        birthDate = "1990-01-01",
                        acceptedTerms = true,
                        locale = "en",
                        timeZone = "UTC",
                        role,
                    }
                )
            ).EnsureSuccessStatusCode();
            if (role == "Coach")
                (
                    await http.PutAsJsonAsync(
                        "/api/v1/me/discovery",
                        new
                        {
                            published = true,
                            specializations = new[] { "Legacy text" },
                            languages = new[] { "en" },
                            modes = new[] { "Online" },
                            version = 0,
                        }
                    )
                ).EnsureSuccessStatusCode();
        }
        var categories = await client.GetFromJsonAsync<JsonElement>(
            "/api/v1/coaching/specializations"
        );
        Assert.Equal(5, categories.GetArrayLength());
        Assert.Equal(
            27,
            categories.EnumerateArray().Sum(x => x.GetProperty("specializations").GetArrayLength())
        );
        var codes = new[]
        {
            "strength_training",
            "powerlifting",
            "hypertrophy",
            "bodybuilding",
            "calisthenics",
        };
        var primary = codes.Take(3).ToArray();
        var save = await coach.PutAsJsonAsync(
            "/api/v1/me/coaching-specializations",
            new
            {
                selectedCodes = codes,
                primaryCodes = primary,
                version = 0,
            }
        );
        save.EnsureSuccessStatusCode();
        Assert.Equal(
            1,
            (await save.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt64()
        );
        Assert.Equal(
            HttpStatusCode.PreconditionFailed,
            (
                await coach.PutAsJsonAsync(
                    "/api/v1/me/coaching-specializations",
                    new
                    {
                        selectedCodes = codes,
                        primaryCodes = primary,
                        version = 0,
                    }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await client.PutAsJsonAsync(
                    "/api/v1/me/coaching-specializations",
                    new
                    {
                        selectedCodes = codes,
                        primaryCodes = primary,
                        version = 0,
                    }
                )
            ).StatusCode
        );
        // Eleven codes: one more than the limit of ten selected specializations.
        var eleven = new[]
        {
            "strength_training",
            "powerlifting",
            "olympic_weightlifting",
            "hypertrophy",
            "bodybuilding",
            "strongman",
            "calisthenics",
            "aerobic_conditioning",
            "anaerobic_conditioning",
            "interval_training",
            "endurance_training",
        };
        foreach (
            var invalid in new[]
            {
                eleven,
                new[] { "unknown" },
                new[] { "powerlifting", "powerlifting" },
            }
        )
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (
                    await coach.PutAsJsonAsync(
                        "/api/v1/me/coaching-specializations",
                        new
                        {
                            selectedCodes = invalid,
                            primaryCodes = Array.Empty<string>(),
                            version = 1,
                        }
                    )
                ).StatusCode
            );
        // Six primary specializations: one more than the limit of five.
        var six = codes.Append("strongman").ToArray();
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (
                await coach.PutAsJsonAsync(
                    "/api/v1/me/coaching-specializations",
                    new
                    {
                        selectedCodes = six,
                        primaryCodes = six,
                        version = 1,
                    }
                )
            ).StatusCode
        );
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            Assert.Equal(27, await db.Specializations.CountAsync());
            await db.Database.MigrateAsync();
            Assert.Equal(27, await db.Specializations.CountAsync());
            var inactive = await db.Specializations.SingleAsync(x => x.Code == "adaptive_fitness");
            inactive.Active = false;
            await db.SaveChangesAsync();
            try
            {
                Assert.Equal(
                    HttpStatusCode.BadRequest,
                    (
                        await coach.PutAsJsonAsync(
                            "/api/v1/me/coaching-specializations",
                            new
                            {
                                selectedCodes = new[] { "adaptive_fitness" },
                                primaryCodes = Array.Empty<string>(),
                                version = 1,
                            }
                        )
                    ).StatusCode
                );
            }
            finally
            {
                inactive.Active = true;
                await db.SaveChangesAsync();
            }
        }
        (
            await other.PutAsJsonAsync(
                "/api/v1/me/coaching-specializations",
                new
                {
                    selectedCodes = new[] { "strength_training" },
                    primaryCodes = Array.Empty<string>(),
                    version = 0,
                }
            )
        ).EnsureSuccessStatusCode();
        foreach (var http in new[] { client, coach })
        {
            var page = await http.GetFromJsonAsync<JsonElement>(
                $"/api/v1/discovery/coaches?search={marker}&specializations=strength_training,powerlifting&pageSize=1"
            );
            Assert.Equal(2, page.GetProperty("total").GetInt32());
            Assert.Equal(
                coachId,
                Assert
                    .Single(page.GetProperty("items").EnumerateArray())
                    .GetProperty("coachId")
                    .GetGuid()
            );
            Assert.Equal(
                1,
                (
                    await http.GetFromJsonAsync<JsonElement>(
                        $"/api/v1/discovery/coaches?search={marker}&specializations=strength_training,powerlifting&pageSize=1&page=2"
                    )
                )
                    .GetProperty("items")
                    .GetArrayLength()
            );
            Assert.Empty(
                (
                    await http.GetFromJsonAsync<JsonElement>(
                        $"/api/v1/discovery/coaches?search={marker}&specializations=strength_training&language=de"
                    )
                )
                    .GetProperty("items")
                    .EnumerateArray()
            );
        }
        var showcase = await client.GetFromJsonAsync<JsonElement>(
            $"/api/v1/coaches/{coachId}/showcase"
        );
        Assert.Equal(5, showcase.GetProperty("specializationSelections").GetArrayLength());
        var legacy = await coach.GetFromJsonAsync<JsonElement>("/api/v1/me/discovery");
        Assert.Equal("Legacy text", legacy.GetProperty("specializations")[0].GetString());
        Assert.Empty(
            (await other.GetFromJsonAsync<JsonElement>("/api/v1/me/coaching-specializations"))
                .GetProperty("primaryCodes")
                .EnumerateArray()
        );
        var concurrent = await Task.WhenAll(
            Enumerable
                .Range(0, 2)
                .Select(_ =>
                    coach.PutAsJsonAsync(
                        "/api/v1/me/coaching-specializations",
                        new
                        {
                            selectedCodes = codes,
                            primaryCodes = primary,
                            version = 1,
                        }
                    )
                )
        );
        Assert.Single(concurrent, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(concurrent, x => x.StatusCode == HttpStatusCode.PreconditionFailed);
        Assert.Equal(
            2,
            (await coach.GetFromJsonAsync<JsonElement>("/api/v1/me/coaching-specializations"))
                .GetProperty("version")
                .GetInt64()
        );
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CoachingDbContext>();
            Assert.Equal(
                2,
                await db.CoachSpecializationChanges.CountAsync(x => x.CoachId == coachId)
            );
            Assert.Equal(5, await db.CoachSpecializations.CountAsync(x => x.CoachId == coachId));
        }
    }

    [CatalogPostgresFact]
    public async Task Greater_coverage_beats_paid_priority_and_unrelated_paid_profiles_are_excluded()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!
        );
        using var relevant = factory.CreateClient();
        using var paid = factory.CreateClient();
        using var unrelated = factory.CreateClient();
        var marker = "coverage" + Guid.NewGuid().ToString("N")[..12];
        var relevantId = Guid.NewGuid();
        var paidId = Guid.NewGuid();
        var unrelatedId = Guid.NewGuid();
        foreach (
            var (http, id, codes) in new[]
            {
                (
                    relevant,
                    relevantId,
                    new[] { "powerlifting", "hypertrophy", "strength_training" }
                ),
                (paid, paidId, new[] { "powerlifting" }),
                (unrelated, unrelatedId, new[] { "senior_fitness" }),
            }
        )
        {
            http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
            (
                await http.PutAsJsonAsync(
                    "/api/v1/me/onboarding",
                    new
                    {
                        username = "v" + id.ToString("N")[..20],
                        displayName = marker + " Strength Training",
                        birthDate = "1990-01-01",
                        acceptedTerms = true,
                        locale = "en",
                        timeZone = "UTC",
                        role = "Coach",
                    }
                )
            ).EnsureSuccessStatusCode();
            (
                await http.PutAsJsonAsync(
                    "/api/v1/me/discovery",
                    new
                    {
                        published = true,
                        location = marker,
                        version = 0,
                    }
                )
            ).EnsureSuccessStatusCode();
            (
                await http.PutAsJsonAsync(
                    "/api/v1/me/coaching-specializations",
                    new
                    {
                        selectedCodes = codes,
                        primaryCodes = codes,
                        version = 0,
                    }
                )
            ).EnsureSuccessStatusCode();
            if (http != relevant)
            {
                var plans = await http.GetFromJsonAsync<JsonElement>("/api/v1/subscriptions/plans");
                var priceVersion = plans
                    .EnumerateArray()
                    .Single(x => x.GetProperty("id").GetString() == "Pro")
                    .GetProperty("priceVersion")
                    .GetString();
                var checkoutResponse = await http.PostAsJsonAsync(
                    "/api/v1/me/platform-subscription/checkout",
                    new { planId = "Pro", priceVersion }
                );
                checkoutResponse.EnsureSuccessStatusCode();
                var checkout = await checkoutResponse.Content.ReadFromJsonAsync<JsonElement>();
                (
                    await http.PostAsJsonAsync(
                        "/api/v1/me/platform-subscription/confirm-payment",
                        new
                        {
                            dueId = checkout.GetProperty("pendingDue").GetProperty("id").GetGuid(),
                            idempotencyKey = "coverage-" + id,
                        }
                    )
                ).EnsureSuccessStatusCode();
            }
        }
        var path =
            $"/api/v1/discovery/coaches?search={marker}&specializations=powerlifting,hypertrophy";
        var results = (await relevant.GetFromJsonAsync<JsonElement>(path))
            .GetProperty("items")
            .EnumerateArray()
            .ToArray();
        Assert.Equal(
            new[] { relevantId, paidId },
            results.Select(x => x.GetProperty("coachId").GetGuid())
        );
        Assert.False(results[0].GetProperty("featured").GetBoolean());
        Assert.True(results[1].GetProperty("featured").GetBoolean());
        Assert.DoesNotContain(results, x => x.GetProperty("coachId").GetGuid() == unrelatedId);
        var textMatches = (
            await relevant.GetFromJsonAsync<JsonElement>(
                $"/api/v1/discovery/coaches?search=Strength%20Training&location={marker}"
            )
        )
            .GetProperty("items")
            .EnumerateArray()
            .ToArray();
        Assert.Equal(3, textMatches.Length);
        Assert.Equal(relevantId, textMatches[0].GetProperty("coachId").GetGuid());
        var codeMatches = (
            await relevant.GetFromJsonAsync<JsonElement>(
                $"/api/v1/discovery/coaches?search=strength_training&location={marker}"
            )
        )
            .GetProperty("items")
            .EnumerateArray();
        Assert.Equal(relevantId, Assert.Single(codeMatches).GetProperty("coachId").GetGuid());
        (
            await paid.PutAsJsonAsync(
                "/api/v1/me/discovery",
                new { published = false, version = 1 }
            )
        ).EnsureSuccessStatusCode();
        Assert.Single(
            (await relevant.GetFromJsonAsync<JsonElement>(path))
                .GetProperty("items")
                .EnumerateArray()
        );
    }

    [CatalogPostgresFact]
    public async Task Pro_Team_and_Studio_have_identical_priority_and_expiry_preserves_specializations()
    {
        using var factory = new ApiFactory(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!
        );
        var ids = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).Order().ToArray();
        var plans = new[] { "Free", "Starter", "Pro", "Team", "Studio" };
        var clients = ids.Select(_ => factory.CreateClient()).ToArray();
        var marker = "equal" + Guid.NewGuid().ToString("N")[..12];
        var teamIds = new[] { Guid.NewGuid(), Guid.NewGuid() };
        try
        {
            for (var i = 0; i < clients.Length; i++)
            {
                clients[i].DefaultRequestHeaders.Authorization = new(
                    "Bearer",
                    factory.Token(ids[i])
                );
                (
                    await clients[i]
                        .PutAsJsonAsync(
                            "/api/v1/me/onboarding",
                            new
                            {
                                username = "q" + ids[i].ToString("N")[..20],
                                displayName = marker,
                                birthDate = "1990-01-01",
                                acceptedTerms = true,
                                locale = "en",
                                timeZone = "UTC",
                                role = "Coach",
                            }
                        )
                ).EnsureSuccessStatusCode();
                (
                    await clients[i]
                        .PutAsJsonAsync(
                            "/api/v1/me/discovery",
                            new { published = true, version = 0 }
                        )
                ).EnsureSuccessStatusCode();
                (
                    await clients[i]
                        .PutAsJsonAsync(
                            "/api/v1/me/coaching-specializations",
                            new
                            {
                                selectedCodes = new[] { "strength_training" },
                                primaryCodes = new[] { "strength_training" },
                                version = 0,
                            }
                        )
                ).EnsureSuccessStatusCode();
            }
            // Owning-module fixtures represent current paid periods and valid organization seats.
            // The unequal seat bundles must never become unequal Discovery weights.
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
                var now = DateTimeOffset.UtcNow;
                for (var i = 1; i <= 2; i++)
                {
                    var subscription = await db.PlatformSubscriptions.SingleOrDefaultAsync(x =>
                        x.OwnerId == ids[i]
                    );
                    if (subscription is null)
                        db.PlatformSubscriptions.Add(
                            subscription = new()
                            {
                                Id = Guid.NewGuid(),
                                OwnerId = ids[i],
                                CreatedAt = now,
                            }
                        );
                    var price = new PlanPrice
                    {
                        Id = Guid.NewGuid(),
                        PlanId = plans[i],
                        Version = marker + plans[i],
                        Amount = PlanCatalog.Get(plans[i]).MonthlyPriceEur,
                        Currency = PlanCatalog.Currency,
                        TermsVersion = PlanCatalog.TermsVersion,
                        CreatedAt = now,
                    };
                    db.PlanPrices.Add(price);
                    subscription.AcceptedPriceId = price.Id;
                    subscription.PlanId = plans[i];
                    subscription.Status = "Active";
                    subscription.PeriodStart = now.AddDays(-1);
                    subscription.PeriodEnd = now.AddDays(15);
                    subscription.UpdatedAt = now;
                }
                for (var i = 3; i < 5; i++)
                {
                    var teamId = teamIds[i - 3];
                    var price = new PlanPrice
                    {
                        Id = Guid.NewGuid(),
                        PlanId = plans[i],
                        Version = marker + plans[i],
                        Amount = PlanCatalog.Get(plans[i]).MonthlyPriceEur,
                        Currency = PlanCatalog.Currency,
                        TermsVersion = PlanCatalog.TermsVersion,
                        CreatedAt = now,
                    };
                    db.PlanPrices.Add(price);
                    db.Teams.Add(
                        new()
                        {
                            Id = teamId,
                            OwnerId = ids[i],
                            Name = marker + plans[i],
                            Status = "Active",
                            CreatedAt = now,
                        }
                    );
                    db.TeamMemberships.Add(
                        new()
                        {
                            TeamId = teamId,
                            UserId = ids[i],
                            Role = "Owner",
                            Status = "Active",
                            JoinedAt = now,
                        }
                    );
                    db.Set<TeamPlatformSubscription>()
                        .Add(
                            new()
                            {
                                TeamId = teamId,
                                AcceptedPriceId = price.Id,
                                PurchasedSeats = i == 3 ? 5 : 50,
                                PeriodStart = now.AddDays(-1),
                                PeriodEnd = now.AddDays(15),
                                Status = "Active",
                            }
                        );
                }
                await db.SaveChangesAsync();
                var priority = await scope
                    .ServiceProvider.GetRequiredService<IPlatformPlans>()
                    .GetPriorityCoachIdsAsync(ids, default);
                Assert.Equal(ids.Skip(2).Order(), priority.Order());
            }
            var path =
                $"/api/v1/discovery/coaches?search={marker}&specializations=strength_training";
            var ranked = (await clients[0].GetFromJsonAsync<JsonElement>(path))
                .GetProperty("items")
                .EnumerateArray()
                .ToArray();
            Assert.Equal(
                ids.Skip(2).Concat(ids.Take(2)),
                ranked.Select(x => x.GetProperty("coachId").GetGuid())
            );
            Assert.All(ranked.Take(3), x => Assert.True(x.GetProperty("featured").GetBoolean()));
            Assert.All(ranked.Skip(3), x => Assert.False(x.GetProperty("featured").GetBoolean()));
            var paged = new List<Guid>();
            for (var page = 1; page <= 5; page++)
                paged.Add(
                    Assert
                        .Single(
                            (
                                await clients[0]
                                    .GetFromJsonAsync<JsonElement>(
                                        path + $"&pageSize=1&page={page}"
                                    )
                            )
                                .GetProperty("items")
                                .EnumerateArray()
                        )
                        .GetProperty("coachId")
                        .GetGuid()
                );
            Assert.Equal(ranked.Select(x => x.GetProperty("coachId").GetGuid()), paged);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
                var ended = DateTimeOffset.UtcNow.AddHours(-1);
                foreach (
                    var subscription in await db
                        .PlatformSubscriptions.Where(x => ids.Contains(x.OwnerId))
                        .ToArrayAsync()
                )
                    subscription.PeriodEnd = ended;
                foreach (
                    var subscription in await db.Set<TeamPlatformSubscription>()
                        .Where(x => teamIds.Contains(x.TeamId))
                        .ToArrayAsync()
                )
                    subscription.PeriodEnd = ended;
                await db.SaveChangesAsync();
                Assert.Empty(
                    await scope
                        .ServiceProvider.GetRequiredService<IPlatformPlans>()
                        .GetPriorityCoachIdsAsync(ids, default)
                );
            }
            var expired = (await clients[0].GetFromJsonAsync<JsonElement>(path))
                .GetProperty("items")
                .EnumerateArray()
                .ToArray();
            Assert.Equal(ids, expired.Select(x => x.GetProperty("coachId").GetGuid()));
            Assert.All(expired, x => Assert.False(x.GetProperty("featured").GetBoolean()));
            for (var i = 2; i < 5; i++)
            {
                var selections = await clients[i]
                    .GetFromJsonAsync<JsonElement>("/api/v1/me/coaching-specializations");
                Assert.Equal(
                    "strength_training",
                    Assert
                        .Single(selections.GetProperty("selectedCodes").EnumerateArray())
                        .GetString()
                );
                Assert.Equal(
                    "strength_training",
                    Assert
                        .Single(selections.GetProperty("primaryCodes").EnumerateArray())
                        .GetString()
                );
                Assert.Equal(1, selections.GetProperty("version").GetInt64());
            }
        }
        finally
        {
            foreach (var client in clients)
                client.Dispose();
        }
    }
}
