using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Contracts;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;

namespace Metrivum.Training.Features;

public sealed class McpTrainingOperations(TrainingService programs, TrainingDeliveryService delivery, IAccountContext accounts) : IMcpTrainingOperations
{
    public async Task<McpProgramPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var result = await programs.ListAsync(new() { Page = page, PageSize = pageSize, Search = search, Kind = DocumentKind.Program }, ct);
        return new(result.Items.Select(x => new McpProgramSummary(x.Id, x.Name, x.Description, x.Version, x.UpdatedAt)).ToArray(), page, pageSize, result.Total);
    }
    public async Task<McpProgram> GetAsync(Guid programId, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var plan = await programs.GetAsync(programId, ct);
        if (plan.Kind != DocumentKind.Program) throw ApiException.NotFound();
        return Map(plan);
    }
    public async Task<McpProgram> CreateAsync(McpProgramDraft draft, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        return Map(await programs.CreateAsync(new(draft.Name, draft.Description, DocumentKind.Program, draft.FolderId, Domain(draft.Document)), ct))
            with { Validation = new(true, [], []), ChangedPaths = ["document"] };
    }
    public async Task<McpProgramRevision> RevisionAsync(Guid programId, int number, CancellationToken ct)
    {
        await GetAsync(programId, ct);
        var result = await programs.RevisionAsync(programId, number, ct);
        return new(result.Id, result.Number, result.DraftVersion, result.PublishedAt, result.Snapshot.Name, result.Snapshot.Description,
            TrainingJson.Deserialize<McpTrainingDocument>(TrainingJson.Serialize(result.Snapshot.Document)));
    }
    public async Task<McpClientProgramPage> ClientProgramsAsync(Guid relationshipId, int page, int pageSize, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var result = await delivery.ListAsync(relationshipId, null, null, page, pageSize, ct, view: "coach");
        return new(result.Items.Select(x => new McpClientProgram(x.Id, x.ProgramId, x.ProgramName, x.EffectiveRevisionId,
            x.StartDate, x.TimeZone, x.Status.ToString(), x.Version)).ToArray(), page, pageSize, result.Total);
    }
    public async Task<McpProgram> ApplyDraftAsync(Guid programId, long expectedRevision, McpProgramDraft draft, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var existing = await programs.GetAsync(programId, ct);
        if (existing.Kind != DocumentKind.Program) throw ApiException.Invalid("Only program drafts can be edited by this tool.");
        var changed = new List<string>();
        if (draft.Name != existing.Name) changed.Add("name");
        if (draft.Description != existing.Description) changed.Add("description");
        if (draft.FolderId != existing.FolderId) changed.Add("folderId");
        if (TrainingJson.Serialize(draft.Document) != TrainingJson.Serialize(existing.Document)) changed.Add("document");
        return Map(await programs.SaveAsync(programId, new(draft.Name, draft.Description, draft.FolderId, Domain(draft.Document)), expectedRevision, ct))
            with { Validation = new(true, [], []), ChangedPaths = changed.ToArray() };
    }
    public async Task<McpProgramProposal> ProposeAsync(Guid programId, long expectedRevision, McpWorkoutChange[] changes, CancellationToken ct)
    {
        var source = await GetAsync(programId, ct);
        if (source.Revision != expectedRevision) throw new ApiException(412, "VERSION_CONFLICT", "Program changed. Reload and retry.");
        var document = McpProgramPatches.Apply(source.Document, changes);
        var targets = changes.Select(x => x.WorkoutId).ToHashSet();
        var paths = source.Document.Blocks.SelectMany((block, b) => block.Cycles.SelectMany((cycle, c) =>
            cycle.Days.SelectMany((day, d) => day.Workouts.Select((workout, w) => new { workout.Id,
                Path = $"document.blocks[{b}].cycles[{c}].days[{d}].workouts[{w}]" }))))
            .Where(x => targets.Contains(x.Id)).Select(x => x.Path).ToArray();
        return new(programId, expectedRevision, new(source.Name, source.Description, source.FolderId, document),
            paths, await ValidateAsync(programId, document, ct));
    }
    public async Task<McpProgramValidation> ValidateAsync(Guid? programId, McpTrainingDocument document, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        return await programs.ValidateMcpDocumentAsync(programId, Domain(document), ct);
    }
    public Task<TrainingProgressDto> ProgressAsync(Guid relationshipId, DateOnly from, DateOnly to, CancellationToken ct) =>
        delivery.ReadAsync(new(from, to, RelationshipId: relationshipId, View: "coach"), ct);
    public Task<McpWorkoutLogPage> LogsAsync(Guid relationshipId, DateOnly from, DateOnly to, int page, int pageSize, CancellationToken ct) =>
        delivery.McpLogsAsync(relationshipId, from, to, page, pageSize, ct);
    private static TrainingDocument Domain(McpTrainingDocument document) => TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(document));
    private static McpProgram Map(PlanDto plan) => new(plan.Id, plan.Name, plan.Description, plan.FolderId, plan.Version, plan.UpdatedAt,
        TrainingJson.Deserialize<McpTrainingDocument>(TrainingJson.Serialize(plan.Document)), $"/app/programs/{plan.Id}/edit");
}

public sealed partial class TrainingService
{
    public async Task<McpProgramValidation> ValidateMcpDocumentAsync(Guid? id, TrainingDocument content, CancellationToken ct)
    {
        var owner = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.programs.read", ct);
        var previous = id is { } programId ? (await PlanAsync(programId, owner, ct)).Draft : null;
        try
        {
            await ValidateContentAsync(content, previous, owner, ct);
            return new(true, [], []);
        }
        catch (ApiException e) when (e.Status == 400)
        {
            return new(false, [new("document", e.Code, e.Message)], []);
        }
        catch (TrainingValidationException e)
        {
            return new(false, [new("document", "VALIDATION_ERROR", e.Message)], []);
        }
    }
}

public static class McpProgramPatches
{
    public static McpTrainingDocument Apply(McpTrainingDocument document, McpWorkoutChange[] changes)
    {
        if (changes is null || changes.Length is < 1 or > 100 || changes.Any(x => x is null) || changes.Select(x => x.WorkoutId).Distinct().Count() != changes.Length)
            throw ApiException.Invalid("Provide 1 to 100 distinct workout changes.");
        var remaining = changes.ToDictionary(x => x.WorkoutId);
        McpWorkout Workout(McpWorkout workout)
        {
            if (!remaining.Remove(workout.Id, out var change)) return workout;
            var edits = change.ExerciseChanges ?? [];
            if (edits.Length > 100 || edits.Any(x => x is null) || edits.Select(x => x.ExerciseInstanceId).Distinct().Count() != edits.Length)
                throw ApiException.Invalid("Exercise changes must be distinct and bounded.");
            var pending = edits.ToDictionary(x => x.ExerciseInstanceId);
            var exercises = workout.Exercises.Select(exercise =>
            {
                if (!pending.Remove(exercise.Id, out var edit)) return exercise;
                var setEdits = edit.SetChanges ?? [];
                if (setEdits.Length > 100 || setEdits.Any(x => x is null) || setEdits.Select(x => x.SetId).Distinct().Count() != setEdits.Length)
                    throw ApiException.Invalid("Set changes must be distinct and bounded.");
                var sets = setEdits.ToDictionary(x => x.SetId);
                var updated = exercise.Sets.Select(set =>
                {
                    if (!sets.Remove(set.Id, out var replacement)) return set;
                    if (replacement.Replacement is null || replacement.Replacement.Id != set.Id) throw ApiException.Invalid("A replacement must preserve the set identifier.");
                    return replacement.Replacement;
                }).ToArray();
                if (sets.Count != 0) throw ApiException.Invalid("A set target does not belong to the exercise.");
                return exercise with { ExerciseId = edit.ExerciseId ?? exercise.ExerciseId, Comment = edit.Comment ?? exercise.Comment,
                    Sets = Order(updated, edit.SetOrder, x => x.Id) };
            }).ToArray();
            if (pending.Count != 0) throw ApiException.Invalid("An exercise target does not belong to the workout.");
            return workout with { Name = change.Name ?? workout.Name, Description = change.Description ?? workout.Description,
                Exercises = Order(exercises, change.ExerciseOrder, x => x.Id) };
        }
        var result = document with { Blocks = document.Blocks.Select(b => b with { Cycles = b.Cycles.Select(c => c with {
            Days = c.Days.Select(d => d with { Workouts = d.Workouts.Select(Workout).ToArray() }).ToArray() }).ToArray() }).ToArray() };
        if (remaining.Count != 0) throw ApiException.Invalid("A workout target does not belong to this program.");
        return result;
    }
    private static T[] Order<T>(T[] values, Guid[]? order, Func<T, Guid> id)
    {
        if (order is null) return values;
        var map = values.ToDictionary(id);
        if (order.Length != values.Length || order.Distinct().Count() != order.Length || order.Any(x => !map.ContainsKey(x)))
            throw ApiException.Invalid("Ordering must include every existing identifier exactly once.");
        return order.Select(x => map[x]).ToArray();
    }
}
