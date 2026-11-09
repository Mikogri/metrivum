using Microsoft.EntityFrameworkCore;
using Metrivum.Training.Contracts;
using Metrivum.Training.Domain;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Delivery;

/// <summary>Reads effective assigned program cycles for other modules without exposing the Training DbContext.</summary>
public sealed class AssignedProgramCyclesReader(TrainingDbContext db) : IAssignedProgramCycles
{
    public async Task<AssignedProgramCycles?> GetAsync(Guid coachId, Guid assignmentId, CancellationToken ct)
    {
        // Training edits and cancellation use this same assignment lock.
        if (db.Database.CurrentTransaction != null)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({assignmentId.ToString()}, 507))", ct);
        var assignment = await db.Set<ProgramAssignment>().AsNoTracking().SingleOrDefaultAsync(a => a.Id == assignmentId && a.CoachId == coachId, ct);
        return assignment == null ? null : await ReadAsync(assignment, ct);
    }

    public async Task<IReadOnlyList<AssignedProgramCycles>> ListAsync(Guid coachId, Guid relationshipId, CancellationToken ct)
    {
        var assignments = await db.Set<ProgramAssignment>().AsNoTracking().Where(a => a.CoachId == coachId && a.RelationshipId == relationshipId && a.Status == AssignmentStatus.Active).OrderBy(a => a.StartDate).ThenBy(a => a.Id).ToArrayAsync(ct);
        var result = new List<AssignedProgramCycles>();
        foreach (var assignment in assignments) result.Add(await ReadAsync(assignment, ct));
        return result;
    }

    private async Task<AssignedProgramCycles> ReadAsync(ProgramAssignment assignment, CancellationToken ct)
    {
        var revision = await db.Set<TrainingRevision>().AsNoTracking().SingleAsync(r => r.Id == assignment.EffectiveRevisionId, ct);
        return Describe(assignment, revision);
    }

    internal static AssignedProgramCycles Describe(ProgramAssignment assignment, TrainingRevision revision)
    {
        var start = assignment.StartDate;
        var cycles = new List<AssignedProgramCycle>();
        var document = revision.Snapshot.Document;
        foreach (var cycle in document.Blocks.SelectMany(b => b.Cycles))
            for (var run = 0; run < DocumentRules.RunsOf(document, cycle); run++)
            {
                cycles.Add(new(cycle.Id, start, cycle.DayCount));
                start = start.AddDays(cycle.DayCount);
            }
        return new(assignment.Id, assignment.RelationshipId, assignment.ProgramName, assignment.TimeZone, assignment.Status == AssignmentStatus.Active, cycles, assignment.Status is AssignmentStatus.Completed or AssignmentStatus.Cancelled);
    }
}
