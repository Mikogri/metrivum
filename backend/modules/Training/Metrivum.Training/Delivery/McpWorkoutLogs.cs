using Microsoft.EntityFrameworkCore;
using Metrivum.Training.Contracts;

namespace Metrivum.Training.Delivery;

public sealed partial class TrainingDeliveryService
{
    public async Task<McpWorkoutLogPage> McpLogsAsync(Guid relationshipId, DateOnly from, DateOnly to, int page, int pageSize, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var result = await ScheduleAsync(from, to, relationshipId, null, page, pageSize, ct, view: "coach", status: "Completed", sort: "latest");
        var ids = result.Items.Select(x => x.Id).ToArray();
        // The authorized occurrence page limits the batched execution read to owned relationship data.
        var executions = await Executions.AsNoTracking().Include(x => x.Exercises).ThenInclude(x => x.Sets)
            .Where(x => ids.Contains(x.OccurrenceId)).ToDictionaryAsync(x => x.OccurrenceId, ct);
        return new(result.Items.Select(occurrence =>
        {
            var execution = executions.GetValueOrDefault(occurrence.Id);
            var dto = execution is null ? null : ExecutionDto(execution, false);
            return new McpWorkoutLog(occurrence.Id, relationshipId, occurrence.ProgramName, occurrence.ScheduledDate, occurrence.Status,
                dto?.PerformedDate, dto?.CompletedAt, dto?.Comment,
                dto?.Exercises.Select(e => new McpActualExercise(e.ExerciseId, e.Name, e.Comment,
                    e.Sets.Select(s => new McpActualSet(s.PrescribedSetId, s.PrescribedSegmentId, s.Skipped, s.Reps, s.Load,
                        s.LoadUnit, s.LoadMeaning.ToString(), s.Rpe, s.Rir, s.DurationSeconds, s.RestSeconds, s.DistanceMeters, s.Tempo, s.Comment)).ToArray())).ToArray() ?? []);
        }).ToArray(), page, pageSize, result.Total);
    }
}
