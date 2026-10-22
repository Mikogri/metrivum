namespace TrainFlow.Analytics.Contracts;

public sealed record McpFinancialSummary(IReadOnlyList<MoneyMetric> Totals, IReadOnlyList<FinancePoint> Series,
    IReadOnlyList<OfferRevenue> Offers, bool SeriesHasMore, bool OffersHasMore);

public interface IMcpAnalyticsOperations
{
    Task<McpFinancialSummary> FinancialAsync(DateOnly from, DateOnly to, string timeZone, CancellationToken ct);
}
