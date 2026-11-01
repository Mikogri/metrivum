using Metrivum.Analytics.Contracts;
using Metrivum.Access.Contracts;

namespace Metrivum.Analytics;

public sealed class McpAnalyticsOperations(AnalysisService analytics, IFeatureAccessService access) : IMcpAnalyticsOperations
{
    public async Task<McpFinancialSummary> FinancialAsync(DateOnly from, DateOnly to, string timeZone, CancellationToken ct)
    {
        var query = new AnalysisQuery { From = from, To = to, TimeZone = timeZone, Scope = "personal" };
        var advanced = (await access.GetAsync(ct)).Features.Any(x => x.Key == "analytics.advanced" && x.Available);
        if (advanced)
        {
            var result = await analytics.FinancialAsync(query, ct);
            return new(result.Totals.Select(x => new McpMoneyMetric(x.Currency, x.Gross, x.Fee, x.Net, x.Pending, x.Payments,
                    x.PayingClients, x.AveragePayment, x.RevenuePerPayingClient, x.Mrr, x.RecurringSubscriptions, x.Renewals, x.SimulatedGross, x.ExternalGross)).ToArray(),
                result.Series.Take(1000).ToArray(), result.Offers.Take(50).ToArray(), result.Series.Count > 1000, result.Offers.Count > 50);
        }
        var basic = await analytics.BasicFinancialAsync(query, ct);
        return new(basic.Totals.Select(x => new McpMoneyMetric(x.Currency, x.Gross, x.Fee, x.Net, x.Pending, x.Payments,
                x.PayingClients, x.AveragePayment, null, null, null, null, x.SimulatedGross, x.ExternalGross)).ToArray(),
            basic.Series.Take(1000).ToArray(), null, basic.Series.Count > 1000, false, Advanced: false);
    }
}
