using Microsoft.EntityFrameworkCore;
using Metrivum.Notifications.Contracts;
namespace Metrivum.Notifications;

/// <summary>Reads and updates preferences for training-program ending notifications.</summary>
public sealed class ProgramEndingAlertPreferences(NotificationsDbContext db) : IProgramEndingAlertPreferences
{
    public async Task<IReadOnlyDictionary<Guid, string[]>> GetAsync(IReadOnlyCollection<Guid> coachIds, CancellationToken ct)
    {
        var ids = coachIds.Distinct().ToArray();
        // Coaching notifications switched off means no program alerts either.
        var saved = await db.Preferences.AsNoTracking().Where(x => ids.Contains(x.UserId))
            .Select(x => new { x.UserId, x.Coaching, x.ProgramEnding }).ToDictionaryAsync(x => x.UserId, ct);
        return ids.ToDictionary(id => id, id => saved.TryGetValue(id, out var p) ? (p.Coaching ? p.ProgramEnding : []) : ProgramEndingAlerts.Default);
    }
}
