namespace Metrivum.Analytics.Contracts;

public sealed record BasicMoneyMetric(
    string Currency,
    decimal Gross,
    decimal Fee,
    decimal Net,
    decimal Pending,
    int Payments,
    int PayingClients,
    decimal AveragePayment,
    decimal SimulatedGross,
    decimal ExternalGross
);

public sealed record BasicFinancialAnalysis(
    IReadOnlyList<BasicMoneyMetric> Totals,
    IReadOnlyList<FinancePoint> Series
);

public sealed record BasicClientCounts(int Active, int Suspended, int Completed);

public sealed record BasicAnalysis(
    AnalysisWindow Period,
    BasicClientCounts Clients,
    BasicFinancialAnalysis Finance,
    CheckInsAnalysis CheckIns,
    MessagingAnalysis Messaging,
    bool SimulatedPayments = true
);

/// <summary>Builds basic financial analytics projections from contract data; does not access module databases.</summary>
public static class BasicAnalysisProjection
{
    public static BasicMoneyMetric Money(MoneyMetric value) =>
        new(
            value.Currency,
            value.Gross,
            value.Fee,
            value.Net,
            value.Pending,
            value.Payments,
            value.PayingClients,
            value.AveragePayment,
            value.SimulatedGross,
            value.ExternalGross
        );

    public static BasicFinancialAnalysis Finance(FinancialAnalysis value) =>
        new(value.Totals.Select(Money).ToArray(), value.Series);
}
