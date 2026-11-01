using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Training.Domain;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Features;

public sealed class ClientExerciseMax
{
    public Guid Id { get; set; }
    public Guid ClientId { get; set; }
    public Guid ExerciseId { get; set; }
    public int Reps { get; set; }
    public decimal LoadKg { get; set; }
    public DateOnly RecordedOn { get; set; }
    public string Alias { get; set; } = "";
    public long Version { get; set; } = 1;
}
public sealed record ClientExerciseMaxRequest(Guid ExerciseId, int Reps, Quantity Load, DateOnly RecordedOn, string Alias);
public sealed record ClientExerciseMaxDto(Guid Id, Guid ExerciseId, int Reps, Quantity Load, DateOnly RecordedOn, string Alias, long Version);
public sealed record ClientVariablesDto(Dictionary<string, Quantity> Variables, Dictionary<string, string> SourceVersions, ClientExerciseMaxDto[] ExerciseMaxes);
public sealed record ClientPreviewRequest(Guid RelationshipId, TrainingDocument? Document = null);
public sealed record ClientFormulaPreview(Dictionary<string, Quantity> Variables, Dictionary<string, string> SourceVersions, Dictionary<Guid, FormulaEvaluation> Evaluations);

public sealed partial class TrainingService
{
    private async Task<RelationshipRecipient> MetricClientAsync(Guid relationshipId, CancellationToken ct)
    {
        var coach = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.assignments.manage", ct);
        var relation = metricRelationships == null ? null : await metricRelationships.GetAsync(relationshipId, ct);
        if (relation == null || relation.CoachId != coach.UserId || relation.WorkspaceId != coach.WorkspaceId) throw ApiException.NotFound();
        var decision = await relationshipPolicy.DecideAsync(relationshipId, RelationshipOperation.Manage, ct);
        if (!decision.Allowed || decision.Status != RelationshipStatus.Active) throw new ApiException(403, "RELATIONSHIP_ACCESS_DENIED", "Active coaching management access is required.");
        return relation;
    }
    public async Task<ClientVariablesDto> ClientVariablesAsync(Guid relationshipId, CancellationToken ct)
    {
        var relation = await MetricClientAsync(relationshipId, ct);
        return await ClientVariablesForUserAsync(relation.ClientId, ct);
    }
    private async Task<ClientVariablesDto> ClientVariablesForUserAsync(Guid clientId, CancellationToken ct)
    {
        var rows = await db.Set<ClientExerciseMax>().AsNoTracking().Where(x => x.ClientId == clientId).OrderBy(x => x.Alias).ToArrayAsync(ct);
        var variables = new Dictionary<string, Quantity>(StringComparer.Ordinal);
        var versions = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in rows) { variables[row.Alias] = new(row.LoadKg, Unit.Kg); versions[row.Alias] = $"max:{row.Id}:{row.Version}"; }
        // Each repetition count is a separate source; no estimated 1RM.
        foreach (var row in rows.GroupBy(x => (x.ExerciseId, x.Reps)).Select(g => g.OrderByDescending(x => x.RecordedOn).ThenByDescending(x => x.Version).ThenBy(x => x.Id).First()))
        {
            var alias = BlockMaxes.Alias(row.ExerciseId, row.Reps);
            variables[alias] = new(row.LoadKg, Unit.Kg);
            versions[alias] = $"max:{row.Id}:{row.Version}";
        }
        if (profileFields != null)
        {
            var profile = await profileFields.GetAllowedForUserAsync(clientId, ct);
            foreach (var (key, names, unit) in new[] { (SystemFieldKey.Weight, new[] { "weight", "bodyweight", "bodyWeight" }, Unit.Kg), (SystemFieldKey.Height, new[] { "height" }, Unit.Scalar), (SystemFieldKey.HrMax, new[] { "hrMax" }, Unit.Scalar) })
                if (profile.Values.TryGetValue(key, out var json) && json.ValueKind == System.Text.Json.JsonValueKind.Number && json.TryGetDecimal(out var value))
                    foreach (var name in names) { variables[name] = new(value, unit); versions[name] = $"profile:{clientId}:{key}:{value.ToString(System.Globalization.CultureInfo.InvariantCulture)}"; }
        }
        return new(variables, versions, rows.Select(MaxDto).ToArray());
    }
    public Task<ClientExerciseMaxDto> SaveExerciseMaxAsync(Guid relationshipId, Guid? id, ClientExerciseMaxRequest request, long? expectedVersion, CancellationToken ct) => WriteAsync("training.assignments.manage", async account =>
    {
        var relation = await MetricClientAsync(relationshipId, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({relation.ClientId.ToString()}, 8115))", ct);
        Validate(() => FormulaBindings.ValidateAlias(request.Alias));
        if (request.ExerciseId == Guid.Empty || request.Reps is < 1 or > 100 || request.Load == null || !Enum.IsDefined(request.Load.Unit) || Quantity.Dimension(request.Load.Unit) != "mass" || request.Load.In(Unit.Kg) <= 0 || request.Load.In(Unit.Kg) > 100000 || request.RecordedOn.Year < 2000 || request.RecordedOn > DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime))
            throw ApiException.Invalid("Invalid exercise max, load, repetitions, or date.");
        if (!(await catalog.SnapshotAsync([request.ExerciseId], ct)).ContainsKey(request.ExerciseId)) throw ApiException.Invalid("Catalog exercise is unavailable.");
        if (await db.Set<ClientExerciseMax>().CountAsync(x => x.ClientId == relation.ClientId, ct) >= 64 && id == null) throw ApiException.Invalid("Maximum 64 client exercise variables.");
        if (await db.Set<ClientExerciseMax>().AnyAsync(x => x.ClientId == relation.ClientId && x.Alias == request.Alias && x.Id != id, ct)) throw ApiException.Conflict("This client variable alias already exists.");
        var row = id == null ? new ClientExerciseMax { Id = Guid.NewGuid(), ClientId = relation.ClientId } : await db.Set<ClientExerciseMax>().SingleOrDefaultAsync(x => x.Id == id && x.ClientId == relation.ClientId, ct) ?? throw ApiException.NotFound();
        if (id != null) { CheckVersion(row.Version, expectedVersion ?? -1); row.Version++; }
        else db.Add(row);
        row.ExerciseId = request.ExerciseId; row.Reps = request.Reps; row.LoadKg = request.Load.In(Unit.Kg); row.RecordedOn = request.RecordedOn; row.Alias = request.Alias;
        await db.SaveChangesAsync(ct);
        return MaxDto(row);
    }, ct);
    private static ClientExerciseMaxDto MaxDto(ClientExerciseMax x) => new(x.Id, x.ExerciseId, x.Reps, new(x.LoadKg, Unit.Kg), x.RecordedOn, x.Alias, x.Version);
    public async Task<ClientFormulaPreview> PreviewClientAsync(Guid id, ClientPreviewRequest request, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        var plan = await PlanAsync(id, account, ct);
        var variables = await ClientVariablesAsync(request.RelationshipId, ct);
        var document = request.Document ?? plan.Draft;
        Validate(() => DocumentRules.Validate(document, limits.Document));
        var values = await EvaluateDocumentAsync(document, account, ct, variables, false);
        return new(variables.Variables, variables.SourceVersions, values);
    }
    internal async Task<ClientFormulaPreview> ResolveClientFormulasAsync(TrainingDocument document, Guid clientId, Guid coachId, CancellationToken ct, ClientVariablesDto? frozen = null, bool includeNewVariables = false)
    {
        var account = await accounts.RequireCoachAsync(ct);
        if (account.UserId != coachId) throw ApiException.NotFound();
        var variables = frozen ?? await ClientVariablesForUserAsync(clientId, ct);
        if (frozen != null && includeNewVariables)
        {
            var current = await ClientVariablesForUserAsync(clientId, ct);
            var values = new Dictionary<string, Quantity>(frozen.Variables, StringComparer.Ordinal);
            var versions = new Dictionary<string, string>(frozen.SourceVersions, StringComparer.Ordinal);
            // Applying a plan can introduce aliases; existing frozen values still require explicit refresh.
            foreach (var item in current.Variables)
                if (values.TryAdd(item.Key, item.Value) && current.SourceVersions.TryGetValue(item.Key, out var version))
                    versions[item.Key] = version;
            variables = new(values, versions, []);
        }
        return new(variables.Variables, variables.SourceVersions, await EvaluateDocumentAsync(document, account, ct, variables, false));
    }
}
