namespace Metrivum.Analytics.Contracts;

public sealed record AnalysisWindow(
    DateOnly From,
    DateOnly To,
    string TimeZone,
    DateTimeOffset Start,
    DateTimeOffset End
);

public sealed record AnalysisScope(
    Guid CoachId,
    Guid WorkspaceId,
    AnalysisWindow Window,
    Guid? OfferRevisionId,
    Guid[]? RelationshipIds,
    string Grouping = "day",
    Guid? TeamId = null,
    Guid? MemberId = null
);

public sealed record Metric(decimal Current, decimal Previous, decimal? ChangePercent);

public sealed record MoneyMetric(
    string Currency,
    decimal Gross,
    decimal Fee,
    decimal Net,
    decimal Pending,
    int Payments,
    int PayingClients,
    decimal AveragePayment,
    decimal RevenuePerPayingClient,
    decimal Mrr,
    int RecurringSubscriptions,
    int Renewals,
    decimal SimulatedGross,
    decimal ExternalGross
);

public sealed record FinancePoint(
    DateOnly Date,
    string Currency,
    decimal Gross,
    decimal Fee,
    decimal Net,
    int Payments
);

public sealed record OfferRevenue(
    Guid OfferRevisionId,
    string Name,
    string Currency,
    decimal Gross,
    decimal Net,
    int Payments,
    int Clients
);

public sealed record FinancialAnalysis(
    IReadOnlyList<MoneyMetric> Totals,
    IReadOnlyList<FinancePoint> Series,
    IReadOnlyList<OfferRevenue> Offers
);

public sealed record ClientPoint(
    DateOnly Date,
    int Active,
    int NewClients,
    int Reactivated,
    int Departed
);

public sealed record GroupAnalysis(Guid Id, string Name, int Clients);

public sealed record ClientsAnalysis(
    int Active,
    int Suspended,
    int Completed,
    int NewClients,
    int Reactivated,
    int Departed,
    int NetGrowth,
    decimal? RetentionPercent,
    IReadOnlyList<ClientPoint> Series,
    IReadOnlyList<GroupAnalysis> Groups
);

public sealed record AcquisitionSource(
    string Source,
    int Submitted,
    int Accepted,
    int Rejected,
    int Pending,
    decimal? ConversionPercent
);

public sealed record AcquisitionAnalysis(
    int Submitted,
    int Accepted,
    int Rejected,
    decimal? ConversionPercent,
    int InvitationsSent,
    int InvitationsAccepted,
    int InvitationsDeclined,
    IReadOnlyList<AcquisitionSource> Sources
);

public sealed record CheckInPoint(DateOnly Date, int Issued, int Submitted, int Overdue);

public sealed record CheckInsAnalysis(
    int Issued,
    int Submitted,
    int Overdue,
    int PendingReview,
    decimal? SubmissionRate,
    double? AverageReviewHours,
    IReadOnlyList<CheckInPoint> Series
);

public sealed record MessagingAnalysis(int Sent, int Received, int Conversations);

public interface IMessagingAnalytics
{
    Task<MessagingAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct);
}

public sealed record TrainingAnalysis(
    bool Available,
    string Reason,
    Metrivum.Training.Contracts.TrainingProgressDto? Progress = null
);

public sealed record AnalysisOptions(
    IReadOnlyList<GroupAnalysis> Groups,
    IReadOnlyList<OfferChoice> Offers
);

public sealed record OfferChoice(Guid Id, string Name);

public sealed record AnalysisContext(
    AnalysisWindow Period,
    AnalysisWindow ComparisonPeriod,
    AnalysisOptions Filters
);

public sealed record AnalysisOverview(
    AnalysisWindow Period,
    AnalysisWindow ComparisonPeriod,
    FinancialAnalysis Finance,
    FinancialAnalysis PreviousFinance,
    ClientsAnalysis Clients,
    ClientsAnalysis PreviousClients,
    AcquisitionAnalysis Acquisition,
    AcquisitionAnalysis PreviousAcquisition,
    CheckInsAnalysis CheckIns,
    CheckInsAnalysis PreviousCheckIns,
    TrainingAnalysis Training,
    AnalysisOptions Filters,
    MessagingAnalysis Messaging
);

public interface IFinanceAnalytics
{
    Task<FinancialAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct);
}

public interface ICoachingAnalytics
{
    Task<Guid[]> ResolveTeamRelationshipsAsync(
        Guid teamId,
        Guid? memberId,
        Guid? groupId,
        Guid? offerRevisionId,
        CancellationToken ct
    ) => Task.FromResult(Array.Empty<Guid>());
    Task<AnalysisOptions> TeamOptionsAsync(Guid teamId, Guid? memberId, CancellationToken ct) =>
        Task.FromResult(new AnalysisOptions([], []));
    Task<Guid[]?> ResolveRelationshipsAsync(
        Guid coachId,
        Guid workspaceId,
        Guid? groupId,
        Guid? offerRevisionId,
        CancellationToken ct
    );
    Task<ClientsAnalysis> ClientsAsync(AnalysisScope scope, CancellationToken ct);
    Task<AcquisitionAnalysis> AcquisitionAsync(AnalysisScope scope, CancellationToken ct);
    Task<AnalysisOptions> OptionsAsync(Guid coachId, Guid workspaceId, CancellationToken ct);
}

public interface ICheckInsAnalytics
{
    Task<CheckInsAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct);
}

/// <summary>Calculates percentages and changes for analytics results in memory.</summary>
public static class MetricMath
{
    public static decimal? Percent(decimal numerator, decimal denominator) =>
        denominator == 0 ? null : decimal.Round(numerator / denominator * 100, 2);

    public static decimal? Change(decimal current, decimal previous) =>
        previous == 0 ? null : decimal.Round((current - previous) / previous * 100, 2);

    public static decimal Monthly(decimal amount, int periods, string unit) =>
        unit switch
        {
            "Week" => amount * 52 / (12 * periods),
            "Month" => amount / periods,
            "Year" => amount / (12 * periods),
            _ => throw new ArgumentException("Unknown billing period."),
        };
}

/// <summary>Groups dated analytics values into reporting buckets without changing source records.</summary>
public static class AnalysisBuckets
{
    public static DateOnly Start(DateOnly date, string grouping) =>
        grouping switch
        {
            "week" => date.AddDays(-((int)date.DayOfWeek + 6) % 7),
            "month" => new(date.Year, date.Month, 1),
            _ => date,
        };

    public static FinancePoint[] Finance(IEnumerable<FinancePoint> rows, string grouping) =>
        rows.GroupBy(x => new { Date = Start(x.Date, grouping), x.Currency })
            .Select(g => new FinancePoint(
                g.Key.Date,
                g.Key.Currency,
                g.Sum(x => x.Gross),
                g.Sum(x => x.Fee),
                g.Sum(x => x.Net),
                g.Sum(x => x.Payments)
            ))
            .OrderBy(x => x.Date)
            .ToArray();

    public static ClientPoint[] Clients(IEnumerable<ClientPoint> rows, string grouping) =>
        rows.GroupBy(x => Start(x.Date, grouping))
            .Select(g => new ClientPoint(
                g.Key,
                g.OrderBy(x => x.Date).Last().Active,
                g.Sum(x => x.NewClients),
                g.Sum(x => x.Reactivated),
                g.Sum(x => x.Departed)
            ))
            .OrderBy(x => x.Date)
            .ToArray();

    public static CheckInPoint[] CheckIns(IEnumerable<CheckInPoint> rows, string grouping) =>
        rows.GroupBy(x => Start(x.Date, grouping))
            .Select(g => new CheckInPoint(
                g.Key,
                g.Sum(x => x.Issued),
                g.Sum(x => x.Submitted),
                g.Sum(x => x.Overdue)
            ))
            .OrderBy(x => x.Date)
            .ToArray();
}
