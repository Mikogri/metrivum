using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Analytics.Contracts;
using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.Analytics;

/// <summary>Registers Analytics services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddAnalyticsModule(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddScoped<AnalysisService>();
        services.AddScoped<IMcpAnalyticsOperations, McpAnalyticsOperations>();
        services.AddSingleton(
            new FeatureDefinition(
                "analytics.view",
                "Analytics",
                "analytics.view.title",
                "analytics.view.description",
                [],
                []
            )
        );
        return services;
    }

    public static IEndpointRouteBuilder MapAnalyticsModule(this IEndpointRouteBuilder endpoints)
    {
        var routes = endpoints
            .MapGroup("/api/v1/analyze")
            .WithTags("Analytics")
            .RequireAuthorization();
        routes
            .MapGet(
                "/basic",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.BasicAsync(q, ct)
            )
            .Produces<BasicAnalysis>();
        routes
            .MapGet(
                "/overview",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.QueryAsync(q, ct)
            )
            .Produces<AnalysisOverview>();
        routes
            .MapGet(
                "/context",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.ContextAsync(q, ct)
            )
            .Produces<AnalysisContext>();
        routes
            .MapGet(
                "/messaging",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.MessagingAsync(q, ct)
            )
            .Produces<MessagingAnalysis>();
        routes
            .MapGet(
                "/financial",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.FinancialAsync(q, ct)
            )
            .Produces<FinancialAnalysis>();
        routes
            .MapGet(
                "/clients",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.ClientsAsync(q, ct)
            )
            .Produces<ClientsAnalysis>();
        routes
            .MapGet(
                "/acquisition",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.AcquisitionAsync(q, ct)
            )
            .Produces<AcquisitionAnalysis>();
        routes
            .MapGet(
                "/check-ins",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.CheckInsAsync(q, ct)
            )
            .Produces<CheckInsAnalysis>();
        routes
            .MapGet(
                "/training",
                ([AsParameters] AnalysisQuery q, AnalysisService s, CancellationToken ct) =>
                    s.TrainingAsync(q, ct)
            )
            .Produces<TrainingAnalysis>();
        return endpoints;
    }
}

/// <summary>Carries analytics filters bound from API requests; contains no database access.</summary>
public sealed class AnalysisQuery
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public string? TimeZone { get; set; }
    public string? Grouping { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? OfferRevisionId { get; set; }
    public string? Scope { get; set; }
    public Guid? MemberId { get; set; }
}

/// <summary>Builds authorized analytics views through owning-module contracts; does not maintain a second analytics database.</summary>
public sealed class AnalysisService(
    IAccountContext accounts,
    IFeatureAccessService access,
    IFinanceAnalytics finance,
    ICoachingAnalytics coaching,
    ICheckInsAnalytics checkins,
    IMessagingAnalytics messaging,
    Metrivum.Training.Contracts.ITrainingProgressReader? training = null,
    ITeamContext? teams = null,
    IAbuseProtection? abuse = null
)
{
    private async Task<AnalysisScope> ScopeAsync(
        AnalysisQuery q,
        CancellationToken ct,
        bool advanced = false
    )
    {
        var owner = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("analytics.view", ct);
        if (advanced)
            await access.RequireAsync("analytics.advanced", ct);
        if (abuse is not null)
            await abuse.RequireAsync(
                owner.UserId,
                AbusePolicies.AnalyticsQuery,
                cancellationToken: ct
            );
        var today = AnalysisDates.Today(q.TimeZone ?? "UTC", DateTimeOffset.UtcNow);
        var window = AnalysisDates.Create(
            q.From ?? today.AddDays(-29),
            q.To ?? today,
            q.TimeZone ?? "UTC"
        );
        // Every route historically validates the comparison window, including section routes.
        _ = AnalysisDates.Previous(window);
        var team = teams is null ? null : await teams.GetForUserAsync(owner.UserId, ct);
        var selected =
            q.Scope?.ToLowerInvariant()
            ?? (team is { IsActive: true, Role: "Owner" or "Admin" } ? "team" : "personal");
        if (selected is not ("personal" or "team" or "teammember"))
            throw Metrivum.BuildingBlocks.ApiException.Invalid(
                "Choose Personal, Team or TeamMember scope."
            );
        Guid? teamId = null;
        Guid? memberId = null;
        Guid[]? ids;
        if (selected == "personal")
        {
            if (q.MemberId is not null)
                throw Metrivum.BuildingBlocks.ApiException.Invalid(
                    "Member filter requires TeamMember scope."
                );
            ids = await coaching.ResolveRelationshipsAsync(
                owner.UserId,
                owner.WorkspaceId,
                q.GroupId,
                q.OfferRevisionId,
                ct
            );
        }
        else
        {
            if (team is not { IsActive: true })
                throw Metrivum.BuildingBlocks.ApiException.NotFound();
            if (
                selected == "team"
                && (team.Role is not ("Owner" or "Admin") || q.MemberId is not null)
            )
                throw Metrivum.BuildingBlocks.ApiException.NotFound();
            teamId = team.TeamId;
            memberId = selected == "teammember" ? q.MemberId ?? owner.UserId : null;
            if (team.Role == "Member" && memberId != owner.UserId)
                throw Metrivum.BuildingBlocks.ApiException.NotFound();
            if (memberId is { } selectedMember)
            {
                var member = await teams!.GetForUserAsync(selectedMember, ct);
                if (member?.TeamId != team.TeamId)
                    throw Metrivum.BuildingBlocks.ApiException.NotFound();
            }
            ids = await coaching.ResolveTeamRelationshipsAsync(
                team.TeamId,
                memberId,
                q.GroupId,
                q.OfferRevisionId,
                ct
            );
        }
        var grouping = q.Grouping ?? "day";
        if (grouping is not ("day" or "week" or "month"))
            throw Metrivum.BuildingBlocks.ApiException.Invalid(
                "Grouping must be day, week or month."
            );
        return new AnalysisScope(
            owner.UserId,
            owner.WorkspaceId,
            window,
            q.OfferRevisionId,
            ids,
            grouping,
            teamId,
            memberId
        );
    }

    public async Task<AnalysisContext> ContextAsync(AnalysisQuery q, CancellationToken ct)
    {
        var scope = await ScopeAsync(q, ct, advanced: true);
        return new(scope.Window, AnalysisDates.Previous(scope.Window), await Options(scope, ct));
    }

    public async Task<MessagingAnalysis> MessagingAsync(AnalysisQuery q, CancellationToken ct) =>
        await Messaging(await ScopeAsync(q, ct), ct);

    private Task<AnalysisOptions> Options(AnalysisScope scope, CancellationToken ct) =>
        scope.TeamId is { } teamId
            ? coaching.TeamOptionsAsync(teamId, scope.MemberId, ct)
            : coaching.OptionsAsync(scope.CoachId, scope.WorkspaceId, ct);

    private async Task<MessagingAnalysis> Messaging(AnalysisScope scope, CancellationToken ct) =>
        scope.TeamId is null ? await messaging.QueryAsync(scope, ct) : new(0, 0, 0);

    public async Task<FinancialAnalysis> FinancialAsync(AnalysisQuery q, CancellationToken ct) =>
        await finance.QueryAsync(await ScopeAsync(q, ct, advanced: true), ct);

    public async Task<ClientsAnalysis> ClientsAsync(AnalysisQuery q, CancellationToken ct) =>
        await coaching.ClientsAsync(await ScopeAsync(q, ct, advanced: true), ct);

    public async Task<AcquisitionAnalysis> AcquisitionAsync(
        AnalysisQuery q,
        CancellationToken ct
    ) => await coaching.AcquisitionAsync(await ScopeAsync(q, ct, advanced: true), ct);

    public async Task<CheckInsAnalysis> CheckInsAsync(AnalysisQuery q, CancellationToken ct) =>
        await checkins.QueryAsync(await ScopeAsync(q, ct), ct);

    public async Task<TrainingAnalysis> TrainingAsync(AnalysisQuery q, CancellationToken ct)
    {
        return await Training(await ScopeAsync(q, ct, advanced: true), ct);
    }

    private async Task<TrainingAnalysis> Training(AnalysisScope scope, CancellationToken ct) =>
        training is null
            ? new(false, "Training execution reports are unavailable.")
            : new(
                true,
                "Recorded executions only. Unlogged prescribed sets are never treated as actual training.",
                await training.ReadAsync(
                    new(
                        scope.Window.From,
                        scope.Window.To,
                        RelationshipIds: scope.RelationshipIds,
                        View: "coach",
                        TeamId: scope.TeamId,
                        MemberId: scope.MemberId
                    ),
                    ct
                )
            );

    public async Task<AnalysisOverview> QueryAsync(AnalysisQuery q, CancellationToken ct)
    {
        var scope = await ScopeAsync(q, ct, advanced: true);
        var window = scope.Window;
        var previous = AnalysisDates.Previous(window);
        var prior = scope with { Window = previous };
        // A scope shares one database connection; run aggregates sequentially.
        return new(
            window,
            previous,
            await finance.QueryAsync(scope, ct),
            await finance.QueryAsync(prior, ct),
            await coaching.ClientsAsync(scope, ct),
            await coaching.ClientsAsync(prior, ct),
            await coaching.AcquisitionAsync(scope, ct),
            await coaching.AcquisitionAsync(prior, ct),
            await checkins.QueryAsync(scope, ct),
            await checkins.QueryAsync(prior, ct),
            await Training(scope, ct),
            await Options(scope, ct),
            await Messaging(scope, ct)
        );
    }

    public async Task<BasicAnalysis> BasicAsync(AnalysisQuery q, CancellationToken ct)
    {
        var scope = await ScopeAsync(q, ct);
        var clients = await coaching.ClientsAsync(scope, ct);
        var financial = BasicAnalysisProjection.Finance(await finance.QueryAsync(scope, ct));
        return new(
            scope.Window,
            new(clients.Active, clients.Suspended, clients.Completed),
            financial,
            await checkins.QueryAsync(scope, ct),
            await Messaging(scope, ct)
        );
    }

    public async Task<BasicFinancialAnalysis> BasicFinancialAsync(
        AnalysisQuery q,
        CancellationToken ct
    ) => BasicAnalysisProjection.Finance(await finance.QueryAsync(await ScopeAsync(q, ct), ct));
}
