using Microsoft.EntityFrameworkCore;
using TrainFlow.Coaching.Contracts;

namespace TrainFlow.Training.Delivery;

public sealed record ActivityProgramOption(Guid Id, string Name);
public sealed record ActivityStructureOption(Guid BlockId, Guid CycleId, DateOnly FirstDate, DateOnly LastDate);
public sealed record ActivityOptionsDto(ActivityProgramOption[] Programs, ActivityStructureOption[] Structure, DateOnly? EarliestDate);
public sealed record AssignmentSummaryDto(AssignmentDto Assignment, DateOnly? EndDate, int Scheduled, int Completed, Guid? CurrentBlockId, Guid? CurrentCycleId);
public sealed record LastTrainingActivityDto(DateOnly? PerformedDate, DateTimeOffset? CompletedAt);

public sealed partial class TrainingDeliveryService
{
    public async Task<LastTrainingActivityDto> LastActivityAsync(Guid relationshipId, CancellationToken ct)
    {
        var ids = await VisibleAsync(relationshipId, null, ct);
        return await (from e in Executions.AsNoTracking()
            join o in Occurrences on e.OccurrenceId equals o.Id
            join a in Assignments on o.AssignmentId equals a.Id
            where ids.Contains(a.RelationshipId) && e.Status == ExecutionStatus.Completed
            orderby e.PerformedDate descending, e.CompletedAt descending
            select new LastTrainingActivityDto(e.PerformedDate, e.CompletedAt)).FirstOrDefaultAsync(ct) ?? new(null, null);
    }
    public async Task<ActivityOptionsDto> ActivityOptionsAsync(Guid relationshipId, Guid? programId, CancellationToken ct)
    {
        var ids = await VisibleAsync(relationshipId, null, ct);
        var assignments = Assignments.AsNoTracking().Where(a => ids.Contains(a.RelationshipId));
        var programs = await assignments.GroupBy(a => a.ProgramId).Select(g => new { Id = g.Key, Name = g.Max(a => a.ProgramName)! }).OrderBy(a => a.Name).Select(a => new ActivityProgramOption(a.Id, a.Name)).ToArrayAsync(ct);
        var structure = programId == null ? [] : await (from o in Occurrences.AsNoTracking()
            join a in assignments on o.AssignmentId equals a.Id
            where !o.Superseded && a.ProgramId == programId
            group o by new { o.BlockId, o.CycleId } into g
            orderby g.Min(o => o.ScheduledDate)
            select new ActivityStructureOption(g.Key.BlockId, g.Key.CycleId, g.Min(o => o.ScheduledDate), g.Max(o => o.ScheduledDate))).ToArrayAsync(ct);
        return new(programs, structure, await assignments.MinAsync(a => (DateOnly?)a.StartDate, ct));
    }

    public async Task<AssignmentSummaryDto[]> AssignmentSummaryAsync(Guid relationshipId, CancellationToken ct)
    {
        var ids = await VisibleAsync(relationshipId, null, ct);
        var assignments = await Assignments.AsNoTracking().Where(a => ids.Contains(a.RelationshipId) && a.Status == AssignmentStatus.Active).OrderBy(a => a.StartDate).ToArrayAsync(ct);
        var assignmentIds = assignments.Select(a => a.Id).ToArray();
        var stats = await (from o in Occurrences.AsNoTracking()
            where assignmentIds.Contains(o.AssignmentId) && !o.Superseded
            join e in Executions.AsNoTracking() on o.Id equals e.OccurrenceId into logs
            from e in logs.DefaultIfEmpty()
            group new { o, e } by o.AssignmentId into g
            select new { Id = g.Key, End = g.Max(x => x.o.ScheduledDate), Scheduled = g.Count(), Completed = g.Count(x => x.e != null && x.e.Status == ExecutionStatus.Completed) }).ToDictionaryAsync(x => x.Id, ct);
        var active = (await relationships.GetAsync(relationshipId, ct))?.Status == RelationshipStatus.Active;
        return assignments.Select(a => new AssignmentSummaryDto(Dto(a, a.CoachId == accounts.UserId, active), stats.TryGetValue(a.Id, out var s) ? s.End : null,
            s?.Scheduled ?? 0, s?.Completed ?? 0, null, null)).ToArray();
    }
}
