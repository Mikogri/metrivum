using System.Net;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Access.Contracts;
using TrainFlow.Analytics;
using TrainFlow.Analytics.Contracts;
using TrainFlow.Billing.Contracts;
using TrainFlow.Billing.Domain;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.CheckIns.Domain;
using TrainFlow.CheckIns.Infrastructure;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Coaching.Domain;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Forms.Contracts;
using TrainFlow.Forms.Domain;
using TrainFlow.Forms.Infrastructure;
using TrainFlow.Messaging.Domain;
using TrainFlow.Messaging.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class AnalyticsTests
{
    private static string Database =>
        Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;

    [CatalogPostgresFact]
    public async Task Analytics_messaging_counts_only_visible_membership_and_window_in_one_query()
    {
        var commands = new AnalyticsCommands();
        await using var db = new MessagingDbContext(new DbContextOptionsBuilder<MessagingDbContext>()
            .UseNpgsql(Database).AddInterceptors(commands).Options);
        var coach = Guid.NewGuid();
        var peer = Guid.NewGuid();
        var at = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        foreach (var kind in new[] { "visible", "second", "excluded", "removed", "foreign" })
        {
            var conversation = new Conversation { Type = ConversationType.Group, CreatedAt = at, UpdatedAt = at };
            db.Conversations.Add(conversation);
            db.Members.Add(new ConversationMember
            {
                ConversationId = conversation.Id,
                UserId = kind == "foreign" ? peer : coach,
                JoinedAt = at,
                Excluded = kind == "excluded",
                State = kind is "removed" or "excluded" ? MemberState.Removed : MemberState.Active,
                CutoffSequence = kind is "removed" or "excluded" ? 1 : null,
                RemovedAt = kind is "removed" or "excluded" ? at.AddDays(1) : null
            });
            void Add(Guid sender, DateTimeOffset time, MessageType type = MessageType.Text) => db.Messages.Add(new Message
            {
                ConversationId = conversation.Id,
                SenderUserId = sender,
                Type = type,
                Body = "fixture",
                CreatedAt = time,
                Sequence = ++conversation.Sequence,
                IdempotencyKey = Guid.NewGuid().ToString(),
                RequestHash = "fixture",
            });
            Add(peer, at);
            if (kind == "visible")
            {
                Add(coach, at.AddHours(1));
                Add(peer, at.AddSeconds(-1));
                Add(peer, at.AddDays(1), MessageType.System);
                Add(peer, at.AddDays(5));
            }
        }
        await db.SaveChangesAsync();
        commands.Count = 0;
        var scope = new AnalysisScope(coach, Guid.NewGuid(),
            AnalysisDates.Create(new(2026, 10, 5), new(2026, 10, 8), "UTC"), null, null);
        Assert.Equal(new MessagingAnalysis(1, 2, 2), await new MessagingAnalytics(db).QueryAsync(scope, default));
        Assert.Equal(1, commands.Count);
    }

    [CatalogPostgresFact]
    public async Task Analytics_client_daily_status_uses_version_precedence_and_local_midnight()
    {
        await using var db = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>()
            .UseNpgsql(Database).Options);
        var coach = Guid.NewGuid();
        var workspace = Guid.NewGuid();
        var start = new DateTimeOffset(2026, 3, 27, 23, 0, 0, TimeSpan.Zero);
        var relationship = new Relationship
        {
            CoachId = coach,
            WorkspaceId = workspace,
            ClientId = Guid.NewGuid(),
            StartedAt = start,
            CreatedAt = start,
            UpdatedAt = start,
            Status = RelationshipStatus.Completed,
        };
        db.Relationships.Add(relationship);
        // Version 3 predates version 2: chronology must not override version precedence.
        foreach (var change in new[] {
            (2L, new DateTimeOffset(2026, 3, 29, 22, 0, 0, TimeSpan.Zero), RelationshipStatus.Active, RelationshipStatus.Completed),
            (3L, new DateTimeOffset(2026, 3, 28, 23, 0, 0, TimeSpan.Zero), RelationshipStatus.Completed, RelationshipStatus.Active),
            (4L, new DateTimeOffset(2026, 3, 30, 22, 0, 0, TimeSpan.Zero), RelationshipStatus.Active, RelationshipStatus.Suspended),
            (5L, new DateTimeOffset(2026, 3, 30, 22, 0, 0, TimeSpan.Zero), RelationshipStatus.Suspended, RelationshipStatus.Completed),
        })
            db.StatusChanges.Add(new RelationshipStatusChanged
            {
                RelationshipId = relationship.Id,
                ActorId = coach,
                Version = change.Item1,
                OccurredAt = change.Item2,
                PreviousStatus = change.Item3,
                NewStatus = change.Item4,
            });
        await db.SaveChangesAsync();
        var scope = new AnalysisScope(coach, workspace,
            AnalysisDates.Create(new(2026, 3, 28), new(2026, 3, 31), "Europe/Warsaw"), null, null);
        var result = await new CoachingAnalytics(db).ClientsAsync(scope, default);
        Assert.Equal(new[] { 1, 1, 1, 0 }, result.Series.Select(x => x.Active));
        Assert.Equal(new[] { 1, 0, 0, 0 }, result.Series.Select(x => x.NewClients));
        Assert.Equal(new[] { 0, 1, 0, 0 }, result.Series.Select(x => x.Reactivated));
        Assert.Equal(new[] { 0, 0, 1, 1 }, result.Series.Select(x => x.Departed));
        Assert.Equal(1, result.Completed);
    }

    [CatalogPostgresFact]
    public async Task Analytics_empty_acquisition_and_messaging_use_bounded_aggregate_queries()
    {
        var commands = new AnalyticsCommands();
        var scope = new AnalysisScope(Guid.NewGuid(), Guid.NewGuid(),
            AnalysisDates.Create(new(2026, 10, 1), new(2026, 10, 8), "UTC"), null, null);
        await using var coaching = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>()
            .UseNpgsql(Database).AddInterceptors(commands).Options);
        var acquisition = await new CoachingAnalytics(coaching).AcquisitionAsync(scope, default);
        Assert.Equal(0, acquisition.Submitted);
        Assert.Equal(2, commands.Count);
        commands.Count = 0;
        await using var messaging = new TrainFlow.Messaging.Infrastructure.MessagingDbContext(
            new DbContextOptionsBuilder<TrainFlow.Messaging.Infrastructure.MessagingDbContext>()
                .UseNpgsql(Database).AddInterceptors(commands).Options);
        var result = await new TrainFlow.Messaging.Infrastructure.MessagingAnalytics(messaging).QueryAsync(scope, default);
        Assert.Equal(new MessagingAnalysis(0, 0, 0), result);
        Assert.Equal(1, commands.Count);
    }

    [CatalogPostgresFact]
    public async Task Analytics_finance_known_fixture_excludes_platform_pending_other_coach_and_separates_currency()
    {
        var commands = new AnalyticsCommands();
        await using var db = new BillingDbContext(
            new DbContextOptionsBuilder<BillingDbContext>().UseNpgsql(Database).AddInterceptors(commands).Options
        );
        var coach = Guid.NewGuid();
        var client = Guid.NewGuid();
        var rel = Guid.NewGuid();
        var at = new DateTimeOffset(2026, 10, 7, 22, 30, 0, TimeSpan.Zero);
        var offer = Guid.NewGuid();
        void Add(
            decimal gross,
            string currency,
            BillingContext context,
            Guid owner,
            bool paid = true,
            SettlementMode mode = SettlementMode.Simulated
        )
        {
            var order = new Order
            {
                Id = Guid.NewGuid(),
                ServiceId = Guid.NewGuid(),
                RelationshipId = context == BillingContext.Platform ? Guid.Empty : rel,
                CoachId = owner,
                ClientId = context == BillingContext.Platform ? owner : client,
                OfferRevisionId = offer,
                BillingOptionId = Guid.NewGuid(),
                Name = "Metric fixture",
                OptionSnapshot = """{"Model":"FixedPackage"}""",
                Amount = gross,
                Currency = currency,
                FeeRate =
                    context == BillingContext.Platform || mode == SettlementMode.External ? 0 : .1m,
                FeeAmount =
                    context == BillingContext.Platform || mode == SettlementMode.External
                        ? 0
                        : gross * .1m,
                CoachNetAmount =
                    context == BillingContext.Platform || mode == SettlementMode.External
                        ? gross
                        : gross * .9m,
                StartedAt = at,
                CreatedAt = at,
                Context = context,
            };
            db.Orders.Add(order);
            var due = new PaymentDue
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ServiceId = order.ServiceId,
                RelationshipId = order.RelationshipId,
                CoachId = owner,
                ClientId = order.ClientId,
                PeriodStart = at,
                DueAt = at,
                Amount = gross,
                Currency = currency,
                FeeRate = order.FeeRate,
                FeeAmount = order.FeeAmount,
                CoachNetAmount = order.CoachNetAmount,
                CreatedAt = at,
                Status = paid ? DueStatus.Paid : DueStatus.AwaitingPayment,
                SettledAt = paid ? at : null,
                Context = context,
            };
            db.Dues.Add(due);
            if (paid)
                db.Payments.Add(
                    new Payment
                    {
                        Id = Guid.NewGuid(),
                        DueId = due.Id,
                        CoachId = owner,
                        ClientId = order.ClientId,
                        GrossAmount = gross,
                        FeeRate = order.FeeRate,
                        FeeAmount = order.FeeAmount,
                        CoachNetAmount = order.CoachNetAmount,
                        Currency = currency,
                        Mode = mode,
                        Source = "Metric fixture",
                        IdempotencyKey = Guid.NewGuid().ToString(),
                        SettledAt = at,
                        Context = context,
                    }
                );
        }
        Add(100, "EUR", BillingContext.CoachingService, coach);
        Add(200, "EUR", BillingContext.CoachingService, coach);
        Add(50, "EUR", BillingContext.CoachingService, coach, mode: SettlementMode.External);
        Add(500, "PLN", BillingContext.CoachingService, coach);
        Add(80, "EUR", BillingContext.CoachingService, coach, false);
        Add(999, "EUR", BillingContext.Platform, coach);
        Add(900, "EUR", BillingContext.CoachingService, Guid.NewGuid());
        await db.SaveChangesAsync();
        var scope = new AnalysisScope(
            coach,
            Guid.NewGuid(),
            AnalysisDates.Create(new(2026, 10, 8), new(2026, 10, 8), "Europe/Warsaw"),
            null,
            null
        );
        commands.Count = 0;
        var result = await new BillingAnalytics(db).QueryAsync(scope, default);
        Assert.Equal(4, commands.Count);
        var eur = result.Totals.Single(x => x.Currency == "EUR");
        Assert.Equal(350, eur.Gross);
        Assert.Equal(30, eur.Fee);
        Assert.Equal(320, eur.Net);
        Assert.Equal(80, eur.Pending);
        Assert.Equal(3, eur.Payments);
        Assert.Equal(1, eur.PayingClients);
        Assert.Equal(300, eur.SimulatedGross);
        Assert.Equal(50, eur.ExternalGross);
        Assert.Equal(500, result.Totals.Single(x => x.Currency == "PLN").Gross);
        Assert.All(result.Series, x => Assert.Equal(new DateOnly(2026, 10, 8), x.Date));
        at = at.AddDays(-1);
        Add(40, "EUR", BillingContext.CoachingService, coach);
        await db.SaveChangesAsync();
        var twoDays = await new BillingAnalytics(db).QueryAsync(scope with
        {
            Window = AnalysisDates.Create(new(2026, 10, 7), new(2026, 10, 8), "Europe/Warsaw"),
        }, default);
        Assert.Equal(390, twoDays.Totals.Single(x => x.Currency == "EUR").Gross);
        Assert.Equal(1, twoDays.Totals.Single(x => x.Currency == "EUR").PayingClients);
        Assert.Equal(2, twoDays.Series.Count(x => x.Currency == "EUR"));
        Assert.Equal(1, twoDays.Offers.Single(x => x.Currency == "EUR").Clients);

        Assert.Empty(
            (
                await new BillingAnalytics(db).QueryAsync(
                    scope with
                    {
                        RelationshipIds = [],
                    },
                    default
                )
            ).Totals
        );
    }

    [CatalogPostgresFact]
    public async Task Analytics_clients_reactivation_cohort_group_overlap_and_owner_isolation()
    {
        await using var db = new CoachingDbContext(
            new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(Database).Options
        );
        var coach = Guid.NewGuid();
        var workspace = Guid.NewGuid();
        var client = Guid.NewGuid();
        var start = new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero);
        var at = new DateTimeOffset(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);
        var r = new Relationship
        {
            Id = Guid.NewGuid(),
            CoachId = coach,
            WorkspaceId = workspace,
            ClientId = client,
            StartedAt = start,
            CreatedAt = start,
            UpdatedAt = at,
            Status = RelationshipStatus.Active,
            ActivationSource = ActivationSource.DevFixture,
        };
        db.Relationships.Add(r);
        db.StatusChanges.AddRange(
            new RelationshipStatusChanged
            {
                RelationshipId = r.Id,
                ActorId = coach,
                PreviousStatus = RelationshipStatus.Active,
                NewStatus = RelationshipStatus.Completed,
                OccurredAt = at.AddDays(-1),
                Version = 2,
            },
            new RelationshipStatusChanged
            {
                RelationshipId = r.Id,
                ActorId = coach,
                PreviousStatus = RelationshipStatus.Completed,
                NewStatus = RelationshipStatus.Active,
                OccurredAt = at,
                Version = 3,
            }
        );
        foreach (var name in new[] { "A", "B" })
        {
            var g = new ClientGroup
            {
                CoachId = coach,
                WorkspaceId = workspace,
                Name = name,
                CreatedAt = start,
                UpdatedAt = start,
            };
            db.Groups.Add(g);
            db.Memberships.Add(
                new GroupMembership
                {
                    CoachId = coach,
                    WorkspaceId = workspace,
                    GroupId = g.Id,
                    RelationshipId = r.Id,
                    CreatedAt = start,
                }
            );
        }
        await db.SaveChangesAsync();
        var s = new AnalysisScope(
            coach,
            workspace,
            AnalysisDates.Create(new(2026, 10, 1), new(2026, 10, 8), "UTC"),
            null,
            null
        );
        var result = await new CoachingAnalytics(db).ClientsAsync(s, default);
        Assert.Equal(1, result.Active);
        Assert.Equal(0, result.NewClients);
        Assert.Equal(1, result.Reactivated);
        Assert.Equal(1, result.Departed);
        Assert.Equal(100, result.RetentionPercent);
        Assert.Equal(2, result.Groups.Sum(x => x.Clients));
        Assert.Equal(
            0,
            (
                await new CoachingAnalytics(db).ClientsAsync(
                    s with
                    {
                        CoachId = Guid.NewGuid(),
                    },
                    default
                )
            ).Active
        );
        var acquisition = await new CoachingAnalytics(db).AcquisitionAsync(s, default);
        Assert.Null(acquisition.ConversionPercent);
    }

    [CatalogPostgresFact]
    public async Task Analytics_checkins_actual_recipient_requests_rates_review_time_and_group_filter()
    {
        var coach = Guid.NewGuid();
        var workspace = Guid.NewGuid();
        var client = Guid.NewGuid();
        var at = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        await using var coaching = new CoachingDbContext(
            new DbContextOptionsBuilder<CoachingDbContext>().UseNpgsql(Database).Options
        );
        var r = new Relationship
        {
            CoachId = coach,
            WorkspaceId = workspace,
            ClientId = client,
            StartedAt = at.AddMonths(-1),
            CreatedAt = at,
            UpdatedAt = at,
        };
        coaching.Relationships.Add(r);
        await coaching.SaveChangesAsync();
        await using var forms = new FormsDbContext(
            new DbContextOptionsBuilder<FormsDbContext>().UseNpgsql(Database).Options
        );
        var template = new FormTemplate
        {
            Id = Guid.NewGuid(),
            CoachId = coach,
            Purpose = FormPurpose.CheckIn,
            Name = "Analytics fixture",
            CreatedAt = at,
            UpdatedAt = at,
        };
        var version = new FormVersion
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            CoachId = coach,
            Purpose = FormPurpose.CheckIn,
            Name = template.Name,
            Number = 1,
            DraftVersion = 1,
            PublishedAt = at,
        };
        forms.Templates.Add(template);
        forms.Versions.Add(version);
        var submissions = Enumerable
            .Range(0, 2)
            .Select(i => new FormSubmission
            {
                Id = Guid.NewGuid(),
                FormVersionId = version.Id,
                RespondentId = client,
                SourceKey = Guid.NewGuid().ToString(),
                SubmittedAt = at.AddHours(i + 2),
            })
            .ToArray();
        forms.Submissions.AddRange(submissions);
        await forms.SaveChangesAsync();
        await using var checkins = new CheckInsDbContext(
            new DbContextOptionsBuilder<CheckInsDbContext>().UseNpgsql(Database).Options
        );
        var schedule = new CheckInSchedule
        {
            CoachId = coach,
            WorkspaceId = workspace,
            FormTemplateId = template.Id,
            Name = template.Name,
            RecurrenceJson = "{}",
            ResponseWindowHours = 24,
            CreatedAt = at,
            UpdatedAt = at,
        };
        checkins.Schedules.Add(schedule);
        for (var i = 0; i < 4; i++)
        {
            var req = new CheckInRequest
            {
                ScheduleId = schedule.Id,
                ScheduleName = schedule.Name,
                CoachId = coach,
                WorkspaceId = workspace,
                ClientId = client,
                RelationshipId = r.Id,
                FormVersionId = version.Id,
                AvailableAtUtc = at.AddMinutes(i),
                DueAtUtc = at.AddDays(1),
                Status = RequestStatus.Scheduled,
            };
            if (i < 2)
            {
                req.FormSubmissionId = submissions[i].Id;
                req.SubmittedAt = submissions[i].SubmittedAt;
                req.Status = RequestStatus.Submitted;
            }
            if (i == 0)
            {
                req.Status = RequestStatus.Reviewed;
                req.ReviewedAt = req.SubmittedAt!.Value.AddHours(4);
                req.ReviewedBy = coach;
            }
            if (i == 3)
            {
                req.Status = RequestStatus.Cancelled;
                req.CancelledAt = at.AddHours(1);
                req.CancelledBy = coach;
            }
            checkins.Requests.Add(req);
        }
        await checkins.SaveChangesAsync();
        var scope = new AnalysisScope(
            coach,
            workspace,
            AnalysisDates.Create(new(2026, 10, 5), new(2026, 10, 8), "UTC"),
            null,
            null
        );
        var result = await new CheckInsAnalytics(checkins).QueryAsync(scope, default);
        Assert.Equal(3, result.Issued);
        Assert.Equal(2, result.Submitted);
        Assert.Equal(1, result.Overdue);
        Assert.Equal(1, result.PendingReview);
        Assert.Equal(66.67m, result.SubmissionRate);
        Assert.Equal(4, result.AverageReviewHours);
        Assert.Equal(
            0,
            (
                await new CheckInsAnalytics(checkins).QueryAsync(
                    scope with
                    {
                        RelationshipIds = [],
                    },
                    default
                )
            ).Issued
        );
    }

    [Fact]
    public async Task Analytics_endpoints_require_authentication()
    {
        using var factory = new ApiFactory();
        using var http = factory.CreateClient();
        foreach (
            var name in new[]
            {
                "overview",
                "financial",
                "clients",
                "acquisition",
                "training",
                "check-ins",
            }
        )
            Assert.Equal(
                HttpStatusCode.Unauthorized,
                (await http.GetAsync("/api/v1/analyze/" + name)).StatusCode
            );
    }

    [CatalogPostgresFact]
    public async Task Analytics_http_role_invalid_bounds_foreign_group_and_empty_sources()
    {
        using var original = new ApiFactory(Database);
        using var factory = original.WithWebHostBuilder(b =>
            b.ConfigureServices(s =>
                s.AddScoped<IFeatureAccessService>(_ => new AnalyticsFeatures())
            )
        );
        async Task<HttpClient> User(string role)
        {
            var id = Guid.NewGuid();
            var http = factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new("Bearer", original.Token(id));
            Assert.Equal(
                HttpStatusCode.OK,
                (
                    await http.PutAsJsonAsync(
                        "/api/v1/me/onboarding",
                        new
                        {
                            username = "an" + id.ToString("N")[..20],
                            displayName = "Analytics fixture",
                            birthDate = "1990-01-01",
                            acceptedTerms = true,
                            locale = "en",
                            timeZone = "UTC",
                            role,
                        }
                    )
                ).StatusCode
            );
            return http;
        }
        using var coach = await User("Coach");
        using var client = await User("Client");
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/analyze/overview")).StatusCode
        );
        foreach (
            var query in new[]
            {
                "from=0001-01-01&to=0001-01-02",
                "from=9999-12-30&to=9999-12-31",
                "timeZone=Invalid%2FZone",
                "grouping=invalid",
            }
        )
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await coach.GetAsync("/api/v1/analyze/overview?" + query)).StatusCode
            );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await coach.GetAsync("/api/v1/analyze/overview?groupId=" + Guid.NewGuid())).StatusCode
        );
        var result = await coach.GetAsync(
            "/api/v1/analyze/overview?from=2026-10-01&to=2026-10-08&grouping=week"
        );
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var overview = (await result.Content.ReadFromJsonAsync<AnalysisOverview>())!;
        Assert.Empty(overview.Finance.Totals);
        Assert.Equal(0, overview.Clients.Active);
        Assert.True(overview.Training.Available);
        Assert.NotNull(overview.Training.Progress);
        Assert.Equal(0, overview.Training.Progress.Due);
        Assert.Equal(0, overview.Training.Progress.Completed);
        Assert.Null(overview.Training.Progress.CompletionPercentage);
        Assert.Empty(overview.Training.Progress.Performance);
        Assert.Null(overview.CheckIns.SubmissionRate);
        using (var isolated = original.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddScoped<IFeatureAccessService>(_ => new AnalyticsFeatures())
                .AddScoped<IMessagingAnalytics>(_ => new UnexpectedMessaging()))))
        using (var training = isolated.CreateClient())
        {
            training.DefaultRequestHeaders.Authorization = coach.DefaultRequestHeaders.Authorization;
            foreach (var section in new[] { "financial", "clients", "acquisition", "check-ins", "training" })
                Assert.Equal(HttpStatusCode.OK, (await training.GetAsync($"/api/v1/analyze/{section}")).StatusCode);
        }
        foreach (var section in new[] { "financial", "clients", "acquisition", "check-ins", "training" })
        {
            Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync(
                $"/api/v1/analyze/{section}?from=2026-10-01&to=2026-10-08&grouping=week")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await coach.GetAsync(
                $"/api/v1/analyze/{section}?grouping=invalid")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await coach.GetAsync(
                $"/api/v1/analyze/{section}?from=1901-01-01&to=1901-01-01")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await coach.GetAsync(
                $"/api/v1/analyze/{section}?groupId={Guid.NewGuid()}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(
                $"/api/v1/analyze/{section}")).StatusCode);
        }
        var windowsZone = await coach.GetFromJsonAsync<AnalysisOverview>(
            "/api/v1/analyze/overview?from=2026-10-01&to=2026-10-08&timeZone=Pacific%20Standard%20Time"
        );
        Assert.Equal("America/Los_Angeles", windowsZone!.Period.TimeZone);
    }

    private sealed class UnexpectedMessaging : IMessagingAnalytics
    {
        public Task<MessagingAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct) =>
            throw new InvalidOperationException("Section routes must not query overview messaging.");
    }

    private sealed class AnalyticsCommands : DbCommandInterceptor
    {
        public int Count
        {
            get; set;
        }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }

    private sealed class AnalyticsFeatures : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            Task.FromResult(new AccessSnapshot("fixture", [], []));
    }
}
