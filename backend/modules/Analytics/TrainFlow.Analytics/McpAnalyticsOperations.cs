using TrainFlow.Analytics.Contracts;

namespace TrainFlow.Analytics;

public sealed class McpAnalyticsOperations(AnalysisService analytics) : IMcpAnalyticsOperations
{
    public async Task<McpFinancialSummary> FinancialAsync(DateOnly from, DateOnly to, string timeZone, CancellationToken ct)
    {
        var result = await analytics.FinancialAsync(new() { From = from, To = to, TimeZone = timeZone, Scope = "personal" }, ct);
        return new(result.Totals, result.Series.Take(1000).ToArray(), result.Offers.Take(50).ToArray(),
            result.Series.Count > 1000, result.Offers.Count > 50);
    }
}
