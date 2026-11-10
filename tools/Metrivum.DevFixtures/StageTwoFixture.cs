using System.Security.Claims;
using System.Text.Json;
using Metrivum.Accounts.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.CheckIns.Domain;
using Metrivum.CheckIns.Features;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Features;
using Metrivum.Forms.Infrastructure;
using Metrivum.Offers.Contracts;
using Metrivum.Offers.Features;
using Metrivum.Offers.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

internal static class StageTwoFixture
{
    private const string Prefix = "DevFixture Stage02 ";

    public static async Task RunAsync(IServiceProvider services, Guid[] ids)
    {
        var coach = ids[0];
        var otherCoach = ids[1];
        var client = ids[2];
        var invited = ids[3];
        await using var fixtureLock = await services
            .GetRequiredService<NpgsqlDataSource>()
            .OpenConnectionAsync();
        var lockKey = "stage02-fixture:" + coach;
        await using var claim = new NpgsqlCommand(
            "SELECT pg_advisory_lock(hashtextextended(@key,0))",
            fixtureLock
        );
        claim.Parameters.AddWithValue("key", lockKey);
        await claim.ExecuteNonQueryAsync();
        try
        {
            async Task<T> As<T>(Guid actor, Func<IServiceProvider, Task<T>> action)
            {
                await using var scope = services.CreateAsyncScope();
                var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
                accessor.HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(
                        new ClaimsIdentity(
                            [new Claim("sub", actor.ToString())],
                            "DevFixtureConsole"
                        )
                    ),
                };
                try
                {
                    return await action(scope.ServiceProvider);
                }
                finally
                {
                    accessor.HttpContext = null;
                }
            }
            var formIds = await As(
                coach,
                async sp =>
                {
                    var forms = sp.GetRequiredService<FormsService>();
                    var db = sp.GetRequiredService<FormsDbContext>();
                    async Task<FormTemplateDto> Form(
                        string name,
                        FormPurpose purpose,
                        FormQuestion question
                    )
                    {
                        var existing = await db
                            .Templates.AsNoTracking()
                            .SingleOrDefaultAsync(x =>
                                x.CoachId == coach
                                && x.Name == Prefix + name
                                && x.Purpose == purpose
                            );
                        var form =
                            existing == null
                                ? await forms.CreateAsync(
                                    new(
                                        purpose,
                                        Prefix + name,
                                        "Development/test accounts only",
                                        new([new("main", "Main", 0, [question])])
                                    ),
                                    default
                                )
                                : await forms.DetailAsync(existing.Id, default);
                        if (form.Archived)
                            throw new InvalidOperationException(
                                "Restore fixture form before rerunning: " + form.Name
                            );
                        return form.CurrentPublishedVersionId == null
                            ? await forms.PublishAsync(form.Id, form.Version, default)
                            : form;
                    }
                    var application = await Form(
                        "Application",
                        FormPurpose.Application,
                        new("goal", "Coaching goal", QuestionType.ShortText, true, MaxLength: 500)
                    );
                    var weekly = await Form(
                        "Weekly Review",
                        FormPurpose.CheckIn,
                        new(
                            "notes",
                            "How was your training week?",
                            QuestionType.LongText,
                            true,
                            MaxLength: 4000
                        )
                    );
                    var monthly = await Form(
                        "Monthly Progress",
                        FormPurpose.CheckIn,
                        new(
                            "weight",
                            "Body weight",
                            QuestionType.Number,
                            true,
                            Min: 1,
                            Max: 600,
                            Unit: "kg"
                        )
                    );
                    return (
                        Application: application.CurrentPublishedVersionId!.Value,
                        Weekly: weekly.Id,
                        Monthly: monthly.Id
                    );
                }
            );
            var offer = await As(
                coach,
                async sp =>
                {
                    var s = sp.GetRequiredService<OffersService>();
                    var db = sp.GetRequiredService<OffersDbContext>();
                    var existing = await db
                        .Offers.AsNoTracking()
                        .SingleOrDefaultAsync(x =>
                            x.CoachId == coach && x.Name == Prefix + "Online Coaching"
                        );
                    var draft =
                        existing == null
                            ? await s.CreateAsync(
                                new(
                                    Prefix + "Online Coaching",
                                    "Development/test fixture: four billing models",
                                    "strength",
                                    CoachingMode.Online,
                                    formIds.Application,
                                    ["development-fixture", "online"],
                                    [
                                        new(Guid.NewGuid(), "Session", BillingModel.PerSession, 80),
                                        new(
                                            Guid.NewGuid(),
                                            "Custom package",
                                            BillingModel.CustomPackage,
                                            70,
                                            MinSessions: 2,
                                            MaxSessions: 12
                                        ),
                                        new(
                                            Guid.NewGuid(),
                                            "Four sessions",
                                            BillingModel.FixedPackage,
                                            280,
                                            SessionCount: 4
                                        ),
                                        new(
                                            Guid.NewGuid(),
                                            "Monthly",
                                            BillingModel.PeriodSubscription,
                                            200,
                                            PeriodCount: 1,
                                            PeriodUnit: PeriodUnit.Month
                                        ),
                                    ]
                                ),
                                default
                            )
                            : await s.DetailAsync(existing.Id, default);
                    if (draft.Status == OfferStatus.Archived)
                        throw new InvalidOperationException(
                            "Archived fixture offer cannot be reused."
                        );
                    if (draft.CurrentPublishedRevisionId == null)
                        draft = await s.PublishAsync(draft.Id, draft.Version, default);
                    else if (draft.Status != OfferStatus.Active)
                        draft = await s.ChangeStatusAsync(
                            draft.Id,
                            OfferStatus.Active,
                            draft.Version,
                            default
                        );
                    return await s.GetCurrentAsync(draft.Id, default);
                }
            );
            var session = offer.BillingOptions.Single(x => x.Model == BillingModel.PerSession).Id;
            var package = offer.BillingOptions.Single(x => x.Model == BillingModel.FixedPackage).Id;
            var invitation = await As(
                coach,
                async sp =>
                {
                    var db = sp.GetRequiredService<CoachingDbContext>();
                    var intake = sp.GetRequiredService<CoachingIntakeService>();
                    var existing = await db
                        .Invitations.AsNoTracking()
                        .Where(x =>
                            x.CoachId == coach
                            && x.TargetUserId == invited
                            && x.OfferRevisionId == offer.Id
                            && (
                                x.Status == InvitationStatus.Pending
                                || x.Status == InvitationStatus.Accepted
                            )
                        )
                        .OrderByDescending(x => x.CreatedAt)
                        .FirstOrDefaultAsync();
                    if (existing != null)
                        return await intake.InvitationAsync(existing.Id, default);
                    var people = await sp.GetRequiredService<IAccountDirectory>()
                        .GetAccountsAsync([invited], default);
                    return await intake.CreateInvitationAsync(
                        new(
                            people[invited].Username
                                ?? throw new InvalidOperationException(
                                    "Invited fixture account needs a username."
                                ),
                            offer.OfferId,
                            package,
                            Prefix + "Invitation"
                        ),
                        default
                    );
                }
            );
            if (invitation.Status == InvitationStatus.Pending)
                invitation = await As(
                    invited,
                    sp =>
                        sp.GetRequiredService<CoachingIntakeService>()
                            .RespondInvitationAsync(
                                invitation.Id,
                                InvitationStatus.Accepted,
                                invitation.Version,
                                default
                            )
                );
            async Task<ApplicationDto> Application(
                Guid actor,
                Guid option,
                Guid? invitationId,
                SettlementMode mode
            )
            {
                var application = await As(
                    actor,
                    async sp =>
                    {
                        var db = sp.GetRequiredService<CoachingDbContext>();
                        var intake = sp.GetRequiredService<CoachingIntakeService>();
                        var existing = await db
                            .Applications.AsNoTracking()
                            .Where(x =>
                                x.CoachId == coach
                                && x.ApplicantUserId == actor
                                && x.OfferId == offer.OfferId
                                && x.InvitationId == invitationId
                                && (
                                    x.Status == ApplicationStatus.InProgress
                                    || x.Status == ApplicationStatus.Submitted
                                    || (
                                        x.Status == ApplicationStatus.Accepted
                                        && db.Services.Any(s =>
                                            s.ApplicationId == x.Id
                                            && s.Status == ServiceStatus.Active
                                        )
                                    )
                                )
                            )
                            .OrderByDescending(x => x.CreatedAt)
                            .FirstOrDefaultAsync();
                        if (existing != null)
                            return (
                                await intake.ApplicationAsync(existing.Id, default)
                                as ApplicationDetailDto
                            )!.Application;
                        return (
                            await intake.StartApplicationAsync(
                                new(offer.OfferId, option, InvitationId: invitationId),
                                default
                            )
                        ).Application;
                    }
                );
                if (application.Status == ApplicationStatus.InProgress)
                    application = (
                        await As(
                            actor,
                            sp =>
                                sp.GetRequiredService<CoachingIntakeService>()
                                    .SubmitAsync(
                                        application.Id,
                                        new(
                                            new Dictionary<string, JsonElement>
                                            {
                                                ["goal"] = JsonSerializer.SerializeToElement(
                                                    "Development fixture: improve strength and consistency"
                                                ),
                                            }
                                        ),
                                        application.Version,
                                        default
                                    )
                        )
                    ).Application;
                if (application.Status == ApplicationStatus.Submitted)
                    application = await As(
                        coach,
                        sp =>
                            sp.GetRequiredService<CoachingIntakeService>()
                                .AcceptAsync(
                                    application.Id,
                                    new(mode),
                                    application.Version,
                                    default
                                )
                    );
                if (
                    application.Status != ApplicationStatus.Accepted
                    || application.RelationshipId == null
                    || application.ServiceId == null
                )
                    throw new InvalidOperationException(
                        "Fixture application must be accepted before issuing services/check-ins."
                    );
                return application;
            }
            var direct = await Application(client, session, null, SettlementMode.Simulated);
            var fromInvitation = await Application(
                invited,
                package,
                invitation.Id,
                SettlementMode.External
            );
            var scheduleIds = await As(
                coach,
                async sp =>
                {
                    var groups = await sp.GetRequiredService<CoachingDbContext>()
                        .Groups.AsNoTracking()
                        .Where(x =>
                            x.CoachId == coach
                            && (x.Name == "DevFixture Group A1" || x.Name == "DevFixture Group A2")
                            && !x.Archived
                        )
                        .Select(x => x.Id)
                        .ToArrayAsync();
                    var db = sp.GetRequiredService<CheckInsDbContext>();
                    var s = sp.GetRequiredService<CheckInsService>();
                    var today = DateOnly.FromDateTime(DateTime.UtcNow);
                    async Task<Guid> Schedule(
                        string name,
                        Guid form,
                        Recurrence recurrence,
                        Guid[] relationships,
                        Guid[] groupIds
                    )
                    {
                        var existing = await db
                            .Schedules.AsNoTracking()
                            .SingleOrDefaultAsync(x =>
                                x.CoachId == coach && x.Name == Prefix + name
                            );
                        if (existing != null)
                            return existing.Id;
                        return (
                            await s.CreateAsync(
                                new(
                                    form,
                                    Prefix + name,
                                    "Development/test accounts only",
                                    "UTC",
                                    recurrence,
                                    48,
                                    relationships,
                                    groupIds
                                ),
                                default
                            )
                        ).Id;
                    }
                    var weekly = await Schedule(
                        "Weekly Group Review",
                        formIds.Weekly,
                        new(
                            RecurrenceKind.EveryNWeeks,
                            1,
                            today,
                            TimeOnly.MinValue,
                            [(int)today.DayOfWeek]
                        ),
                        [direct.RelationshipId!.Value],
                        groups
                    );
                    var monthly = await Schedule(
                        "Monthly Client Progress",
                        formIds.Monthly,
                        new(
                            RecurrenceKind.Monthly,
                            1,
                            today,
                            TimeOnly.MinValue,
                            DayOfMonth: today.Day
                        ),
                        [direct.RelationshipId.Value],
                        []
                    );
                    await s.GenerateDueAsync(100, default);
                    return (Weekly: weekly, Monthly: monthly);
                }
            );
            var request = await As(
                client,
                async sp =>
                {
                    var db = sp.GetRequiredService<CheckInsDbContext>();
                    var s = sp.GetRequiredService<CheckInsService>();
                    var issued =
                        await db
                            .Requests.AsNoTracking()
                            .Where(x =>
                                x.ScheduleId == scheduleIds.Weekly
                                && x.ClientId == client
                                && x.AvailableAtUtc <= DateTimeOffset.UtcNow
                                && x.Status != RequestStatus.Cancelled
                            )
                            .OrderByDescending(x => x.AvailableAtUtc)
                            .FirstOrDefaultAsync()
                        ?? throw new InvalidOperationException(
                            "Fixture check-in did not generate. Verify active relationships, targets and published form."
                        );
                    var detail = await s.DetailAsync(issued.Id, default);
                    return
                        detail.Request.Status is RequestStatus.Submitted or RequestStatus.Reviewed
                        ? detail
                        : await s.SubmitAsync(
                            issued.Id,
                            new(
                                new Dictionary<string, JsonElement>
                                {
                                    ["notes"] = JsonSerializer.SerializeToElement(
                                        "Development fixture: completed planned sessions"
                                    ),
                                }
                            ),
                            detail.Request.Version,
                            default
                        );
                }
            );
            if (request.Request.Status == RequestStatus.Submitted)
                request = await As(
                    coach,
                    sp =>
                        sp.GetRequiredService<CheckInsService>()
                            .ReviewAsync(
                                request.Request.Id,
                                new(
                                    "Development fixture: reviewed",
                                    "Fixture-only coach private note"
                                ),
                                request.Request.Version,
                                default
                            )
                );
            await As(
                client,
                async sp =>
                {
                    var billing = sp.GetRequiredService<BillingService>();
                    var db = sp.GetRequiredService<BillingDbContext>();
                    var due = await db
                        .Dues.AsNoTracking()
                        .SingleAsync(x => x.ServiceId == direct.ServiceId && x.Sequence == 0);
                    if (due.Status == DueStatus.AwaitingPayment)
                    {
                        var method =
                            (await billing.MethodsAsync(default)).FirstOrDefault(x =>
                                x.Label == Prefix + "Simulated"
                            ) ?? await billing.AddMethodAsync(new(Prefix + "Simulated"), default);
                        var paid = await billing.PayAsync(
                            due.Id,
                            new(method.Id, "fixture:" + due.OrderId),
                            default
                        );
                        if (paid.Due.Status == DueStatus.AwaitingPayment)
                            throw new InvalidOperationException(
                                "Fixture simulator payment did not settle."
                            );
                    }
                    return true;
                }
            );
            await As(
                coach,
                async sp =>
                {
                    var db = sp.GetRequiredService<BillingDbContext>();
                    var due = await db
                        .Dues.AsNoTracking()
                        .SingleAsync(x =>
                            x.ServiceId == fromInvitation.ServiceId && x.Sequence == 0
                        );
                    if (due.Status == DueStatus.AwaitingPayment)
                        await sp.GetRequiredService<BillingService>()
                            .ExternalAsync(
                                due.Id,
                                new(Prefix + "External settlement", "fixture:" + due.OrderId),
                                default
                            );
                    return true;
                }
            );
            await As(
                otherCoach,
                async sp =>
                {
                    try
                    {
                        await sp.GetRequiredService<OffersService>()
                            .DetailAsync(offer.OfferId, default);
                        throw new InvalidOperationException(
                            "Coach B unexpectedly read Coach A's private offer."
                        );
                    }
                    catch (ApiException error) when (error.Status == 404) { }
                    try
                    {
                        await sp.GetRequiredService<CheckInsService>()
                            .DetailAsync(request.Request.Id, default);
                        throw new InvalidOperationException(
                            "Coach B unexpectedly read Coach A's check-in."
                        );
                    }
                    catch (ApiException error) when (error.Status == 404) { }
                    return true;
                }
            );
            Console.WriteLine(
                $"Stage 02 ready: offer {offer.OfferId}; direct application {direct.Id}; invitation {invitation.Id}; invited application {fromInvitation.Id}; services {direct.ServiceId}, {fromInvitation.ServiceId}; schedules {scheduleIds.Weekly}, {scheduleIds.Monthly}; reviewed check-in {request.Request.Id}. Simulated and external dues settled; Coach B privacy verified."
            );
        }
        finally
        {
            await using var release = new NpgsqlCommand(
                "SELECT pg_advisory_unlock(hashtextextended(@key,0))",
                fixtureLock
            );
            release.Parameters.AddWithValue("key", lockKey);
            await release.ExecuteNonQueryAsync();
        }
    }
}
