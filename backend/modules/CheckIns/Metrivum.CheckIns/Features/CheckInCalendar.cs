using System.Text.Json;
using Metrivum.BuildingBlocks;
using Metrivum.CheckIns.Domain;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.CheckIns.Features;

public sealed record CheckInCalendarItem(
    string Id,
    string Kind,
    Guid ScheduleId,
    Guid? RequestId,
    string Name,
    DateTimeOffset AvailableAtUtc,
    DateTimeOffset DueAtUtc,
    string Status
);

/// <summary>Manages check-in schedules, assignments and issued requests in the CheckIns database.</summary>
public sealed partial class CheckInsService
{
    public async Task<CheckInPage<CheckInCalendarItem>> CalendarAsync(
        string role,
        string kind,
        DateTimeOffset from,
        DateTimeOffset to,
        int page,
        int size,
        CancellationToken ct
    )
    {
        CheckInRules.Pagination(page, size);
        if (from >= to || to - from > TimeSpan.FromDays(370) || from.Year < 2000 || to.Year > 2101)
            throw ApiException.Invalid("Use a range of up to 370 days in years 2000–2100.");
        if (kind == "Request")
        {
            var requests = await RequestsAsync(
                page,
                size,
                null,
                "due",
                null,
                null,
                null,
                role,
                ct,
                from,
                to
            );
            return new(
                requests
                    .Items.Select(r => new CheckInCalendarItem(
                        r.Id.ToString(),
                        "Request",
                        r.ScheduleId,
                        r.Id,
                        r.ScheduleName,
                        r.AvailableAtUtc,
                        r.DueAtUtc,
                        r.Status.ToString()
                    ))
                    .ToArray(),
                page,
                size,
                requests.Total
            );
        }
        if (kind != "Planned" || role != "coach")
            throw ApiException.Invalid(
                "Planned occurrences are available only in the coach workspace."
            );
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        var rows = new List<CheckInCalendarItem>();
        long total = 0;
        var skip = (page - 1L) * size;
        // Stable schedule/date order lets large ranges paginate without retaining every occurrence.
        await foreach (
            var s in db
                .Schedules.AsNoTracking()
                .Where(s =>
                    s.CoachId == owner.UserId
                    && s.WorkspaceId == owner.WorkspaceId
                    && s.Status == ScheduleStatus.Active
                )
                .OrderBy(s => s.Id)
                .AsAsyncEnumerable()
                .WithCancellation(ct)
        )
        {
            if (s.NextAvailableAtUtc == null)
                continue;
            var recurrence = JsonSerializer.Deserialize<Recurrence>(s.RecurrenceJson)!;
            var assignment =
                recurrence.Kind == RecurrenceKind.AssignedProgramCycle && assignedPrograms != null
                    ? await assignedPrograms.GetAsync(s.CoachId, recurrence.AssignmentId!.Value, ct)
                    : null;
            var after = from.AddHours(-s.ResponseWindowHours);
            if (after < clock.GetUtcNow())
                after = clock.GetUtcNow();
            if (after < s.NextAvailableAtUtc.Value)
                after = s.NextAvailableAtUtc.Value.AddTicks(-1);
            for (
                var next = Next(recurrence, s.TimeZone, assignment, after);
                next != null && next < to;
                next = Next(recurrence, s.TimeZone, assignment, next)
            )
            {
                ct.ThrowIfCancellationRequested();
                var due = next.Value.AddHours(s.ResponseWindowHours);
                if (due <= from)
                    continue;
                if (total >= skip && rows.Count < size)
                    rows.Add(
                        new(
                            $"{s.Id}:{next.Value:O}",
                            "Planned",
                            s.Id,
                            null,
                            s.Name,
                            next.Value,
                            due,
                            "Planned"
                        )
                    );
                total++;
            }
        }
        return new(rows, page, size, total);
    }
}
