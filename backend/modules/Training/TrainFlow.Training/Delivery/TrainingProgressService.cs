using Microsoft.EntityFrameworkCore;
using TrainFlow.Training.Contracts;

namespace TrainFlow.Training.Delivery;

public sealed partial class TrainingDeliveryService
{
    public async Task<TrainingProgressDto> ReadAsync(TrainingProgressQuery request, CancellationToken ct)
    {
        Range(request.From, request.To);
        Guid[] ids;
        if (request.TeamId is { } teamId)
        {
            var actor = await accounts.RequireCoachAsync(ct);
            await access.RequireAsync("training.progress.view-clients", ct);
            if (teams is null)
                throw TrainFlow.BuildingBlocks.ApiException.NotFound();
            var team = await teams.RequireAsync(teamId, actor.UserId, request.MemberId != actor.UserId, ct);
            if (team.Role == "Member" && request.MemberId != actor.UserId)
                throw TrainFlow.BuildingBlocks.ApiException.NotFound();
            ids = (await relationships.GetForTeamAsync(teamId, request.MemberId, ct)).Select(x => x.Id).ToArray();
        }
        else
            ids = await VisibleAsync(request.RelationshipId, request.GroupId, ct, request.View);
        if (request.RelationshipIds != null)
            ids = ids.Intersect(request.RelationshipIds).ToArray();
        var now = clock.GetUtcNow();
        var assignments = Assignments.AsNoTracking().Where(a => ids.Contains(a.RelationshipId) && (request.ProgramId == null || a.ProgramId == request.ProgramId));
        var rows = from o in Occurrences.AsNoTracking()
                   join a in assignments on o.AssignmentId equals a.Id
                   where !o.Superseded && o.ScheduledDate >= request.From && o.ScheduledDate <= request.To
                   join e in Executions.AsNoTracking() on o.Id equals e.OccurrenceId into logs
                   from e in logs.DefaultIfEmpty()
                   select new
                   {
                       o.Id,
                       o.Deadline,
                       a.RelationshipId,
                       a.ProgramId,
                       a.ProgramName,
                       Status = (ExecutionStatus?)e.Status,
                       e.CompletedAt
                   };
        var totals = await rows.GroupBy(x => 1).Select(g => new
        {
            Planned = g.Count(),
            Due = g.Count(x => x.Deadline <= now),
            Completed = g.Count(x => x.Deadline <= now && x.Status == ExecutionStatus.Completed),
            Skipped = g.Count(x => x.Deadline <= now && x.Status == ExecutionStatus.Skipped),
            Missed = g.Count(x => x.Deadline <= now && x.Status == null),
            InProgress = g.Count(x => x.Status == ExecutionStatus.InProgress),
            Late = g.Count(x => x.Status == ExecutionStatus.Completed && x.CompletedAt >= x.Deadline)
        }).SingleOrDefaultAsync(ct);
        var programs = await rows.Where(x => x.Status == ExecutionStatus.Completed).GroupBy(x => new { x.ProgramId, x.ProgramName })
            .OrderBy(g => g.Key.ProgramName).Select(g => new TrainingProgramProgress(g.Key.ProgramId, g.Key.ProgramName, g.Count())).ToArrayAsync(ct);
        var clients = await rows.GroupBy(x => x.RelationshipId).OrderBy(g => g.Key).Take(200).Select(g => new TrainingClientProgress(g.Key,
            g.Count(x => x.Deadline <= now), g.Count(x => x.Deadline <= now && x.Status == ExecutionStatus.Completed),
            g.Count(x => x.Deadline <= now && x.Status == null), g.Where(x => x.Status == ExecutionStatus.Completed).Max(x => x.CompletedAt)))
            .ToArrayAsync(ct);
        var actual = from s in db.Set<SetExecution>().AsNoTracking()
                     join ex in db.Set<ExerciseExecution>() on s.ExerciseExecutionId equals ex.Id
                     join e in Executions on ex.ExecutionId equals e.Id
                     join o in Occurrences on e.OccurrenceId equals o.Id
                     join a in assignments on o.AssignmentId equals a.Id
                     where e.Status == ExecutionStatus.Completed && !s.Skipped && e.PerformedDate >= request.From && e.PerformedDate <= request.To
                       && (request.ExerciseId == null || ex.ExerciseId == request.ExerciseId)
                       && (s.Reps > 0 || s.DurationSeconds > 0 || s.DistanceMeters > 0)
                     select new
                     {
                         s,
                         ex.ExerciseId,
                         ex.Name,
                         ex.PrescribedInstanceId,
                         ex.IsSubstitution,
                         e.PerformedDate
                     };
        var values = await actual.GroupBy(x => 1).Select(g => new { Sets = g.Count(), Reps = g.Sum(x => x.s.Reps ?? 0), Volume = g.Sum(x => x.s.VolumeKg), HasVolume = g.Any(x => x.s.VolumeKg != null) }).SingleOrDefaultAsync(ct);
        var performance = await actual.GroupBy(x => new { x.ExerciseId, x.PerformedDate, x.s.LoadMeaning })
            .OrderByDescending(g => g.Key.PerformedDate).ThenBy(g => g.Key.ExerciseId).Take(1000)
            .Select(g => new TrainingPerformancePoint(g.Key.ExerciseId, g.Max(x => x.Name)!, g.Key.PerformedDate, g.Key.LoadMeaning.ToString(), g.Count(),
                g.Sum(x => x.s.Reps ?? 0), g.Any(x => x.s.VolumeKg != null) ? g.Sum(x => x.s.VolumeKg) : null,
                g.Max(x => x.s.LoadUnit == "kg" ? x.s.Load : x.s.LoadUnit == "lb" ? x.s.Load * 0.45359237m : null),
                g.Average(x => x.s.Rpe), g.Average(x => x.s.Rir), g.Count(x => x.IsSubstitution)))
            .ToArrayAsync(ct);
        return new(request.From, request.To, totals?.Planned ?? 0, totals?.Due ?? 0, totals?.Completed ?? 0, totals?.Skipped ?? 0, totals?.Missed ?? 0,
            totals?.InProgress ?? 0, totals?.Due > 0 ? decimal.Round(100m * totals.Completed / totals.Due, 2) : null, totals?.Late ?? 0,
            await assignments.CountAsync(x => x.Status == AssignmentStatus.Active, ct), values?.Sets ?? 0, values?.Reps ?? 0, values?.HasVolume == true ? values.Volume : null,
            programs, clients, performance,
            "Completion = completed due occurrences / due occurrences. Due means schedule-zone midnight after planned date has passed; missed means not logged by deadline. In-progress is reported separately. Planned-date attendance and performed-date performance use the requested inclusive dates. Volume is kg * reps for explicitly TotalExternal loads only; per-hand, bodyweight, assisted and missing loads are excluded. Best load is maximum recorded external load, not an estimated 1RM. Performance is limited to the latest 1000 exercise/date/meaning groups; filter exercise for detail.");
    }
}
