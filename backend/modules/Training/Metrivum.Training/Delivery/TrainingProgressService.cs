using Metrivum.Training.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Training.Delivery;

/// <summary>Manages assignments, frozen workout prescriptions, executions and progress in the Training database.</summary>
public sealed partial class TrainingDeliveryService
{
    public async Task<TrainingProgressDto> ReadAsync(
        TrainingProgressQuery request,
        CancellationToken ct
    )
    {
        Range(request.From, request.To, 36600);
        if (request.Repetitions is < 1 or > 1000)
            throw Metrivum.BuildingBlocks.ApiException.Invalid(
                "Repetitions must be between 1 and 1000."
            );
        Guid[] ids;
        if (request.TeamId is { } teamId)
        {
            var actor = await accounts.RequireCoachAsync(ct);
            await access.RequireAsync("training.progress.view-clients", ct);
            if (teams is null)
                throw Metrivum.BuildingBlocks.ApiException.NotFound();
            var team = await teams.RequireAsync(
                teamId,
                actor.UserId,
                request.MemberId != actor.UserId,
                ct
            );
            if (team.Role == "Member" && request.MemberId != actor.UserId)
                throw Metrivum.BuildingBlocks.ApiException.NotFound();
            ids = (await relationships.GetForTeamAsync(teamId, request.MemberId, ct))
                .Select(x => x.Id)
                .ToArray();
        }
        else
            ids = await VisibleAsync(request.RelationshipId, request.GroupId, ct, request.View);
        if (request.RelationshipIds != null)
            ids = ids.Intersect(request.RelationshipIds).ToArray();
        var now = clock.GetUtcNow();
        var assignments = Assignments
            .AsNoTracking()
            .Where(a =>
                ids.Contains(a.RelationshipId)
                && (request.ProgramId == null || a.ProgramId == request.ProgramId)
            );
        var rows =
            from o in Occurrences.AsNoTracking()
            join a in assignments on o.AssignmentId equals a.Id
            where
                !o.Superseded
                && o.ScheduledDate >= request.From
                && o.ScheduledDate <= request.To
                && (request.BlockId == null || o.BlockId == request.BlockId)
                && (request.CycleId == null || o.CycleId == request.CycleId)
            join e in Executions.AsNoTracking() on o.Id equals e.OccurrenceId into logs
            from e in logs.DefaultIfEmpty()
            select new
            {
                o.Id,
                o.Deadline,
                o.ScheduledDate,
                a.RelationshipId,
                a.ProgramId,
                a.ProgramName,
                Status = (ExecutionStatus?)e.Status,
                e.CompletedAt,
            };
        var totals = await rows.GroupBy(x => 1)
            .Select(g => new
            {
                Planned = g.Count(),
                Due = g.Count(x => x.Deadline <= now),
                Completed = g.Count(x =>
                    x.Deadline <= now && x.Status == ExecutionStatus.Completed
                ),
                Skipped = g.Count(x => x.Deadline <= now && x.Status == ExecutionStatus.Skipped),
                Missed = g.Count(x => x.Deadline <= now && x.Status == null),
                InProgress = g.Count(x => x.Status == ExecutionStatus.InProgress),
                Late = g.Count(x =>
                    x.Status == ExecutionStatus.Completed && x.CompletedAt >= x.Deadline
                ),
            })
            .SingleOrDefaultAsync(ct);
        var programs = await rows.Where(x => x.Status == ExecutionStatus.Completed)
            .GroupBy(x => new { x.ProgramId, x.ProgramName })
            .OrderBy(g => g.Key.ProgramName)
            .Select(g => new TrainingProgramProgress(g.Key.ProgramId, g.Key.ProgramName, g.Count()))
            .ToArrayAsync(ct);
        var clients = await rows.GroupBy(x => x.RelationshipId)
            .OrderBy(g => g.Key)
            .Take(201)
            .Select(g => new TrainingClientProgress(
                g.Key,
                g.Count(x => x.Deadline <= now),
                g.Count(x => x.Deadline <= now && x.Status == ExecutionStatus.Completed),
                g.Count(x => x.Deadline <= now && x.Status == null),
                g.Where(x => x.Status == ExecutionStatus.Completed).Max(x => x.CompletedAt)
            ))
            .ToArrayAsync(ct);
        var actual =
            from s in db.Set<SetExecution>().AsNoTracking()
            join ex in db.Set<ExerciseExecution>() on s.ExerciseExecutionId equals ex.Id
            join e in Executions on ex.ExecutionId equals e.Id
            join o in Occurrences on e.OccurrenceId equals o.Id
            join a in assignments on o.AssignmentId equals a.Id
            where
                e.Status == ExecutionStatus.Completed
                && !s.Skipped
                && e.PerformedDate >= request.From
                && e.PerformedDate <= request.To
                && (request.BlockId == null || o.BlockId == request.BlockId)
                && (request.CycleId == null || o.CycleId == request.CycleId)
                && (request.ExerciseId == null || ex.ExerciseId == request.ExerciseId)
                && (request.Repetitions == null || s.Reps == request.Repetitions)
                && (s.Reps > 0 || s.DurationSeconds > 0 || s.DistanceMeters > 0)
            select new
            {
                s,
                ex.ExerciseId,
                ex.Name,
                ex.PrescribedInstanceId,
                ex.IsSubstitution,
                e.PerformedDate,
                e.OccurrenceId,
            };
        var values = await actual
            .GroupBy(x => 1)
            .Select(g => new
            {
                Sets = g.Count(),
                Reps = g.Sum(x => x.s.Reps ?? 0),
                Volume = g.Sum(x => x.s.VolumeKg),
                HasVolume = g.Any(x => x.s.VolumeKg != null),
            })
            .SingleOrDefaultAsync(ct);
        var performance = await actual
            .GroupBy(x => new
            {
                x.ExerciseId,
                x.PerformedDate,
                x.s.LoadMeaning,
            })
            .OrderByDescending(g => g.Key.PerformedDate)
            .ThenBy(g => g.Key.ExerciseId)
            .ThenBy(g => g.Key.LoadMeaning)
            .Take(1001)
            .Select(g => new TrainingPerformancePoint(
                g.Key.ExerciseId,
                g.Max(x => x.Name)!,
                g.Key.PerformedDate,
                g.Key.LoadMeaning.ToString(),
                g.Count(),
                g.Sum(x => x.s.Reps ?? 0),
                g.Any(x => x.s.VolumeKg != null) ? g.Sum(x => x.s.VolumeKg) : null,
                g.Max(x =>
                    x.s.LoadMeaning == LoadMeaning.TotalExternal
                    || x.s.LoadMeaning == LoadMeaning.PerHand
                        ? x.s.LoadUnit == "kg"
                            ? x.s.Load
                            : x.s.LoadUnit == "lb"
                                ? x.s.Load * 0.45359237m
                                : null
                        : null
                ),
                g.Average(x => x.s.Rpe),
                g.Average(x => x.s.Rir),
                g.Count(x => x.IsSubstitution),
                g.OrderBy(x => x.OccurrenceId).Select(x => (Guid?)x.OccurrenceId).FirstOrDefault()
            ))
            .ToArrayAsync(ct);
        var duration = await (
            from e in Executions.AsNoTracking()
            join o in Occurrences on e.OccurrenceId equals o.Id
            join a in assignments on o.AssignmentId equals a.Id
            where
                e.Status == ExecutionStatus.Completed
                && e.PerformedDate >= request.From
                && e.PerformedDate <= request.To
                && (request.BlockId == null || o.BlockId == request.BlockId)
                && (request.CycleId == null || o.CycleId == request.CycleId)
            group e by 1 into g
            select new
            {
                Count = g.Count(),
                Recorded = g.Count(e => e.DurationSeconds != null),
                Total = g.Sum(e => (long?)e.DurationSeconds),
                Average = g.Average(e => (double?)e.DurationSeconds),
            }
        ).SingleOrDefaultAsync(ct);
        var days = await rows.GroupBy(x => x.ScheduledDate)
            .Select(g => new
            {
                Date = g.Key,
                Scheduled = g.Count(),
                Completed = g.Count(x => x.Status == ExecutionStatus.Completed),
                Due = g.Count(x => x.Deadline <= now),
                CompletedDue = g.Count(x =>
                    x.Deadline <= now && x.Status == ExecutionStatus.Completed
                ),
            })
            .ToArrayAsync(ct);
        var feedback = await (
            from e in Executions.AsNoTracking()
            join o in Occurrences on e.OccurrenceId equals o.Id
            join a in assignments on o.AssignmentId equals a.Id
            where
                e.Status == ExecutionStatus.Completed
                && e.Feedback != null
                && e.PerformedDate >= request.From
                && e.PerformedDate <= request.To
                && (request.BlockId == null || o.BlockId == request.BlockId)
                && (request.CycleId == null || o.CycleId == request.CycleId)
            orderby e.PerformedDate descending, e.Id descending
            select new
            {
                e.OccurrenceId,
                e.PerformedDate,
                e.Feedback,
            }
        )
            .Take(1001)
            .ToArrayAsync(ct);
        var weeks = days.GroupBy(x => x.Date.AddDays(-((int)x.Date.DayOfWeek + 6) % 7))
            .OrderBy(g => g.Key)
            .Select(g => new TrainingWeekProgress(
                g.Key,
                g.Sum(x => x.Scheduled),
                g.Sum(x => x.Completed),
                g.Sum(x => x.Due),
                g.Sum(x => x.CompletedDue),
                g.Sum(x => x.Due) > 0
                    ? decimal.Round(100m * g.Sum(x => x.CompletedDue) / g.Sum(x => x.Due), 2)
                    : null
            ))
            .ToArray();
        return new(
            request.From,
            request.To,
            totals?.Planned ?? 0,
            totals?.Due ?? 0,
            totals?.Completed ?? 0,
            totals?.Skipped ?? 0,
            totals?.Missed ?? 0,
            totals?.InProgress ?? 0,
            totals?.Due > 0 ? decimal.Round(100m * totals.Completed / totals.Due, 2) : null,
            totals?.Late ?? 0,
            await assignments.CountAsync(x => x.Status == AssignmentStatus.Active, ct),
            values?.Sets ?? 0,
            values?.Reps ?? 0,
            values?.HasVolume == true ? values.Volume : null,
            programs,
            clients.Take(200).ToArray(),
            performance.Take(1000).ToArray(),
            "Completion = completed due occurrences / due occurrences. Future sessions never lower completion. Due means schedule-zone midnight after planned date has passed; missed means not logged by deadline. In-progress is reported separately. Superseded (cancelled or replaced future) occurrences are excluded. Planned-date attendance and performed-date performance use the requested inclusive dates. Volume is kg * reps for explicitly TotalExternal loads only; per-hand, bodyweight, assisted and missing loads are excluded. Best load is maximum recorded external load, not an estimated 1RM. Duration includes recorded completed sessions only; frequency uses completed executions per seven calendar days. Performance is limited to the latest 1000 exercise/date/meaning groups; filter exercise for detail.",
            duration?.Recorded > 0 ? duration.Total : null,
            duration?.Average,
            duration == null
                ? null
                : decimal.Round(
                    7m * duration.Count / (request.To.DayNumber - request.From.DayNumber + 1),
                    2
                ),
            weeks,
            ClientsHasMore: clients.Length > 200,
            PerformanceHasMore: performance.Length > 1000,
            Feedback: feedback
                .Take(1000)
                .OrderBy(x => x.PerformedDate)
                .Select(x => new TrainingFeedbackPoint(
                    x.OccurrenceId,
                    x.PerformedDate,
                    x.Feedback!.Rating,
                    x.Feedback.SessionRpe,
                    x.Feedback.Wellbeing,
                    x.Feedback.SleepQuality
                ))
                .ToArray(),
            FeedbackHasMore: feedback.Length > 1000
        );
    }
}
