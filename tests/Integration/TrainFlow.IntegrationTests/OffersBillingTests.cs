using TrainFlow.Training.Infrastructure;
using TrainFlow.Training.Purchases;
using TrainFlow.Training.Contracts;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Billing;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Features;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Forms;
using TrainFlow.Forms.Contracts;
using TrainFlow.Forms.Features;
using TrainFlow.Forms.Infrastructure;
using TrainFlow.Offers;
using TrainFlow.Offers.Contracts;
using TrainFlow.Offers.Features;
using TrainFlow.Offers.Infrastructure;
using TrainFlow.Notifications;

namespace TrainFlow.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [Fact]
    public async Task Private_offer_and_billing_endpoints_require_authentication()
    {
        using var factory = new ApiFactory();
        using var http = factory.CreateClient();
        foreach (var route in new[] { "/api/v1/offers", "/api/v1/me/payment-methods", "/api/v1/me/orders", "/api/v1/me/payment-dues" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync(route)).StatusCode);
    }
    [CatalogPostgresFact]
    public async Task Http_billing_enforces_account_role_ownership_relationship_status_and_server_amounts()
    {
        using var original = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = original.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddScoped<IFeatureAccessService>(_ => new Features())));
        async Task<(Guid Id, HttpClient Http)> User(string role)
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(HttpStatusCode.OK, (await http.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "ob" + id.ToString("N")[..20],
                displayName = "Offers Billing",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC",
                role
            })).StatusCode);
            return (id, http);
        }
        var coach = await User("Coach");
        var client = await User("Client");
        var stranger = await User("Coach");
        using var coachHttp = coach.Http;
        using var clientHttp = client.Http;
        using var strangerHttp = stranger.Http;
        var created = await coachHttp.PostAsJsonAsync("/api/v1/forms", new FormTemplateRequest(FormPurpose.Application, "HTTP", "", new([new("main", "Main", 0, [new("goal", "Goal", QuestionType.ShortText)])])));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var form = (await created.Content.ReadFromJsonAsync<FormTemplateDto>())!;
        async Task<HttpResponseMessage> Versioned(HttpClient http, string route, long version, object? body = null)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, route);
            request.Headers.TryAddWithoutValidation("If-Match", $"\"{version}\"");
            if (body != null)
                request.Content = JsonContent.Create(body);
            return await http.SendAsync(request);
        }
        var publishedForm = await Versioned(coachHttp, $"/api/v1/forms/{form.Id}/publish", 1);
        var formId = (await publishedForm.Content.ReadFromJsonAsync<FormTemplateDto>())!.CurrentPublishedVersionId!.Value;
        var offerResponse = await coachHttp.PostAsJsonAsync("/api/v1/offers", Request(formId));
        Assert.Equal(HttpStatusCode.OK, offerResponse.StatusCode);
        var draft = (await offerResponse.Content.ReadFromJsonAsync<OfferDto>())!;
        Assert.Equal(HttpStatusCode.NotFound, (await strangerHttp.GetAsync($"/api/v1/offers/{draft.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await clientHttp.PostAsJsonAsync("/api/v1/offers", Request(formId))).StatusCode);
        Assert.Equal((HttpStatusCode)428, (await coachHttp.PostAsync($"/api/v1/offers/{draft.Id}/publish", null)).StatusCode);
        var publication = await Versioned(coachHttp, $"/api/v1/offers/{draft.Id}/publish", 1);
        var offer = (await publication.Content.ReadFromJsonAsync<OfferDto>())!;
        var publicResponse = await clientHttp.GetAsync($"/api/v1/coaches/{coach.Id}/offers/{offer.Id}");
        Assert.Equal(HttpStatusCode.OK, publicResponse.StatusCode);
        var publicBody = await publicResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(publicBody.TryGetProperty("draft", out _));
        Assert.False(publicBody.TryGetProperty("version", out _));
        ServiceOrderSnapshot order;
        Guid relationship;
        await using (var seed = factory.Services.CreateAsyncScope())
        {
            relationship = await seed.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(coach.Id, client.Id, default);
            order = await seed.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(new(Guid.NewGuid(), relationship, coach.Id, client.Id, offer.CurrentPublishedRevisionId!.Value, offer.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id, null, DateTimeOffset.UtcNow), default);
        }
        Assert.Equal(HttpStatusCode.OK, (await coachHttp.PostAsJsonAsync("/api/v1/me/payment-methods/simulated-card", new SimulatedMethodRequest("Platform renewal simulator"))).StatusCode);
        var methodResponse = await clientHttp.PostAsJsonAsync("/api/v1/me/payment-methods/simulated-card", new SimulatedMethodRequest("HTTP simulator"));
        Assert.Equal(HttpStatusCode.OK, methodResponse.StatusCode);
        var method = (await methodResponse.Content.ReadFromJsonAsync<PaymentMethodDto>())!;
        Assert.Equal(HttpStatusCode.NotFound, (await strangerHttp.PostAsJsonAsync($"/api/v1/coaching/payment-dues/{order.PaymentDueId}/mark-paid-externally", new ExternalSettlementRequest("forged", "alien"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await clientHttp.GetAsync($"/api/v1/coaching/relationships/{relationship}/billing")).StatusCode);
        var relationshipResponse = await coachHttp.GetAsync($"/api/v1/coaching/relationships/{relationship}");
        var relationshipVersion = (await relationshipResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt64();
        Assert.Equal(HttpStatusCode.OK, (await Versioned(coachHttp, $"/api/v1/coaching/relationships/{relationship}/suspend", relationshipVersion, new
        {
            internalReason = "Testing suspended billing"
        })).StatusCode);
        var hidden = await clientHttp.GetAsync("/api/v1/me/payment-dues");
        Assert.Equal(HttpStatusCode.OK, hidden.StatusCode);
        Assert.Equal(0, (await hidden.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await clientHttp.PostAsJsonAsync($"/api/v1/me/payment-dues/{order.PaymentDueId}/pay", new PayRequest(method.Id, "suspended"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Versioned(coachHttp, $"/api/v1/coaching/relationships/{relationship}/resume", relationshipVersion + 1, new
        {
            internalReason = "Resume"
        })).StatusCode);
        var forged = await clientHttp.PostAsJsonAsync($"/api/v1/me/payment-dues/{order.PaymentDueId}/pay", new
        {
            paymentMethodId = method.Id,
            idempotencyKey = "paid",
            grossAmount = 0,
            feeAmount = 0,
            coachNetAmount = 999
        });
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        var paid = await clientHttp.PostAsJsonAsync($"/api/v1/me/payment-dues/{order.PaymentDueId}/pay", new PayRequest(method.Id, "paid"));
        Assert.Equal(HttpStatusCode.OK, paid.StatusCode);
        var result = (await paid.Content.ReadFromJsonAsync<PaymentResultDto>())!;
        Assert.Equal(10.01m, result.Payment!.GrossAmount);
        Assert.Equal(BillingRules.Split(order.Amount, 0.10m).Net, result.Payment.CoachNetAmount);
        Assert.Equal(DueStatus.Paid, result.Due.Status);
        var retried = await clientHttp.PostAsJsonAsync($"/api/v1/me/payment-dues/{order.PaymentDueId}/pay", new PayRequest(method.Id, "paid"));
        Assert.Equal(HttpStatusCode.OK, retried.StatusCode);
        Assert.Equal(result.Payment.Id, (await retried.Content.ReadFromJsonAsync<PaymentResultDto>())!.Payment!.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await clientHttp.PostAsJsonAsync($"/api/v1/me/payment-dues/{order.PaymentDueId}/pay", new PayRequest(null, "paid"))).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var billing = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
            Assert.Equal(1, await billing.Payments.CountAsync(x => x.DueId == order.PaymentDueId));
            Assert.Equal(1, await billing.Attempts.CountAsync(x => x.DueId == order.PaymentDueId));
        }
        Assert.Equal(HttpStatusCode.OK, (await Versioned(coachHttp, $"/api/v1/coaching/relationships/{relationship}/complete", relationshipVersion + 2, new
        {
            internalReason = "Complete"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await clientHttp.GetAsync("/api/v1/me/payment-dues")).StatusCode);
    }
    [CatalogPostgresFact]
    public async Task Offer_publication_is_concurrent_safe_and_freezes_all_models_currency_and_form()
    {
        var owner = Guid.NewGuid();
        var currency = new Profiles();
        await using var p = Services(owner, currency: currency);
        Guid id;
        await using (var scope = p.CreateAsyncScope())
        {
            var draft = await CreateOffer(scope);
            id = draft.Id;
        }
        async Task<OfferDto> Publish()
        {
            await using var scope = p.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<OffersService>().PublishAsync(id, 1, default);
        }
        var publications = await Task.WhenAll(Publish(), Publish());
        Assert.Equal(publications[0].CurrentPublishedRevisionId, publications[1].CurrentPublishedRevisionId);
        await using var verify = p.CreateAsyncScope();
        var service = verify.ServiceProvider.GetRequiredService<OffersService>();
        var frozen = await service.GetCurrentAsync(id, default);
        Assert.Equal(4, frozen.BillingOptions.Count);
        Assert.Equal("EUR", frozen.Currency);
        currency.Currency = "PLN";
        var draftDto = await service.DetailAsync(id, default);
        var changed = await service.UpdateAsync(id, Request(frozen.ApplicationFormVersionId) with
        {
            Name = "Changed",
            BillingOptions = frozen.BillingOptions.Select(x => x with { Price = 77 }).ToArray()
        }, publications[0].Version, default);
        Assert.Equal("Original", (await service.GetRevisionAsync(frozen.Id, default)).Name);
        Assert.Equal("EUR", (await service.GetRevisionAsync(frozen.Id, default)).Currency);
        var inactive = await service.ChangeStatusAsync(id, OfferStatus.Inactive, changed.Version, default);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => service.GetCurrentAsync(id, default))).Status);
        Assert.Equal(30.03m, (await service.QuoteAsync(frozen.Id, frozen.BillingOptions.Single(x => x.Model == BillingModel.CustomPackage).Id, 3, default)).Amount);
        await using var other = Services(Guid.NewGuid());
        await using var stranger = other.CreateAsyncScope();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => stranger.ServiceProvider.GetRequiredService<OffersService>().DetailAsync(id, default))).Status);
        var db = verify.ServiceProvider.GetRequiredService<OffersDbContext>();
        Assert.Equal(1, await db.Revisions.CountAsync(x => x.OfferId == id));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE offers.revisions SET \"Name\"='forged' WHERE \"Id\"={frozen.Id}"));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE offers.revision_billing_options SET \"Price\"=1 WHERE \"RevisionId\"={frozen.Id}"));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE offers.billing_options SET \"MaxSessions\"=NULL WHERE \"OfferId\"={id} AND \"Model\"='CustomPackage'"));
        var publicPage = await service.PublicListAsync(owner, 1, 100, null, null, "name", default);
        Assert.Empty(publicPage.Items);
        Assert.Equal(OfferStatus.Inactive, inactive.Status);
    }
    [CatalogPostgresFact]
    public async Task Manual_payment_retries_are_unique_failures_persist_and_external_has_no_provider_transaction()
    {
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        await using var coachP = Services(coach, fee: "0.15");
        Guid revision;
        Guid option;
        await using (var seed = coachP.CreateAsyncScope())
        {
            var offer = await CreateOffer(seed);
            var published = await seed.ServiceProvider.GetRequiredService<OffersService>().PublishAsync(offer.Id, 1, default);
            var r = await seed.ServiceProvider.GetRequiredService<IOfferLibrary>().GetCurrentAsync(offer.Id, default);
            revision = r.Id;
            option = r.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id;
        }
        var command = new CreateServiceOrderCommand(Guid.NewGuid(), Guid.NewGuid(), coach, client, revision, option, null, DateTimeOffset.UtcNow);
        ServiceOrderSnapshot order;
        await using (var seed = coachP.CreateAsyncScope())
        {
            var billing = seed.ServiceProvider.GetRequiredService<BillingService>();
            order = await billing.CreateForServiceAsync(command, default);
            Assert.Equal(order.OrderId, (await billing.CreateForServiceAsync(command, default)).OrderId);
            Assert.Equal(1.50m, order.FeeAmount);
            Assert.Equal(8.51m, order.CoachNetAmount);
        }
        await using var buyerP = Services(client, fee: "0.9");
        Guid good;
        Guid bad;
        await using (var seed = buyerP.CreateAsyncScope())
        {
            var b = seed.ServiceProvider.GetRequiredService<BillingService>();
            good = (await b.AddMethodAsync(new("Simulator"), default)).Id;
            bad = (await b.AddMethodAsync(new("Decline", SimulatedOutcome.Decline), default)).Id;
            var failed = await b.PayAsync(order.PaymentDueId, new(bad, "decline"), default);
            Assert.Equal(AttemptStatus.Failed, failed.Attempt!.Status);
            Assert.Equal(DueStatus.AwaitingPayment, failed.Due.Status);
        }
        async Task<PaymentResultDto> Pay()
        {
            await using var scope = buyerP.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<BillingService>().PayAsync(order.PaymentDueId, new(good, "pay"), default);
        }
        var results = await Task.WhenAll(Pay(), Pay());
        Assert.Equal(results[0].Payment!.Id, results[1].Payment!.Id);
        Assert.Equal(0.9m, results[0].Payment!.FeeRate);
        await using (var check = buyerP.CreateAsyncScope())
        {
            var db = check.ServiceProvider.GetRequiredService<BillingDbContext>();
            Assert.Equal(1, await db.Payments.CountAsync(x => x.DueId == order.PaymentDueId));
            Assert.Equal(2, await db.Attempts.CountAsync(x => x.DueId == order.PaymentDueId));
            Assert.Equal(1, await db.Transactions.CountAsync(x => x.PaymentId == results[0].Payment!.Id));
            Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => check.ServiceProvider.GetRequiredService<BillingService>().PayAsync(order.PaymentDueId, new(bad, "pay"), default))).Status);
            await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE billing.payments SET \"FeeAmount\"=0 WHERE \"DueId\"={order.PaymentDueId}"));
            await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE billing.payment_dues SET \"Amount\"=0 WHERE \"Id\"={order.PaymentDueId}"));
            await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE billing.payment_attempts SET \"FailureCode\"='forged' WHERE \"DueId\"={order.PaymentDueId}"));
            var originalOrder = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == order.OrderId);
            var invalidOrder = new Order
            {
                Id = Guid.NewGuid(),
                ServiceId = Guid.NewGuid(),
                RelationshipId = originalOrder.RelationshipId,
                CoachId = coach,
                ClientId = client,
                OfferRevisionId = revision,
                BillingOptionId = Guid.NewGuid(),
                SelectedSessionCount = 1,
                Name = "Invalid custom count",
                OptionSnapshot = JsonSerializer.Serialize(new BillingOptionSnapshot(Guid.NewGuid(), "Custom", BillingModel.CustomPackage, 10.01m, MinSessions: 2, MaxSessions: 10)),
                Amount = 10.01m,
                Currency = "EUR",
                FeeRate = 0,
                FeeAmount = 0,
                CoachNetAmount = 10.01m,
                StartedAt = originalOrder.StartedAt,
                CreatedAt = originalOrder.CreatedAt
            };
            db.Orders.Add(invalidOrder);
            var violation = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Equal("CK_order_selected_sessions", (violation.InnerException as PostgresException)?.ConstraintName);
            db.ChangeTracker.Clear();
            var method = await db.Methods.AsNoTracking().SingleAsync(x => x.Id == good);
            Assert.StartsWith("sim_success_", method.Token);
            Assert.DoesNotContain("card", JsonSerializer.Serialize(method).ToLowerInvariant());
        }
        await using (var coachScope = coachP.CreateAsyncScope())
        {
            var b = coachScope.ServiceProvider.GetRequiredService<BillingService>();
            var ext = await b.CreateForServiceAsync(command with
            {
                ServiceId = Guid.NewGuid(),
                SettlementMode = SettlementMode.External
            }, default);
            var result = await b.ExternalAsync(ext.PaymentDueId, new("Bank transfer", "external"), default);
            Assert.Equal(DueStatus.PaidExternally, result.Due.Status);
            Assert.Equal(coach, result.Payment!.ActorId);
            Assert.Equal("Bank transfer", result.Payment.Source);
            Assert.Equal(0, result.Payment.FeeRate);
            Assert.Equal(10.01m, result.Payment.CoachNetAmount);
            Assert.Equal(result.Payment.Id, (await b.ExternalAsync(ext.PaymentDueId, new("Bank transfer", "external"), default)).Payment!.Id);
            var db = coachScope.ServiceProvider.GetRequiredService<BillingDbContext>();
            Assert.False(await db.Transactions.AnyAsync(x => x.PaymentId == result.Payment.Id));
            Assert.False(await db.Attempts.AnyAsync(x => x.DueId == ext.PaymentDueId));
            var earnings = Assert.Single(await b.EarningsAsync(default));
            Assert.Equal(11.01m, earnings.CoachNetAmount);
        }
        await using var alien = Services(Guid.NewGuid());
        await using var alienScope = alien.CreateAsyncScope();
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => alienScope.ServiceProvider.GetRequiredService<BillingService>().PayAsync(order.PaymentDueId, new(good, "alien"), default))).Status);
    }
    [CatalogPostgresFact]
    public async Task Orders_and_free_settlements_roll_back_with_outer_service_workflow()
    {
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var count = new CountingProvider();
        await using var p = Services(coach, provider: count);
        Guid revision;
        Guid option;
        await using (var seed = p.CreateAsyncScope())
        {
            var offer = await CreateOffer(seed, zero: true);
            await seed.ServiceProvider.GetRequiredService<OffersService>().PublishAsync(offer.Id, 1, default);
            var r = await seed.ServiceProvider.GetRequiredService<IOfferLibrary>().GetCurrentAsync(offer.Id, default);
            revision = r.Id;
            option = r.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id;
        }
        var command = new CreateServiceOrderCommand(Guid.NewGuid(), Guid.NewGuid(), coach, client, revision, option, null, DateTimeOffset.UtcNow);
        await using (var scope = p.CreateAsyncScope())
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<ModuleTransaction>().RunAsync(async ct => { await scope.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(command, ct); throw new InvalidOperationException("Later Coaching write failed"); }, default));
        }
        await using var verify = p.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        Assert.False(await db.Orders.AnyAsync(x => x.ServiceId == command.ServiceId));
        var order = await verify.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(command, default);
        Assert.Equal(DueStatus.Free, (await db.Dues.AsNoTracking().SingleAsync(x => x.Id == order.PaymentDueId)).Status);
        Assert.Equal(0, count.Calls);
        Assert.False(await db.Attempts.AnyAsync(x => x.DueId == order.PaymentDueId));
        Assert.Single(await db.Payments.Where(x => x.DueId == order.PaymentDueId).ToArrayAsync());
    }
    [CatalogPostgresFact]
    public async Task Durable_renewals_are_unique_across_workers_restart_and_preserve_month_anchor()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var clock = new Clock(new(2020, 1, 31, 12, 0, 0, TimeSpan.Zero));
        await using var p = Services(coach, clock: clock, database: isolated.Connection);
        CreateServiceOrderCommand command;
        ServiceOrderSnapshot order;
        await using (var seed = p.CreateAsyncScope())
        {
            var offer = await CreateOffer(seed);
            await seed.ServiceProvider.GetRequiredService<OffersService>().PublishAsync(offer.Id, 1, default);
            var r = await seed.ServiceProvider.GetRequiredService<IOfferLibrary>().GetCurrentAsync(offer.Id, default);
            command = new(Guid.NewGuid(), Guid.NewGuid(), coach, client, r.Id, r.BillingOptions.Single(x => x.Model == BillingModel.PeriodSubscription).Id, null, clock.GetUtcNow());
            order = await seed.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(command, default);
        }
        clock.Now = new(2020, 2, 29, 12, 0, 0, TimeSpan.Zero);
        async Task<int> Worker(ServiceProvider worker)
        {
            await using var scope = worker.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<BillingService>().GenerateRenewalsAsync(100, default);
        }
        await Task.WhenAll(Worker(p), Worker(p));
        await using (var verify = p.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
            var due = await db.Dues.AsNoTracking().SingleAsync(x => x.OrderId == order.OrderId && x.Sequence == 1);
            Assert.Equal(DueStatus.AwaitingPayment, due.Status);
            Assert.Equal(31, due.PeriodEnd!.Value.Day);
            Assert.False(await db.Payments.AnyAsync(x => x.DueId == due.Id));
        }
        await using var buyer = Services(client, clock: clock, database: isolated.Connection);
        await using (var attach = buyer.CreateAsyncScope())
        {
            var b = attach.ServiceProvider.GetRequiredService<BillingService>();
            var method = await b.AddMethodAsync(new("Renewal method"), default);
            await b.SetServiceRenewalAsync(order.SubscriptionId!.Value, new(true, method.Id), default);
        }
        Guid firstDue;
        await using (var read = p.CreateAsyncScope())
            firstDue = (await read.ServiceProvider.GetRequiredService<BillingDbContext>().Dues.AsNoTracking().SingleAsync(x => x.OrderId == order.OrderId && x.Sequence == 1)).Id;
        async Task<PaymentResultDto> ManualPay()
        {
            await using var payScope = buyer.CreateAsyncScope();
            var billing = payScope.ServiceProvider.GetRequiredService<BillingService>();
            var method = Assert.Single(await billing.MethodsAsync(default));
            return await billing.PayAsync(firstDue, new(method.Id, "manual-vs-worker"), default);
        }
        await Task.WhenAll(Worker(p), ManualPay());
        await using (var verify = p.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
            var payment = Assert.Single(await db.Payments.Where(x => x.DueId == firstDue).ToArrayAsync());
            Assert.Equal(1, await db.Transactions.CountAsync(x => x.PaymentId == payment.Id));
        }
        clock.Now = new(2020, 3, 31, 12, 0, 0, TimeSpan.Zero);
        await using var restarted = Services(coach, clock: clock, fee: "0.8", database: isolated.Connection);
        await Task.WhenAll(Worker(p), Worker(restarted));
        await using (var verify = restarted.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
            var due = await db.Dues.AsNoTracking().SingleAsync(x => x.OrderId == order.OrderId && x.Sequence == 2);
            Assert.Equal(DueStatus.Paid, due.Status);
            Assert.Contains(due.FeeRate, new[] { 0m, 0.8m });
            Assert.Equal(3, await db.Dues.CountAsync(x => x.OrderId == order.OrderId));
            Assert.Equal(1, await db.Payments.CountAsync(x => x.DueId == due.Id));
            await verify.ServiceProvider.GetRequiredService<IBillingOrders>().EndServiceAsync(command.ServiceId, default);
        }
        clock.Now = new(2020, 4, 30, 12, 0, 0, TimeSpan.Zero);
        await Worker(restarted);
        await using var final = restarted.CreateAsyncScope();
        Assert.Equal(3, await final.ServiceProvider.GetRequiredService<BillingDbContext>().Dues.CountAsync(x => x.OrderId == order.OrderId));
    }
    private static IConfiguration Config(string fee) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Billing:PlatformFeeRate"] = fee }).Build();
    [CatalogPostgresFact]
    public async Task Dual_role_client_uses_owned_read_capability_and_suspended_rows_are_filtered_before_pagination()
    {
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var allowed = Guid.NewGuid();
        var suspended = Guid.NewGuid();
        await using var p = Services(coach);
        Guid revision;
        Guid option;
        await using (var seed = p.CreateAsyncScope())
        {
            var draft = await CreateOffer(seed);
            var offers = seed.ServiceProvider.GetRequiredService<OffersService>();
            await offers.PublishAsync(draft.Id, 1, default);
            var r = await offers.GetCurrentAsync(draft.Id, default);
            revision = r.Id;
            option = r.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id;
            var billing = seed.ServiceProvider.GetRequiredService<IBillingOrders>();
            foreach (var relationship in new[] { suspended, allowed })
                await billing.CreateForServiceAsync(new(Guid.NewGuid(), relationship, coach, client, revision, option, null, DateTimeOffset.UtcNow), default);
        }
        var policy = new Policy([suspended]);
        await using var buyer = Services(client, policy: policy, features: new Features(denyManage: true));
        await using var scope = buyer.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<BillingService>();
        var history = await service.RelationshipAsync(allowed, 1, 1, default);
        var historyDue = Assert.Single(history.Dues.Items);
        Assert.NotNull(history.Summary);
        var serviceStates = await service.GetServiceStatesAsync([historyDue.ServiceId!.Value], default);
        Assert.Equal(historyDue.Currency, serviceStates[historyDue.ServiceId!.Value].Currency);
        Assert.Null(serviceStates[historyDue.ServiceId!.Value].RemainingSessions);
        Assert.NotEqual("Paid", serviceStates[historyDue.ServiceId!.Value].Status);
        Assert.All(history.Summary.OverdueByCurrency, x => Assert.Equal(historyDue.Currency, x.Currency));
        Assert.Empty((await service.RelationshipAsync(allowed, 1, 1, default, serviceId: Guid.NewGuid())).Dues.Items);
        Assert.Empty((await service.RelationshipAsync(allowed, 1, 1, default, status: DueStatus.Paid)).Dues.Items);
        Assert.Single((await service.RelationshipAsync(allowed, 1, 1, default, from: historyDue.DueAt.AddDays(-1), to: historyDue.DueAt.AddDays(1), sort: "latest")).Dues.Items);
        Assert.Empty((await service.RelationshipAsync(allowed, 1, 1, default, to: historyDue.DueAt)).Dues.Items);
        var dues = await service.DuesAsync(1, 1, null, "due", default);
        Assert.Equal(1, dues.Total);
        Assert.Equal(allowed, Assert.Single(dues.Items).RelationshipId);
        var orders = await service.OrdersAsync(1, 1, "created", default);
        Assert.Equal(1, orders.Total);
        Assert.Equal(allowed, Assert.Single(orders.Items).RelationshipId);
        Assert.Equal(2, policy.BatchCalls);
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(() => service.RelationshipAsync(suspended, 1, 1, default))).Status);
    }
    [CatalogPostgresFact]
    public async Task Generation_failure_is_persisted_with_retry_state_and_survives_restart()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var clock = new Clock(new(9998, 1, 1, 0, 0, 0, TimeSpan.Zero));
        await using var p = Services(coach, clock: clock, database: isolated.Connection);
        ServiceOrderSnapshot order;
        await using (var seed = p.CreateAsyncScope())
        {
            var draft = await CreateOffer(seed);
            var offers = seed.ServiceProvider.GetRequiredService<OffersService>();
            var edited = await offers.UpdateAsync(draft.Id, new(draft.Name, draft.Description, draft.Category, draft.CoachingMode, draft.ApplicationFormVersionId, draft.Tags,
                draft.BillingOptions.Select(x => x.Model == BillingModel.PeriodSubscription ? x with { PeriodUnit = PeriodUnit.Year } : x).ToArray()), draft.Version, default);
            await offers.PublishAsync(edited.Id, edited.Version, default);
            var revision = await offers.GetCurrentAsync(edited.Id, default);
            order = await seed.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(new(Guid.NewGuid(), Guid.NewGuid(), coach, client, revision.Id, revision.BillingOptions.Single(x => x.Model == BillingModel.PeriodSubscription).Id, null, clock.GetUtcNow()), default);
        }
        clock.Now = new(9999, 1, 1, 0, 0, 0, TimeSpan.Zero);
        await using (var worker = p.CreateAsyncScope())
            Assert.Equal(0, await worker.ServiceProvider.GetRequiredService<BillingService>().GenerateRenewalsAsync(1, default));
        await using (var verify = p.CreateAsyncScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
            var failure = await db.RenewalFailures.AsNoTracking().SingleAsync(x => x.SubscriptionId == order.SubscriptionId);
            Assert.Equal(1, failure.Attempts);
            Assert.Equal("VALIDATION_FAILED", failure.Code);
            Assert.Null(failure.ResolvedAt);
            Assert.Equal(1, await db.Dues.CountAsync(x => x.OrderId == order.OrderId));
            Assert.NotNull((await db.Subscriptions.AsNoTracking().SingleAsync(x => x.Id == order.SubscriptionId)).RetryAfter);
        }
        clock.Now = clock.Now.AddMinutes(2);
        await using var restarted = Services(coach, clock: clock, database: isolated.Connection);
        await using var retry = restarted.CreateAsyncScope();
        Assert.Equal(0, await retry.ServiceProvider.GetRequiredService<BillingService>().GenerateRenewalsAsync(1, default));
        Assert.Equal(2, (await retry.ServiceProvider.GetRequiredService<BillingDbContext>().RenewalFailures.AsNoTracking().SingleAsync(x => x.SubscriptionId == order.SubscriptionId)).Attempts);
    }
    [CatalogPostgresFact]
    public async Task Renewal_respects_due_rule_and_does_not_charge_before_end_of_service_period()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var clock = new Clock(new(2010, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var count = new CountingProvider();
        await using var p = Services(coach, clock: clock, provider: count, database: isolated.Connection);
        ServiceOrderSnapshot order;
        await using (var seed = p.CreateAsyncScope())
        {
            var draft = await CreateOffer(seed);
            var service = seed.ServiceProvider.GetRequiredService<OffersService>();
            var edited = await service.UpdateAsync(draft.Id, new(draft.Name, draft.Description, draft.Category, draft.CoachingMode, draft.ApplicationFormVersionId, draft.Tags,
                draft.BillingOptions.Select(x => x.Model == BillingModel.PeriodSubscription ? x with { PaymentTerms = new(DueRule.EndOfServicePeriod) } : x).ToArray()), draft.Version, default);
            await service.PublishAsync(edited.Id, edited.Version, default);
            var r = await service.GetCurrentAsync(edited.Id, default);
            order = await seed.ServiceProvider.GetRequiredService<IBillingOrders>().CreateForServiceAsync(new(Guid.NewGuid(), Guid.NewGuid(), coach, client, r.Id, r.BillingOptions.Single(x => x.Model == BillingModel.PeriodSubscription).Id, null, clock.GetUtcNow()), default);
        }
        await using var buyer = Services(client, clock: clock, database: isolated.Connection);
        await using (var attach = buyer.CreateAsyncScope())
        {
            var b = attach.ServiceProvider.GetRequiredService<BillingService>();
            var method = await b.AddMethodAsync(new("Automatic"), default);
            await b.SetServiceRenewalAsync(order.SubscriptionId!.Value, new(true, method.Id), default);
        }
        clock.Now = new(2010, 2, 1, 0, 0, 0, TimeSpan.Zero);
        await using (var worker = p.CreateAsyncScope())
            await worker.ServiceProvider.GetRequiredService<BillingService>().GenerateRenewalsAsync(100, default);
        await using var verify = p.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<BillingDbContext>();
        var due = await db.Dues.AsNoTracking().SingleAsync(x => x.OrderId == order.OrderId && x.Sequence == 1);
        Assert.Equal(new DateTimeOffset(2010, 3, 1, 0, 0, 0, TimeSpan.Zero), due.DueAt);
        Assert.Equal(DueStatus.AwaitingPayment, due.Status);
        Assert.Equal(0, count.Calls);
        clock.Now = due.DueAt;
        await using (var worker = p.CreateAsyncScope())
            await worker.ServiceProvider.GetRequiredService<BillingService>().GenerateRenewalsAsync(100, default);
        await db.Entry(due).ReloadAsync();
        Assert.Equal(DueStatus.Paid, due.Status);
        Assert.Equal(1, count.Calls);
    }
    private static ServiceProvider Services(Guid user, Profiles? currency = null, string fee = "0", Clock? clock = null, IPaymentProvider? provider = null, string? database = null, Policy? policy = null, IFeatureAccessService? features = null)
    {
        var s = new ServiceCollection();
        s.AddLogging();
        s.AddSingleton(NpgsqlDataSource.Create(database ?? Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!));
        s.AddSingleton<IAccountContext>(new Account(user));
        s.AddSingleton<IAccountDirectory, PurchaseAccountsDirectory>();
        s.AddSingleton<IFeatureAccessService>(features ?? new Features());
        s.AddSingleton<IAccountProfileFields>(currency ?? new Profiles());
        s.AddSingleton<IRelationshipAccessPolicy>(policy ?? new Policy());
        s.AddSingleton<TimeProvider>(clock ?? new Clock(DateTimeOffset.UtcNow));
        s.AddSingleton<IConfiguration>(Config(fee));
        if (provider != null)
            s.AddSingleton(provider);
        s.AddModuleDatabase<TrainingDbContext>("training");
        s.AddScoped<ITrainingPurchases, TrainingPurchaseService>();
        s.AddScoped<TrainingPurchaseService>();
        s.AddForms(Config(fee));
        s.AddOffers(Config(fee));
        s.AddBilling(Config(fee));
        s.AddNotifications(Config(fee));
        return s.BuildServiceProvider();
    }
    private static async Task<OfferDto> CreateOffer(AsyncServiceScope scope, bool zero = false)
    {
        var forms = scope.ServiceProvider.GetRequiredService<FormsService>();
        var form = await forms.CreateAsync(new(FormPurpose.Application, "Intake", "", new([new("main", "Main", 0, [new("goal", "Goal", QuestionType.ShortText)])])), default);
        var published = await forms.PublishAsync(form.Id, 1, default);
        return await scope.ServiceProvider.GetRequiredService<OffersService>().CreateAsync(Request(published.CurrentPublishedVersionId!.Value, zero), default);
    }
    private static OfferRequest Request(Guid form, bool zero = false) => new("Original", "Offer terms", "strength", CoachingMode.Online, form, [" Strength ", "strength", "online"], [
        new(Guid.NewGuid(), "Session", BillingModel.PerSession, zero ? 0 : 10.01m),
        new(Guid.NewGuid(), "Custom", BillingModel.CustomPackage, 10.01m, MinSessions: 2, MaxSessions: 10),
        new(Guid.NewGuid(), "Fixed", BillingModel.FixedPackage, 29.99m, SessionCount: 3),
        new(Guid.NewGuid(), "Monthly", BillingModel.PeriodSubscription, 35.99m, PeriodCount: 1, PeriodUnit: PeriodUnit.Month)]);
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now; public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class PurchaseAccountsDirectory : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) => Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(ids.ToDictionary(id => id, id => new AccountDirectoryEntry(id, id, null, "Test", [AccountRole.Client])));
    }
    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId => user;
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => Task.FromResult(new AccountIdentity(user, user));
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach, AccountRole.Client]);
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Features(bool denyManage = false) : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => denyManage && key == "billing.manage" ? Task.FromException(new ApiException(403, "FEATURE_UNAVAILABLE", "Coach billing feature is denied.")) : Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", new[] { "coaching.clients.view", "coaching.clients.manage", "coaching.relationships.read-own", "coaching.services.manage", "coaching.services.read-own" }.Select(x => new FeatureDecision(x, true, "AVAILABLE")).ToArray(), []));
    }
    private sealed class Policy(HashSet<Guid>? denied = null) : IRelationshipAccessPolicy
    {
        public int BatchCalls
        {
            get; private set;
        }
        private RelationshipAccessDecision Decision(Guid id) => new(denied?.Contains(id) != true, "RELATIONSHIP_ACCESS_DENIED", denied?.Contains(id) == true ? RelationshipStatus.Suspended : RelationshipStatus.Active);
        public Task<RelationshipAccessDecision> DecideAsync(Guid id, RelationshipOperation op, CancellationToken ct) => Task.FromResult(Decision(id));
        public Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(IReadOnlyCollection<Guid> ids, RelationshipOperation op, CancellationToken ct)
        {
            BatchCalls++;
            return Task.FromResult<IReadOnlyDictionary<Guid, RelationshipAccessDecision>>(ids.Distinct().ToDictionary(x => x, Decision));
        }
    }
    private sealed class IsolatedDatabase(string connection, string original, string name) : IAsyncDisposable
    {
        public string Connection => connection;
        public static async Task<IsolatedDatabase> CreateAsync()
        {
            var original = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
            var builder = new NpgsqlConnectionStringBuilder(original);
            if (builder.Host is not ("localhost" or "127.0.0.1" or "::1"))
                throw new InvalidOperationException("Local test PostgreSQL only.");
            var name = "offers_billing_tests_" + Guid.NewGuid().ToString("N");
            await using var admin = new NpgsqlConnection(original);
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand("CREATE DATABASE \"" + name + "\"", admin);
            await create.ExecuteNonQueryAsync();
            builder.Database = name;
            var connection = builder.ConnectionString;
            await using var forms = new FormsDbContext(new DbContextOptionsBuilder<FormsDbContext>().UseNpgsql(connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "forms")).Options);
            await forms.Database.MigrateAsync();
            await using var training = new TrainingDbContext(new DbContextOptionsBuilder<TrainingDbContext>().UseNpgsql(connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "training")).Options);
            await training.Database.MigrateAsync();
            await using var offers = new OffersDbContext(new DbContextOptionsBuilder<OffersDbContext>().UseNpgsql(connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "offers")).Options);
            await offers.Database.MigrateAsync();
            await using var billing = new BillingDbContext(new DbContextOptionsBuilder<BillingDbContext>().UseNpgsql(connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "billing")).Options);
            await billing.Database.MigrateAsync();
            await using var notifications = new NotificationsDbContext(new DbContextOptionsBuilder<NotificationsDbContext>().UseNpgsql(connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "notifications")).Options);
            await notifications.Database.MigrateAsync();
            return new(connection, original, name);
        }
        public async ValueTask DisposeAsync()
        {
            await using var admin = new NpgsqlConnection(original);
            await admin.OpenAsync();
            await using var drop = new NpgsqlCommand("DROP DATABASE \"" + name + "\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }
    private sealed class Profiles : IAccountProfileFields
    {
        public string Currency { get; set; } = "EUR";
        public Task<string> GetCurrencyAsync(Guid id, CancellationToken ct) => Task.FromResult(Currency);
        public Task<AccountProfileFields> GetOwnAsync(CancellationToken ct) => throw new NotSupportedException();
        public Task<AccountProfileFields> GetAllowedForUserAsync(Guid id, CancellationToken ct) => throw new NotSupportedException();
        public Task<AccountProfileFields> UpdateOwnAsync(IReadOnlyDictionary<SystemFieldKey, JsonElement> values, long version, CancellationToken ct) => throw new NotSupportedException();
        public Task<AccountProfileFields> UpdateCurrencyOwnAsync(string currency, long version, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class CountingProvider : IPaymentProvider
    {
        public int Calls
        {
            get; private set;
        }
        public Task<ProviderResult> ChargeAsync(ProviderCharge charge, CancellationToken ct)
        {
            Calls++;
            return new SimulatedPaymentProvider().ChargeAsync(charge, ct);
        }
    }
}
