using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.Analytics;
using Metrivum.Analytics.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class AnalyticsEntitlementTests
{
    [Theory]
    [InlineData("overview")]
    [InlineData("context")]
    [InlineData("financial")]
    [InlineData("clients")]
    [InlineData("acquisition")]
    [InlineData("training")]
    public async Task Advanced_entry_points_check_the_plan_before_reading_aggregates(string section)
    {
        var service = new AnalysisService(new Account(), new Features(), null!, null!, null!, null!);
        var query = new AnalysisQuery();
        var exception = await Assert.ThrowsAsync<ApiException>(async () =>
        {
            switch (section)
            {
                case "overview": await service.QueryAsync(query, default); break;
                case "context": await service.ContextAsync(query, default); break;
                case "financial": await service.FinancialAsync(query, default); break;
                case "clients": await service.ClientsAsync(query, default); break;
                case "acquisition": await service.AcquisitionAsync(query, default); break;
                case "training": await service.TrainingAsync(query, default); break;
            }
        });
        Assert.Equal("feature_not_in_plan", exception.Code);
    }

    [Fact]
    public async Task Basic_and_Mcp_financial_reads_do_not_expose_retention_acquisition_Mrr_or_offer_breakdowns()
    {
        var features = new Features();
        var service = new AnalysisService(new Account(), features, new Finance(), new Coaching(), new CheckIns(), new Messaging());
        var report = await service.BasicAsync(new(), default);
        Assert.Equal(3, report.Clients.Active);
        Assert.Equal(90m, Assert.Single(report.Finance.Totals).Net);
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        foreach (var field in new[] { "mrr", "retentionPercent", "conversionPercent", "comparisonPeriod", "offers", "previousFinance" })
            Assert.DoesNotContain($"\"{field}\"", json);
        var mcp = await new McpAnalyticsOperations(service, features).FinancialAsync(new(2026, 10, 1), new(2026, 10, 20), "UTC", default);
        Assert.False(mcp.Advanced);
        Assert.Null(mcp.Offers);
        Assert.Null(Assert.Single(mcp.Totals).Mrr);
        Assert.Null(Assert.Single(mcp.Totals).RecurringSubscriptions);
        Assert.Equal(90m, Assert.Single(mcp.Totals).Net);
    }

    [Fact]
    public async Task Basic_still_requires_coach_role_even_when_the_plan_allows_it()
    {
        var service = new AnalysisService(new Account(false), new Features(), null!, null!, null!, null!);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.BasicAsync(new(), default));
        Assert.Equal("role_required", error.Code);
    }

    private sealed class Account(bool coach = true) : IAccountContext
    {
        public Guid UserId { get; } = Guid.NewGuid();
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) => coach ? Task.FromResult(new AccountIdentity(UserId, Guid.NewGuid())) : throw new ApiException(403, "role_required", "Coach required.");
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AccountRole>>([coach ? AccountRole.Coach : AccountRole.Client]);
        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) => throw new NotSupportedException();
        public Task RequireAdminAsync(string permission, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => key == "analytics.advanced" ? throw new ApiException(403, "feature_not_in_plan", "Requires Pro.") : Task.CompletedTask;
        public Task<AccessSnapshot> GetAsync(CancellationToken ct) => Task.FromResult(new AccessSnapshot("test", [new("analytics.view", true, "available"), new("analytics.advanced", false, "feature_not_in_plan")], []));
    }
    private sealed class Finance : IFinanceAnalytics
    {
        public Task<FinancialAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct) => Task.FromResult(new FinancialAnalysis([new("PLN", 100, 10, 90, 5, 1, 1, 100, 100, 999, 7, 4, 100, 0)], [], [new(Guid.NewGuid(), "Premium breakdown", "PLN", 100, 90, 1, 1)]));
    }
    private sealed class Coaching : ICoachingAnalytics
    {
        public Task<Guid[]?> ResolveRelationshipsAsync(Guid coachId, Guid workspaceId, Guid? groupId, Guid? offerRevisionId, CancellationToken ct) => Task.FromResult<Guid[]?>(null);
        public Task<ClientsAnalysis> ClientsAsync(AnalysisScope scope, CancellationToken ct) => Task.FromResult(new ClientsAnalysis(3, 2, 1, 5, 2, 3, 4, 99, [], []));
        public Task<AcquisitionAnalysis> AcquisitionAsync(AnalysisScope scope, CancellationToken ct) => throw new InvalidOperationException("Basic must not read acquisition.");
        public Task<AnalysisOptions> OptionsAsync(Guid coachId, Guid workspaceId, CancellationToken ct) => Task.FromResult(new AnalysisOptions([], []));
    }
    private sealed class CheckIns : ICheckInsAnalytics
    {
        public Task<CheckInsAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct) => Task.FromResult(new CheckInsAnalysis(1, 1, 0, 1, 100, null, []));
    }
    private sealed class Messaging : IMessagingAnalytics
    {
        public Task<MessagingAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct) => Task.FromResult(new MessagingAnalysis(2, 3, 1));
    }
}
