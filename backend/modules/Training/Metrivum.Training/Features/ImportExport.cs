using System.Text;
using Microsoft.EntityFrameworkCore;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Domain;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Features;

public sealed record ImportRowPreview(int Index, string Block, string Cycle, int Day, string Workout, string Exercise, Guid? MatchedExerciseId, string RowKind);
public sealed record ImportPreview(Guid Id, long Version, DateTimeOffset ExpiresAt, int RowCount, ImportRowPreview[] Rows, Guid? CommittedPlanId);
public sealed record MapImportRequest(Dictionary<int, Guid> Exercises);
public sealed record CommitImportRequest(string Name, DocumentKind Kind, Guid? FolderId);
public sealed record ExportFile(byte[] Content, string ContentType, string Name);
public sealed record ImportValidation(bool Valid, long Version, TrainingDocument Document);

public sealed partial class TrainingService
{
    public Task<ImportPreview> PreviewImportAsync(string content, string delimiter, CancellationToken ct) => WriteAsync("training.import.csv", async account =>
    {
        if (Encoding.UTF8.GetByteCount(content) > limits.MaximumImportBytes)
            throw new ApiException(413, "LIMIT_EXCEEDED", "CSV byte limit exceeded.");
        var now = clock.GetUtcNow();
        await db.Imports.Where(x => x.OwnerId == account.UserId && x.ExpiresAt < now && x.CommittedPlanId == null).ExecuteDeleteAsync(ct);
        Limit(await db.Imports.CountAsync(x => x.OwnerId == account.UserId && x.ExpiresAt >= now && x.CommittedPlanId == null, ct) < limits.MaximumActiveImports, "Active import limit exceeded.");
        CsvRow[] rows;
        try
        {
            rows = TrainingCsv.Parse(content, delimiter, limits.MaximumImportRows);
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
        var names = rows.Where(x => x.RowKind == "exercise").Select(x => x.ExerciseName).Distinct().ToArray();
        var matches = await catalog.MatchNamesAsync(names, ct);
        var mapping = new Dictionary<int, Guid>();
        for (var i = 0; i < rows.Length; i++)
            if (rows[i].RowKind == "exercise" && matches.TryGetValue(rows[i].ExerciseName, out var exercise))
                mapping[i] = exercise.Id;
        var session = new TrainingImport { Id = Guid.NewGuid(), OwnerId = account.UserId, WorkspaceId = account.WorkspaceId, Rows = rows, Mapping = mapping, ExpiresAt = now.AddMinutes(limits.ImportLifetimeMinutes) };
        db.Imports.Add(session);
        await db.SaveChangesAsync(ct);
        return Preview(session, 1, 100);
    }, ct);
    public async Task<ImportPreview> GetImportAsync(Guid id, int page, int pageSize, CancellationToken ct)
    {
        var account = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.import.csv", ct);
        Pagination(page, pageSize);
        var session = await ImportAsync(id, account, ct);
        NotExpired(session);
        return Preview(session, page, pageSize);
    }
    public Task<ImportPreview> MapImportAsync(Guid id, MapImportRequest request, long expectedVersion, CancellationToken ct) => WriteAsync("training.import.csv", async account =>
    {
        var session = await ImportAsync(id, account, ct);
        NotExpired(session);
        CheckVersion(session.Version, expectedVersion);
        if (session.CommittedPlanId != null)
            throw ApiException.Conflict("Import is already committed.");
        if (request.Exercises is null || request.Exercises.Keys.Any(i => i < 0 || i >= session.Rows.Length || session.Rows[i].RowKind != "exercise"))
            throw ApiException.Invalid("Invalid import mapping row.");
        var ids = request.Exercises.Values.Distinct().ToArray();
        if ((await catalog.SnapshotAsync(ids, ct)).Count != ids.Length)
            throw ApiException.Invalid("Some mapped exercises are unavailable.");
        session.Mapping = new(request.Exercises);
        session.Version++;
        await db.SaveChangesAsync(ct);
        return Preview(session, 1, 100);
    }, ct);
    public async Task<ImportValidation> ValidateImportAsync(Guid id, CancellationToken ct)
    {
        var account = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.import.csv", ct);
        var session = await ImportAsync(id, account, ct);
        NotExpired(session);
        var content = BuildImport(session);
        await ValidateContentAsync(content, null, account, ct);
        return new(true, session.Version, content);
    }
    public Task<PlanDto> CommitImportAsync(Guid id, CommitImportRequest request, long expectedVersion, string idempotencyKey, CancellationToken ct) => WriteAsync("training.import.csv", async account =>
    {
        ValidateKey(idempotencyKey);
        await access.RequireAsync("training.programs.create", ct);
        if (!Enum.IsDefined(request.Kind))
            throw ApiException.Invalid("Invalid document kind.");
        await TemplateAccessAsync(request.Kind, ct);
        var session = await ImportAsync(id, account, ct);
        var hash = Hash(new
        {
            id,
            request,
            expectedVersion
        });
        var reused = await db.Imports.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == account.UserId && x.CommitKey == idempotencyKey, ct);
        if (reused != null)
        {
            SameHash(reused.RequestHash!, hash);
            return Dto(await PlanAsync(reused.CommittedPlanId!.Value, account, ct));
        }
        if (session.CommittedPlanId != null)
            throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "This import was committed with a different idempotency key.");
        NotExpired(session);
        CheckVersion(session.Version, expectedVersion);
        var content = BuildImport(session);
        await ValidateContentAsync(content, null, account, ct);
        var plan = await CreateInternalAsync(request.Name, session.Rows[0].ProgramDescription, request.Kind, request.FolderId, DocumentRules.Copy(content), account, ct);
        session.CommittedPlanId = plan.Id;
        session.CommitKey = idempotencyKey;
        session.RequestHash = hash;
        await db.SaveChangesAsync(ct);
        return Dto(plan);
    }, ct);
    public async Task<ExportFile> ExportAsync(Guid id, int revision, string format, string scope, Guid? scopeId, string delimiter, CancellationToken ct)
    {
        if (format is not ("csv" or "pdf"))
            throw ApiException.Invalid("Format must be csv or pdf.");
        await access.RequireAsync("training.export." + format, ct);
        var source = (await RevisionAsync(id, revision, ct)).Snapshot;
        abuse?.Require(accounts.UserId, AbusePolicies.Export);
        using var heavyLease = abuse?.Enter(accounts.UserId, AbusePolicies.Heavy);
        var selected = SelectScope(source, scope, scopeId);
        ct.ThrowIfCancellationRequested();
        try
        {
            return format == "csv" ? new(Encoding.UTF8.GetBytes(TrainingCsv.Export(selected, delimiter)), "text/csv; charset=utf-8", $"training-{id:D}-r{revision}.csv") : new(TrainingPdf.Render(selected), "application/pdf", $"training-{id:D}-r{revision}.pdf");
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
    }
    /// <summary>
    /// Exports the current draft, problems and all: the coach is warned in the app, the file shows what is there.
    /// Exercises missing from the catalog are left out and formulas that do not evaluate print without a value.
    /// </summary>
    public async Task<ExportFile> ExportDraftAsync(Guid id, string format, string scope, Guid? scopeId, string delimiter, CancellationToken ct)
    {
        if (format is not ("csv" or "pdf"))
            throw ApiException.Invalid("Format must be csv or pdf.");
        await access.RequireAsync("training.export." + format, ct);
        var account = await ReadAsync(ct);
        var plan = await PlanAsync(id, account, ct);
        abuse?.Require(accounts.UserId, AbusePolicies.Export);
        using var heavyLease = abuse?.Enter(accounts.UserId, AbusePolicies.Heavy);
        var exerciseIds = DocumentRules.Workouts(plan.Draft).SelectMany(w => w.Exercises).Select(e => e.ExerciseId).Distinct().ToArray();
        var exercises = await catalog.SnapshotAsync(exerciseIds, ct);
        var document = KnownExercises(plan.Draft, exercises.Keys.ToHashSet());
        Dictionary<Guid, FormulaEvaluation> formulas;
        try { formulas = await EvaluateDocumentAsync(document, account, ct); }
        catch (ApiException) { formulas = []; }
        var source = new RevisionSnapshot(1, plan.Name, plan.Description, plan.Kind, document, new(exercises), formulas);
        var selected = SelectScope(source, scope, scopeId);
        ct.ThrowIfCancellationRequested();
        try
        {
            return format == "csv" ? new(Encoding.UTF8.GetBytes(TrainingCsv.Export(selected, delimiter)), "text/csv; charset=utf-8", $"training-{id:D}-draft.csv") : new(TrainingPdf.Render(selected), "application/pdf", $"training-{id:D}-draft.pdf");
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
    }
    private static TrainingDocument KnownExercises(TrainingDocument doc, HashSet<Guid> known) => doc with
    {
        Blocks = doc.Blocks.Select(b => b with { Cycles = b.Cycles.Select(c => c with { Days = c.Days.Select(d => d with { Workouts = d.Workouts.Select(w =>
        {
            var kept = w.Exercises.Where(e => known.Contains(e.ExerciseId)).ToArray();
            var ids = kept.Select(e => e.Id).ToHashSet();
            return w with { Exercises = kept, Groups = (w.Groups ?? []).Where(g => g.ExerciseIds.All(ids.Contains)).ToArray() };
        }).ToArray() }).ToArray() }).ToArray() }).ToArray()
    };
    public static RevisionSnapshot SelectScope(RevisionSnapshot source, string scope, Guid? id)
    {
        if (scope == "program")
        {
            if (id != null)
                throw ApiException.Invalid("Program scope does not accept a scopeId.");
            return source;
        }
        if (scope is not ("block" or "cycle" or "workout") || id == null)
            throw ApiException.Invalid("Scope must be program, block, cycle, or workout with scopeId.");
        Block[] blocks = scope switch
        {
            "block" => source.Document.Blocks.Where(b => b.Id == id).ToArray(),
            "cycle" => source.Document.Blocks.Select(b => b with { Cycles = b.Cycles.Where(c => c.Id == id).ToArray() }).Where(b => b.Cycles.Length > 0).ToArray(),
            _ => source.Document.Blocks.Select(b => b with { Cycles = b.Cycles.Select(c => c with { Days = c.Days.Select(d => d with { Workouts = d.Workouts.Where(w => w.Id == id).ToArray() }).Where(d => d.Workouts.Length > 0).ToArray() }).Where(c => c.Days.Length > 0).ToArray() }).Where(b => b.Cycles.Length > 0).ToArray()
        };
        if (blocks.Length == 0)
            throw ApiException.NotFound();
        var document = source.Document with
        {
            Blocks = blocks,
            Annotations = source.Document.Annotations?.Where(n => n.TargetId == null || blocks.Any(b => b.Id == n.TargetId || b.Cycles.Any(c => c.Id == n.TargetId))).ToArray(),
            MaxesTables = source.Document.MaxesTables?.Where(t => t.BlockId == null || blocks.Any(b => b.Id == t.BlockId)).ToArray()
        };
        var exerciseIds = DocumentRules.Workouts(document).SelectMany(w => w.Exercises).Select(e => e.ExerciseId).ToHashSet();
        var formulaIds = DocumentRules.Sets(document).SelectMany(s => new[] { s.Id }.Concat((s.Segments ?? []).Select(p => p.Id))).ToHashSet();
        return source with
        {
            Document = document,
            Exercises = source.Exercises.Where(x => exerciseIds.Contains(x.Key)).ToDictionary(),
            Formulas = source.Formulas.Where(x => formulaIds.Contains(x.Key)).ToDictionary()
        };
    }
    private static TrainingDocument BuildImport(TrainingImport session)
    {
        try
        {
            return TrainingCsv.Build(session.Rows, session.Mapping);
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
    }
    private async Task<TrainingImport> ImportAsync(Guid id, AccountIdentity account, CancellationToken ct) => await db.Imports.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct) ?? throw ApiException.NotFound();
    private void NotExpired(TrainingImport session)
    {
        if (session.ExpiresAt <= clock.GetUtcNow())
            throw new ApiException(410, "IMPORT_EXPIRED", "Import session expired; upload the CSV again.");
    }
    private static ImportPreview Preview(TrainingImport session, int page, int pageSize) => new(session.Id, session.Version, session.ExpiresAt, session.Rows.Length,
        session.Rows.Select((r, i) => new ImportRowPreview(i, r.BlockName, r.CycleName, r.DayNumber, r.WorkoutName, r.ExerciseName, session.Mapping.TryGetValue(i, out var exercise) ? exercise : null, r.RowKind)).Skip((page - 1) * pageSize).Take(pageSize).ToArray(), session.CommittedPlanId);
}
