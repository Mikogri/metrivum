namespace TrainFlow.Analytics.Contracts;

public sealed record McpMoneyMetric(string Currency, decimal Gross, decimal Fee, decimal Net, decimal Pending,
    int Payments, int PayingClients, decimal AveragePayment, decimal? RevenuePerPayingClient, decimal? Mrr,
    int? RecurringSubscriptions, int? Renewals, decimal SimulatedGross, decimal ExternalGross);
public sealed record McpFinancialSummary(IReadOnlyList<McpMoneyMetric> Totals, IReadOnlyList<FinancePoint> Series,
    IReadOnlyList<OfferRevenue>? Offers, bool SeriesHasMore, bool OffersHasMore, bool Advanced = true, bool SimulatedPayments = true);

public interface IMcpAnalyticsOperations
{
    Task<McpFinancialSummary> FinancialAsync(DateOnly from, DateOnly to, string timeZone, CancellationToken ct);
}
