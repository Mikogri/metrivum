using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Metrivum.Notifications.Contracts;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Delivery;

/// <summary>
/// Tells coaches when a client's assigned program is running out, at the moments each coach chose. Each alert is sent
/// once per assignment: the event key makes repeats (another instance, the next run) a no-op.
/// </summary>
public sealed class ProgramEndingAlertsJob(TrainingDbContext db, IProgramEndingAlertPreferences preferences, INotificationPublisher notifications, TimeProvider clock)
{
    public async Task<int> RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // Only programs that still have workouts ahead (a day of slack covers every time zone).
        var horizon = DateOnly.FromDateTime(now.UtcDateTime).AddDays(-1);
        var running = await db.Set<WorkoutOccurrence>().AsNoTracking()
            .Where(o => !o.Superseded && db.Set<ProgramAssignment>().Any(a => a.Id == o.AssignmentId && a.Status == AssignmentStatus.Active))
            .GroupBy(o => o.AssignmentId)
            .Select(g => new { AssignmentId = g.Key, Last = g.Max(o => o.ScheduledDate) })
            .Where(x => x.Last >= horizon)
            .Select(x => x.AssignmentId)
            .ToArrayAsync(ct);
        if (running.Length == 0) return 0;
        var assignments = await db.Set<ProgramAssignment>().AsNoTracking().Where(a => running.Contains(a.Id))
            .Select(a => new { a.Id, a.CoachId, a.RelationshipId, a.TimeZone, a.CreatedAt }).ToArrayAsync(ct);
        var chosen = await preferences.GetAsync(assignments.Select(a => a.CoachId).Distinct().ToArray(), ct);
        var sent = 0;
        foreach (var a in assignments)
        {
            if (!chosen.TryGetValue(a.CoachId, out var kinds) || kinds.Length == 0) continue;
            var slots = await db.Set<WorkoutOccurrence>().AsNoTracking().Where(o => o.AssignmentId == a.Id && !o.Superseded)
                .Select(o => new PlannedSlot(o.ScheduledDate, o.BlockId, o.CycleId, o.Repetition)).ToArrayAsync(ct);
            var due = ProgramEndingRules.Due(slots, kinds, DeliveryRules.LocalDate(now, a.TimeZone), DeliveryRules.LocalDate(a.CreatedAt, a.TimeZone));
            foreach (var kind in due)
            {
                await notifications.PublishAsync(new(a.CoachId, $"training-ending:{a.Id}:{kind}", ProgramEndingRules.NotificationType(kind), "Coaching", "Training", a.Id,
                    $"/app/clients/{a.RelationshipId}"), ct);
                sent++;
            }
        }
        return sent;
    }
}

public sealed class ProgramEndingAlertsWorker(IServiceScopeFactory scopes, ILogger<ProgramEndingAlertsWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<ProgramEndingAlertsJob>().RunAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "Program ending alerts will retry on the next run"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
