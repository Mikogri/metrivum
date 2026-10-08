using Microsoft.EntityFrameworkCore;
using TrainFlow.BuildingBlocks;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Generation;

namespace TrainFlow.Training.Features;

public sealed partial class TrainingService
{
    public async Task<GenerationOptions> GeneratorOptionsAsync(CancellationToken ct)
    {
        await GeneratorAccessAsync(ct);
        var pool = await catalog.GeneratorPoolAsync(ct);
        var eligible = pool.Exercises.Where(x => x.Reviewed && x.Status != "manual-only").ToArray();
        return new(ProgramGenerator.RecipeVersion, pool.MetadataVersion, ProgramGenerator.DatasetVersion(pool),
            eligible.SelectMany(x => x.EquipmentAnyOf).SelectMany(x => x.AllOf).Distinct().Order().ToArray(),
            eligible.SelectMany(x => x.RequiredSkills).Distinct().Order().ToArray(),
            eligible.SelectMany(x => x.Muscles).Distinct().Order().ToArray(),
            eligible.Select(x => x.Family).Distinct().Order().ToArray(), eligible);
    }

    public async Task<GenerationPreview> PreviewGenerationAsync(GenerationRequest request, CancellationToken ct)
    {
        await GeneratorAccessAsync(ct);
        return ProgramGenerator.Preview(request, await catalog.GeneratorPoolAsync(ct));
    }

    public async Task<GenerationPreview> ReshuffleGenerationAsync(GenerationEditRequest request, CancellationToken ct)
    {
        await GeneratorAccessAsync(ct);
        return ProgramGenerator.Reshuffle(request, await catalog.GeneratorPoolAsync(ct));
    }

    public async Task<GenerationPreview> ReplaceGeneratedExerciseAsync(GenerationReplaceRequest request, CancellationToken ct)
    {
        await GeneratorAccessAsync(ct);
        return ProgramGenerator.Replace(request, await catalog.GeneratorPoolAsync(ct));
    }

    public async Task<GenerationState?> GetGenerationAsync(Guid programId, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        await PlanAsync(programId, account, ct);
        var record = await db.Set<ProgramGenerationRecord>().AsNoTracking().SingleOrDefaultAsync(x => x.ProgramId == programId && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct);
        return record == null ? null : TrainingJson.Deserialize<GenerationState>(record.StateJson);
    }

    public Task<PlanDto> SaveGeneratedDraftAsync(SaveGeneratedDraftRequest request, string key, CancellationToken ct) =>
        WriteAsync("training.generator.use", async account =>
        {
            await access.RequireAsync("training.programs.create", ct);
            ValidateKey(key);
            var requestHash = Hash(request);
            var prior = await db.Set<ProgramGenerationRecord>().SingleOrDefaultAsync(x => x.WorkspaceId == account.WorkspaceId && x.OwnerId == account.UserId && x.IdempotencyKey == key, ct);
            if (prior != null)
            {
                SameHash(prior.RequestHash, requestHash);
                return Dto(await PlanAsync(prior.ProgramId, account, ct));
            }
            var preview = ProgramGenerator.Restore(request.State, await catalog.GeneratorPoolAsync(ct));
            if (!preview.Feasible || preview.Document == null)
                throw new ApiException(422, "GENERATOR_CONSTRAINTS", string.Join(" ", preview.Issues.Select(x => $"{x.Code}: {x.Message}")));
            await ValidateContentAsync(preview.Document, null, account, ct);
            var plan = await CreateInternalAsync(request.Name, request.Description, DocumentKind.Program, request.FolderId, preview.Document, account, ct);
            db.Set<ProgramGenerationRecord>().Add(new()
            {
                ProgramId = plan.Id,
                WorkspaceId = account.WorkspaceId,
                OwnerId = account.UserId,
                IdempotencyKey = key,
                RequestHash = requestHash,
                StateJson = TrainingJson.Serialize(preview.State),
                DocumentHash = Hash(preview.Document),
                AssumptionsJson = TrainingJson.Serialize(preview.Assumptions),
                CreatedAt = clock.GetUtcNow()
            });
            await db.SaveChangesAsync(ct);
            return Dto(plan);
        }, ct);

    private async Task GeneratorAccessAsync(CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.generator.use", ct);
    }
}
