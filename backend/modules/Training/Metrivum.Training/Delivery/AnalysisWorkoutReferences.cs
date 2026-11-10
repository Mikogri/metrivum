using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Training.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Training.Delivery;

/// <summary>Logged sets a coach (or client) can attach a video analysis to, newest workout first.</summary>
public sealed record AnalysisSetOptionsDto(AnalysisWorkoutOptionDto[] Workouts);

public sealed record AnalysisWorkoutOptionDto(
    Guid ExecutionId,
    Guid RelationshipId,
    Guid ClientId,
    string ClientName,
    DateOnly PerformedDate,
    string WorkoutName,
    string Status,
    AnalysisExerciseOptionDto[] Exercises
);

public sealed record AnalysisExerciseOptionDto(Guid Id, string Name, AnalysisSetOptionDto[] Sets);

public sealed record AnalysisSetOptionDto(
    Guid Id,
    int Number,
    bool Skipped,
    int? Reps,
    decimal? Load,
    string? LoadUnit,
    decimal? Rpe
);

/// <summary>Manages assignments, frozen workout prescriptions, executions and progress in the Training database.</summary>
public sealed partial class TrainingDeliveryService : IAnalysisWorkoutReferences
{
    public async Task RequireOwnedAsync(
        Guid userId,
        Guid executionId,
        Guid? setId,
        CancellationToken ct
    )
    {
        if (userId != accounts.UserId)
            throw ApiException.NotFound();
        var row =
            await (
                from execution in Executions
                join occurrence in Occurrences on execution.OccurrenceId equals occurrence.Id
                join assignment in Assignments on occurrence.AssignmentId equals assignment.Id
                where execution.Id == executionId && assignment.ClientId == userId
                select new { assignment.Id }
            ).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        await AssignmentAsync(row.Id, RelationshipOperation.HistoricalSharedRead, ct);
        if (
            setId.HasValue
            && !await db.Set<ExerciseExecution>()
                .AnyAsync(x => x.ExecutionId == executionId && x.Sets.Any(s => s.Id == setId), ct)
        )
            throw ApiException.NotFound();
    }

    public async Task<AnalysisSetReference> RequireLinkableAsync(
        Guid executionId,
        Guid? setId,
        CancellationToken ct
    )
    {
        var row = await ReferenceRowAsync(executionId, ct) ?? throw ApiException.NotFound();
        // Coach or client of the assignment, with read access to its history (checked against the relationship).
        var assignment = await AssignmentAsync(
            row.AssignmentId,
            RelationshipOperation.HistoricalSharedRead,
            ct
        );
        return await DescribeRowAsync(row, assignment, setId, ct) ?? throw ApiException.NotFound();
    }

    public async Task<AnalysisSetReference?> DescribeAsync(
        Guid executionId,
        Guid? setId,
        CancellationToken ct
    )
    {
        var row = await ReferenceRowAsync(executionId, ct);
        if (row == null)
            return null;
        try
        {
            var assignment = await AssignmentAsync(
                row.AssignmentId,
                RelationshipOperation.HistoricalSharedRead,
                ct
            );
            return await DescribeRowAsync(row, assignment, setId, ct);
        }
        catch (ApiException)
        {
            // The relationship ended or access changed: the link stays stored but is not shown.
            return null;
        }
    }

    public async Task<Guid[]> ClientExecutionsAsync(Guid? executionId, CancellationToken ct)
    {
        var me = accounts.UserId;
        var rows = await (
            from execution in Executions
            join occurrence in Occurrences on execution.OccurrenceId equals occurrence.Id
            join assignment in Assignments on occurrence.AssignmentId equals assignment.Id
            where
                assignment.ClientId == me
                && execution.Status != ExecutionStatus.Skipped
                && (executionId == null || execution.Id == executionId)
            orderby execution.PerformedDate descending, execution.StartedAt descending
            select new { execution.Id, assignment.RelationshipId }
        )
            .Take(1000)
            .ToArrayAsync(ct);
        if (rows.Length == 0)
            return [];
        await access.RequireAsync("training.progress.view-own", ct);
        var decisions = await DecisionsAsync(
            rows.Select(x => x.RelationshipId).Distinct().ToArray(),
            RelationshipOperation.HistoricalSharedRead,
            ct
        );
        return rows.Where(x =>
                decisions.TryGetValue(x.RelationshipId, out var decision) && decision.Allowed
            )
            .Select(x => x.Id)
            .ToArray();
    }

    /// <summary>Recent logged workouts of the coach's clients (or the client's own), with their sets.</summary>
    public async Task<AnalysisSetOptionsDto> AnalysisSetOptionsAsync(
        Guid? relationshipId,
        int days,
        CancellationToken ct,
        bool includeSets = true,
        Guid? executionId = null
    )
    {
        if (days is < 1 or > 365)
            throw ApiException.Invalid("Choose between 1 and 365 days.");
        var me = accounts.UserId;
        var since = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(-days);
        var rows = await (
            from execution in Executions
            join occurrence in Occurrences on execution.OccurrenceId equals occurrence.Id
            join assignment in Assignments on occurrence.AssignmentId equals assignment.Id
            where
                (assignment.CoachId == me || assignment.ClientId == me)
                && (relationshipId == null || assignment.RelationshipId == relationshipId)
                && (executionId == null || execution.Id == executionId)
                && execution.Status != ExecutionStatus.Skipped
                && execution.PerformedDate >= since
            orderby execution.PerformedDate descending, execution.StartedAt descending
            select new
            {
                execution.Id,
                execution.PerformedDate,
                execution.Status,
                occurrence.Name,
                assignment.RelationshipId,
                assignment.ClientId,
                assignment.CoachId,
            }
        )
            .Take(40)
            .ToArrayAsync(ct);
        if (rows.Length == 0)
            return new([]);
        var coaching = rows.Any(x => x.CoachId == me);
        await access.RequireAsync(
            coaching ? "training.progress.view-clients" : "training.progress.view-own",
            ct
        );
        var decisions = await DecisionsAsync(
            rows.Select(x => x.RelationshipId).Distinct().ToArray(),
            RelationshipOperation.HistoricalSharedRead,
            ct
        );
        rows = rows.Where(x =>
                decisions.TryGetValue(x.RelationshipId, out var decision) && decision.Allowed
            )
            .ToArray();
        var ids = rows.Select(x => x.Id).ToArray();
        var exercises = includeSets
            ? await db.Set<ExerciseExecution>()
                .AsNoTracking()
                .Where(x => ids.Contains(x.ExecutionId))
                .OrderBy(x => x.Position)
                .Select(x => new
                {
                    x.ExecutionId,
                    Exercise = new AnalysisExerciseOptionDto(
                        x.Id,
                        x.Name,
                        x.Sets.OrderBy(s => s.Position)
                            .Select(s => new AnalysisSetOptionDto(
                                s.Id,
                                s.Position + 1,
                                s.Skipped,
                                s.Reps,
                                s.Load,
                                s.LoadUnit,
                                s.Rpe
                            ))
                            .ToArray()
                    ),
                })
                .ToArrayAsync(ct)
            : [];
        var byExecution = exercises.ToLookup(x => x.ExecutionId, x => x.Exercise);
        var people = await directory.GetAccountsAsync(
            rows.Select(x => x.ClientId).Distinct().ToArray(),
            ct
        );
        return new(
            rows.Select(row => new AnalysisWorkoutOptionDto(
                    row.Id,
                    row.RelationshipId,
                    row.ClientId,
                    people.TryGetValue(row.ClientId, out var person)
                        ? person.DisplayName
                        : "Client",
                    row.PerformedDate,
                    row.Name,
                    row.Status.ToString(),
                    byExecution[row.Id].ToArray()
                ))
                .ToArray()
        );
    }

    private sealed record ReferenceRow(
        Guid ExecutionId,
        Guid AssignmentId,
        DateOnly PerformedDate,
        string WorkoutName
    );

    private Task<ReferenceRow?> ReferenceRowAsync(Guid executionId, CancellationToken ct) =>
        (
            from execution in Executions
            join occurrence in Occurrences on execution.OccurrenceId equals occurrence.Id
            where execution.Id == executionId
            select new ReferenceRow(
                execution.Id,
                occurrence.AssignmentId,
                execution.PerformedDate,
                occurrence.Name
            )
        ).SingleOrDefaultAsync(ct);

    private async Task<AnalysisSetReference?> DescribeRowAsync(
        ReferenceRow row,
        ProgramAssignment assignment,
        Guid? setId,
        CancellationToken ct
    )
    {
        string? exercise = null;
        SetExecution? set = null;
        if (setId is { } id)
        {
            var match = await db.Set<ExerciseExecution>()
                .AsNoTracking()
                .Include(x => x.Sets)
                .Where(x => x.ExecutionId == row.ExecutionId && x.Sets.Any(s => s.Id == id))
                .SingleOrDefaultAsync(ct);
            if (match == null)
                return null;
            exercise = match.Name;
            set = match.Sets.Single(s => s.Id == id);
        }
        var people = await directory.GetAccountsAsync([assignment.ClientId], ct);
        return new AnalysisSetReference(
            row.ExecutionId,
            setId,
            assignment.RelationshipId,
            assignment.ClientId,
            people.TryGetValue(assignment.ClientId, out var person) ? person.DisplayName : "Client",
            row.PerformedDate,
            row.WorkoutName,
            exercise,
            set == null ? null : set.Position + 1,
            set?.Reps,
            set?.Load,
            set?.LoadUnit
        );
    }
}
