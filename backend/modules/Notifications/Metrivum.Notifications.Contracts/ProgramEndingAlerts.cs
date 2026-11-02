namespace Metrivum.Notifications.Contracts;

/// <summary>
/// When a coach hears that a client's assigned program is running out. A coach may pick several at once.
/// </summary>
public static class ProgramEndingAlerts
{
    public const string LastBlock = "LastBlock";
    public const string LastCycle = "LastCycle";
    public const string LastWeek = "LastWeek";
    public const string LastWorkout = "LastWorkout";
    public static readonly string[] All = [LastBlock, LastCycle, LastWeek, LastWorkout];
    public static readonly string[] Default = [LastWeek];
}

public interface IProgramEndingAlertPreferences
{
    /// <summary>The alerts each coach chose; coaches without saved preferences get the default.</summary>
    Task<IReadOnlyDictionary<Guid, string[]>> GetAsync(IReadOnlyCollection<Guid> coachIds, CancellationToken ct);
}
