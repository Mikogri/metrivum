using System.Diagnostics.Metrics;

namespace Metrivum.Media;

/// <summary>Contains the configured media quota settings and bounds for Media; does not itself access the database.</summary>
public sealed class MediaQuotaOptions
{
    public int UploadStartsPerHour { get; set; } = 30;
    public long DailyBytes { get; set; } = 2L * 1024 * 1024 * 1024;
    public long GlobalStorageBytes { get; set; } = 100L * 1024 * 1024 * 1024;
    public int StorageAlertPercent { get; set; } = 80;
    public int CleanupBatchSize { get; set; } = 25;
}

/// <summary>Records media quota instrumentation; does not store application records.</summary>
internal static class MediaQuotaMetrics
{
    private static readonly Meter Meter = new("Metrivum.Media.Quotas");
    internal static readonly Counter<long> Rejected = Meter.CreateCounter<long>("trainflow.media.quota.rejected");
    internal static readonly Counter<long> Reserved = Meter.CreateCounter<long>("trainflow.media.reserved_bytes");
    internal static readonly Histogram<double> StorageUsage = Meter.CreateHistogram<double>("trainflow.media.storage_budget_ratio");
    internal static readonly Counter<long> StorageAlerts = Meter.CreateCounter<long>("trainflow.media.storage_budget_alerts");
}
