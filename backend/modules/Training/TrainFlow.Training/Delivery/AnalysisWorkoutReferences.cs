using Microsoft.EntityFrameworkCore;
using TrainFlow.BuildingBlocks;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Training.Contracts;

namespace TrainFlow.Training.Delivery;

public sealed partial class TrainingDeliveryService : IAnalysisWorkoutReferences
{
    public async Task RequireOwnedAsync(Guid userId, Guid executionId, Guid? setId, CancellationToken ct)
    {
        if (userId != accounts.UserId) throw ApiException.NotFound();
        var row = await (from execution in Executions
                         join occurrence in Occurrences on execution.OccurrenceId equals occurrence.Id
                         join assignment in Assignments on occurrence.AssignmentId equals assignment.Id
                         where execution.Id == executionId && assignment.ClientId == userId
                         select new { assignment.Id }).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        await AssignmentAsync(row.Id, RelationshipOperation.HistoricalSharedRead, ct);
        if (setId.HasValue && !await db.Set<ExerciseExecution>().AnyAsync(x => x.ExecutionId == executionId && x.Sets.Any(s => s.Id == setId), ct))
            throw ApiException.NotFound();
    }
}
