using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ExerciseCatalog.Contracts;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Features;

public sealed record CreatePlanRequest(string Name, string Description, DocumentKind Kind, Guid? FolderId, TrainingDocument Document);
public sealed record SavePlanRequest(string Name, string Description, Guid? FolderId, TrainingDocument Document);
public sealed record CopyPlanRequest(string Name, DocumentKind Kind, Guid? FolderId);
public sealed record FolderRequest(string Name, Guid? ParentId, int Position);
public sealed record FolderDto(Guid Id, string Name, Guid? ParentId, int Position, long Version);
public sealed record PlanDto(Guid Id, string Name, string Description, DocumentKind Kind, Guid? FolderId, bool Archived, long Version, DateTimeOffset UpdatedAt, TrainingDocument Document);
public sealed record PlanListItem(Guid Id, string Name, string Description, DocumentKind Kind, Guid? FolderId, bool Archived, long Version, DateTimeOffset UpdatedAt);
public sealed record RevisionDto(Guid Id, int Number, long DraftVersion, DateTimeOffset PublishedAt, RevisionSnapshot Snapshot);
public sealed record RevisionListItem(Guid Id, int Number, long DraftVersion, DateTimeOffset PublishedAt);
public sealed record Paged<T>(T[] Items, int Page, int PageSize, long Total);
public sealed class TrainingListQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Search
    {
        get; set;
    }
    public string Sort { get; set; } = "updated";
    public DocumentKind? Kind
    {
        get; set;
    }
    public Guid? FolderId
    {
        get; set;
    }
    public bool Archived
    {
        get; set;
    }
}
public sealed record FormulaRequest(string Name, FormulaDefinition Definition);
public sealed record FormulaDto(Guid Id, string Name, int Version, bool Archived, FormulaDefinition Definition);
public sealed record FormulaListItem(Guid Id, string Name, int Version, bool Archived);

public sealed partial class TrainingService(TrainingDbContext db, IAccountContext accounts, IFeatureAccessService access,
    IExerciseCatalog catalog, IOptions<TrainingOptions> options, TimeProvider clock)
{
    private readonly TrainingOptions limits = options.Value;
    private FormulaEngine Engine => new(limits.Formula);

    public async Task<Paged<PlanListItem>> ListAsync(TrainingListQuery request, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        Pagination(request.Page, request.PageSize);
        Validate(() => DocumentRules.Text(request.Search, 200));
        var query = db.Plans.AsNoTracking().Where(x => x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId && x.Archived == request.Archived);
        if (request.Kind != null)
        {
            if (!Enum.IsDefined(request.Kind.Value))
                throw ApiException.Invalid("Invalid document kind.");
            query = query.Where(x => x.Kind == request.Kind);
        }
        if (request.FolderId != null)
            query = query.Where(x => x.FolderId == request.FolderId);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var text = request.Search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(text));
        }
        var total = await query.LongCountAsync(ct);
        var ordered = request.Sort switch
        {
            "updated" => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id),
            "name" => query.OrderBy(x => x.Name).ThenBy(x => x.Id),
            "created" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be updated, name, or created.")
        };
        return new(await ordered.Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).Select(x => new PlanListItem(x.Id, x.Name, x.Description, x.Kind, x.FolderId, x.Archived, x.Version, x.UpdatedAt)).ToArrayAsync(ct), request.Page, request.PageSize, total);
    }
    public async Task<PlanDto> GetAsync(Guid id, CancellationToken ct) => Dto(await PlanAsync(id, await ReadAsync(ct), ct));
    public Task<PlanDto> CreateAsync(CreatePlanRequest request, CancellationToken ct) => WriteAsync("training.programs.create", async account =>
    {
        if (!Enum.IsDefined(request.Kind))
            throw ApiException.Invalid("Invalid document kind.");
        await TemplateAccessAsync(request.Kind, ct);
        await ValidateContentAsync(request.Document, null, account, ct);
        return Dto(await CreateInternalAsync(request.Name, request.Description, request.Kind, request.FolderId, request.Document, account, ct));
    }, ct);
    public Task<PlanDto> SaveAsync(Guid id, SavePlanRequest request, long expectedVersion, CancellationToken ct) => WriteAsync("training.programs.manage", async account =>
    {
        var plan = await PlanAsync(id, account, ct);
        CheckVersion(plan.Version, expectedVersion);
        Active(plan);
        await TemplateAccessAsync(plan.Kind, ct);
        await ValidateContentAsync(request.Document, plan.Draft, account, ct);
        await FolderAvailableAsync(request.FolderId, account, ct);
        Validate(() => { DocumentRules.Text(request.Name, 200, true); DocumentRules.NonNullText(request.Description, 4000); });
        plan.Name = request.Name.Trim();
        plan.Description = request.Description;
        plan.FolderId = request.FolderId;
        plan.Draft = request.Document;
        plan.Version++;
        plan.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return Dto(plan);
    }, ct);
    public Task<PlanDto> CopyAsync(Guid id, CopyPlanRequest request, CancellationToken ct) => WriteAsync("training.programs.create", async account =>
    {
        var original = await PlanAsync(id, account, ct);
        if (!Enum.IsDefined(request.Kind))
            throw ApiException.Invalid("Invalid document kind.");
        await TemplateAccessAsync(request.Kind, ct);
        var copy = DocumentRules.Copy(original.Draft);
        await ValidateContentAsync(copy, null, account, ct);
        return Dto(await CreateInternalAsync(request.Name, original.Description, request.Kind, request.FolderId, copy, account, ct));
    }, ct);
    public Task<PlanDto> ArchiveAsync(Guid id, bool archived, long expectedVersion, CancellationToken ct) => WriteAsync("training.programs.manage", async account =>
    {
        var plan = await PlanAsync(id, account, ct);
        CheckVersion(plan.Version, expectedVersion);
        await TemplateAccessAsync(plan.Kind, ct);
        plan.Archived = archived;
        plan.Version++;
        plan.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return Dto(plan);
    }, ct);
    public Task<RevisionDto> PublishAsync(Guid id, long expectedVersion, string idempotencyKey, CancellationToken ct) => WriteAsync("training.programs.manage", async account =>
    {
        ValidateKey(idempotencyKey);
        var plan = await PlanAsync(id, account, ct);
        await TemplateAccessAsync(plan.Kind, ct);
        var hash = Hash(new
        {
            id,
            expectedVersion
        });
        var previous = await (from existing in db.Revisions.AsNoTracking() join owned in db.Plans on existing.PlanId equals owned.Id where owned.OwnerId == account.UserId && existing.IdempotencyKey == idempotencyKey orderby existing.PublishedAt, existing.Id select existing).FirstOrDefaultAsync(ct);
        if (previous != null)
        {
            SameHash(previous.RequestHash, hash);
            return Dto(previous);
        }
        CheckVersion(plan.Version, expectedVersion);
        Active(plan);
        Validate(() => DocumentRules.Validate(plan.Draft, limits.Document));
        var count = await db.Revisions.CountAsync(x => x.PlanId == id, ct);
        Limit(count < limits.MaximumRevisionsPerDocument, "Revision limit exceeded.");
        var exerciseIds = DocumentRules.Workouts(plan.Draft).SelectMany(w => w.Exercises).Select(e => e.ExerciseId).Distinct().ToArray();
        var snapshots = await catalog.SnapshotAsync(exerciseIds, ct);
        if (snapshots.Count != exerciseIds.Length)
            throw ApiException.Invalid("Some exercises are unavailable.");
        var formulas = await EvaluateDocumentAsync(plan.Draft, account, ct);
        var revision = new TrainingRevision { Id = Guid.NewGuid(), PlanId = id, Number = count + 1, DraftVersion = plan.Version, PublishedAt = clock.GetUtcNow(), IdempotencyKey = idempotencyKey, RequestHash = hash, Snapshot = new(1, plan.Name, plan.Description, plan.Kind, TrainingJson.Deserialize<TrainingDocument>(TrainingJson.Serialize(plan.Draft)), new(snapshots), formulas) };
        db.Revisions.Add(revision);
        await db.SaveChangesAsync(ct);
        return Dto(revision);
    }, ct);
    public async Task<RevisionDto> RevisionAsync(Guid id, int number, CancellationToken ct)
    {
        await PlanAsync(id, await ReadAsync(ct), ct);
        return Dto(await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.PlanId == id && x.Number == number, ct) ?? throw ApiException.NotFound());
    }
    public async Task<Paged<RevisionListItem>> RevisionsAsync(Guid id, int page, int pageSize, CancellationToken ct)
    {
        await PlanAsync(id, await ReadAsync(ct), ct);
        Pagination(page, pageSize);
        var query = db.Revisions.AsNoTracking().Where(x => x.PlanId == id);
        return new(await query.OrderByDescending(x => x.Number).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new RevisionListItem(x.Id, x.Number, x.DraftVersion, x.PublishedAt)).ToArrayAsync(ct), page, pageSize, await query.LongCountAsync(ct));
    }
    public async Task<Paged<FolderDto>> FoldersAsync(Guid? parentId, int page, int pageSize, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        Pagination(page, pageSize);
        var query = db.Folders.AsNoTracking().Where(x => x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId && x.ParentId == parentId);
        return new(await query.OrderBy(x => x.Position).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new FolderDto(x.Id, x.Name, x.ParentId, x.Position, x.Version)).ToArrayAsync(ct), page, pageSize, await query.LongCountAsync(ct));
    }
    public Task<FolderDto> CreateFolderAsync(FolderRequest request, CancellationToken ct) => WriteAsync("training.folders.manage", async account =>
    {
        Limit(await db.Folders.CountAsync(x => x.WorkspaceId == account.WorkspaceId, ct) < limits.MaximumFolders, "Folder limit exceeded.");
        var folder = new TrainingFolder { Id = Guid.NewGuid(), WorkspaceId = account.WorkspaceId, OwnerId = account.UserId };
        await ApplyFolderAsync(folder, request, account, ct);
        db.Folders.Add(folder);
        await db.SaveChangesAsync(ct);
        return Dto(folder);
    }, ct);
    public Task<FolderDto> UpdateFolderAsync(Guid id, FolderRequest request, long expectedVersion, CancellationToken ct) => WriteAsync("training.folders.manage", async account =>
    {
        var folder = await db.Folders.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct) ?? throw ApiException.NotFound();
        CheckVersion(folder.Version, expectedVersion);
        await ApplyFolderAsync(folder, request, account, ct);
        folder.Version++;
        await db.SaveChangesAsync(ct);
        return Dto(folder);
    }, ct);
    public Task<bool> DeleteFolderAsync(Guid id, long expectedVersion, CancellationToken ct) => WriteAsync("training.folders.manage", async account =>
    {
        var folder = await db.Folders.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct) ?? throw ApiException.NotFound();
        CheckVersion(folder.Version, expectedVersion);
        if (await db.Folders.AnyAsync(x => x.ParentId == id, ct) || await db.Plans.AnyAsync(x => x.FolderId == id, ct))
            throw ApiException.Conflict("Folder is not empty; move its contents explicitly first.");
        db.Folders.Remove(folder);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    public static IReadOnlyDictionary<string, FormulaDefinition> BuiltInFormulas
    {
        get;
    } = new Dictionary<string, FormulaDefinition>
    {
        ["percentage-1rm"] = new("base1Rm * percentage", new() { ["base1Rm"] = Unit.Kg, ["percentage"] = Unit.Scalar }, Unit.Kg),
        ["previous-cycle-increment"] = new("previousCycleLoad + increment", new() { ["previousCycleLoad"] = Unit.Kg, ["increment"] = Unit.Kg }, Unit.Kg),
        ["top-set-back-off"] = new("prescribedTopSetLoad * percentage", new() { ["prescribedTopSetLoad"] = Unit.Kg, ["percentage"] = Unit.Scalar }, Unit.Kg)
    };
    public async Task<Paged<FormulaListItem>> FormulasAsync(string? search, int page, int pageSize, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        Pagination(page, pageSize);
        Validate(() => DocumentRules.Text(search, 200));
        var query = db.Formulas.AsNoTracking().Where(x => x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(text));
        }
        return new(await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new FormulaListItem(x.Id, x.Name, x.Version, x.Archived)).ToArrayAsync(ct), page, pageSize, await query.LongCountAsync(ct));
    }
    public async Task<FormulaDto> FormulaAsync(Guid id, int? version, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        var formula = await FormulaOwnerAsync(id, account, ct);
        return await FormulaDtoAsync(formula, version ?? formula.Version, ct);
    }
    public Task<FormulaDto> CreateFormulaAsync(FormulaRequest request, CancellationToken ct) => WriteAsync<FormulaDto>("training.formulas.custom", async account =>
    {
        ValidateFormula(request);
        Limit(await db.Formulas.CountAsync(x => x.WorkspaceId == account.WorkspaceId, ct) < limits.MaximumFormulaRules, "Formula limit exceeded.");
        var formula = new TrainingFormula { Id = Guid.NewGuid(), Name = request.Name.Trim(), OwnerId = account.UserId, WorkspaceId = account.WorkspaceId };
        db.Formulas.Add(formula);
        db.FormulaVersions.Add(new()
        {
            FormulaId = formula.Id,
            Version = 1,
            Definition = request.Definition,
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);
        return new(formula.Id, formula.Name, 1, false, request.Definition);
    }, ct);
    public Task<FormulaDto> UpdateFormulaAsync(Guid id, FormulaRequest request, long expectedVersion, CancellationToken ct) => WriteAsync<FormulaDto>("training.formulas.custom", async account =>
    {
        ValidateFormula(request);
        var formula = await FormulaOwnerAsync(id, account, ct);
        CheckVersion(formula.Version, expectedVersion);
        if (formula.Archived)
            throw ApiException.Conflict("Formula is archived.");
        formula.Name = request.Name.Trim();
        formula.Version++;
        db.FormulaVersions.Add(new()
        {
            FormulaId = id,
            Version = formula.Version,
            Definition = request.Definition,
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);
        return new(id, formula.Name, formula.Version, formula.Archived, request.Definition);
    }, ct);
    public async Task<FormulaDto> DuplicateFormulaAsync(Guid id, string name, CancellationToken ct)
    {
        var source = await FormulaAsync(id, null, ct);
        return await CreateFormulaAsync(new(name, source.Definition), ct);
    }
    public async Task<FormulaEvaluation> EvaluateFormulaAsync(FormulaUse request, CancellationToken ct)
    {
        var account = await ReadAsync(ct);
        if (request.FormulaId != null)
            await access.RequireAsync("training.formulas.custom", ct);
        return await EvaluateAsync(request, account, ct);
    }

    private async Task<TrainingPlan> CreateInternalAsync(string name, string description, DocumentKind kind, Guid? folder, TrainingDocument content, AccountIdentity account, CancellationToken ct)
    {
        Validate(() => { DocumentRules.Text(name, 200, true); DocumentRules.NonNullText(description, 4000); });
        await FolderAvailableAsync(folder, account, ct);
        Limit(await db.Plans.CountAsync(x => x.WorkspaceId == account.WorkspaceId, ct) < limits.MaximumDocuments, "Document limit exceeded.");
        var plan = new TrainingPlan { Id = Guid.NewGuid(), OwnerId = account.UserId, WorkspaceId = account.WorkspaceId, Name = name.Trim(), Description = description, Kind = kind, FolderId = folder, Draft = content, CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
        db.Plans.Add(plan);
        await db.SaveChangesAsync(ct);
        return plan;
    }
    private async Task ValidateContentAsync(TrainingDocument content, TrainingDocument? old, AccountIdentity account, CancellationToken ct)
    {
        Validate(() => DocumentRules.Validate(content, limits.Document));
        if (HasChangedContent(ContentFingerprints(content, false), old == null ? [] : ContentFingerprints(old, false)))
            await access.RequireAsync("training.sets.advanced", ct);
        if (HasChangedContent(ContentFingerprints(content, true), old == null ? [] : ContentFingerprints(old, true)))
            await access.RequireAsync("training.formulas.custom", ct);
        var ids = DocumentRules.Workouts(content).SelectMany(w => w.Exercises).Select(e => e.ExerciseId).Distinct().ToArray();
        if ((await catalog.SnapshotAsync(ids, ct)).Count != ids.Length)
            throw ApiException.Invalid("Some catalog exercises are unavailable.");
        await EvaluateDocumentAsync(content, account, ct);
    }
    private static bool HasChangedContent(Dictionary<Guid, string> incoming, Dictionary<Guid, string> previous) => incoming.Any(x => !previous.TryGetValue(x.Key, out var old) || old != x.Value);
    private static Dictionary<Guid, string> ContentFingerprints(TrainingDocument document, bool formulas)
    {
        var result = new Dictionary<Guid, string>();
        foreach (var workout in DocumentRules.Workouts(document))
        {
            if (!formulas)
                foreach (var group in workout.Groups)
                    result.Add(group.Id, Hash(new
                    {
                        WorkoutId = workout.Id,
                        Group = group,
                        Bindings = group.ExerciseIds.Select(id => workout.Exercises.Single(e => e.Id == id).ExerciseId)
                    }));
            foreach (var exercise in workout.Exercises)
                foreach (var set in exercise.Sets)
                {
                    if (!formulas && set.Kind != SetKind.Standard)
                        result.Add(set.Id, Hash(new
                        {
                            WorkoutId = workout.Id,
                            InstanceId = exercise.Id,
                            exercise.ExerciseId,
                            Set = set
                        }));
                    if (!formulas)
                        continue;
                    if (set.Prescription.LoadFormula?.FormulaId != null)
                        result.Add(set.Id, Hash(new
                        {
                            WorkoutId = workout.Id,
                            InstanceId = exercise.Id,
                            exercise.ExerciseId,
                            SetId = set.Id,
                            Formula = set.Prescription.LoadFormula
                        }));
                    foreach (var segment in set.Segments ?? [])
                        if (segment.Prescription.LoadFormula?.FormulaId != null)
                            result.Add(segment.Id, Hash(new
                            {
                                WorkoutId = workout.Id,
                                InstanceId = exercise.Id,
                                exercise.ExerciseId,
                                SetId = set.Id,
                                SegmentId = segment.Id,
                                Formula = segment.Prescription.LoadFormula
                            }));
                }
        }
        return result;
    }
    private async Task<Dictionary<Guid, FormulaEvaluation>> EvaluateDocumentAsync(TrainingDocument doc, AccountIdentity account, CancellationToken ct)
    {
        var values = new Dictionary<Guid, FormulaEvaluation>();
        foreach (var set in DocumentRules.Sets(doc))
        {
            if (set.Prescription.LoadFormula is { } f)
                values.Add(set.Id, await EvaluateAsync(f, account, ct));
            foreach (var segment in set.Segments ?? [])
                if (segment.Prescription.LoadFormula is { } sf)
                    values.Add(segment.Id, await EvaluateAsync(sf, account, ct));
        }
        return values;
    }
    private async Task<FormulaEvaluation> EvaluateAsync(FormulaUse use, AccountIdentity account, CancellationToken ct)
    {
        Validate(() => DocumentRules.ValidatePrescription(new(LoadFormula: use)));
        FormulaDefinition definition;
        if (use.FormulaId is { } id)
        {
            await FormulaOwnerAsync(id, account, ct);
            definition = (await db.FormulaVersions.AsNoTracking().SingleOrDefaultAsync(x => x.FormulaId == id && x.Version == use.Version, ct) ?? throw ApiException.NotFound()).Definition;
        }
        else if (use.Version != 1 || use.BuiltIn == null || !BuiltInFormulas.TryGetValue(use.BuiltIn, out definition!))
            throw ApiException.Invalid("Unknown built-in formula version.");
        if (use.Inputs.Count != definition.Inputs.Count || definition.Inputs.Keys.Any(x => !use.Inputs.ContainsKey(x)))
            throw ApiException.Invalid("Formula inputs do not match the versioned declaration.");
        try
        {
            var normalized = use.Inputs.ToDictionary(x => x.Key, x => new Quantity(x.Value.In(definition.Inputs[x.Key]), definition.Inputs[x.Key]));
            var value = Engine.Evaluate(definition.Expression, normalized);
            value = new(value.In(definition.OutputUnit), definition.OutputUnit);
            if (Quantity.Dimension(value.Unit) != "mass" || value.Value < 0)
                throw new TrainingValidationException("Load formula must produce a nonnegative mass.");
            return new(definition.Expression, use.Version, new(use.Inputs), value);
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
        catch (OverflowException) { throw ApiException.Invalid("Formula numeric overflow."); }
    }
    private void ValidateFormula(FormulaRequest request)
    {
        Validate(() =>
        {
            DocumentRules.Text(request.Name, 200, true);
            var definition = request.Definition;
            if (definition?.Inputs is null || definition.Inputs.Count > limits.Formula.MaximumGraphNodes || !Enum.IsDefined(definition.OutputUnit))
                throw new TrainingValidationException("Invalid formula declaration.");
            foreach (var (name, unit) in definition.Inputs)
                if (!System.Text.RegularExpressions.Regex.IsMatch(name, "\\A[A-Za-z_][A-Za-z0-9_]{0,79}\\z") || !Enum.IsDefined(unit))
                    throw new TrainingValidationException("Invalid input declaration.");
            Engine.Validate(definition.Expression, definition.Inputs, definition.OutputUnit);
        });
    }
    private async Task<TrainingFormula> FormulaOwnerAsync(Guid id, AccountIdentity account, CancellationToken ct) => await db.Formulas.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct) ?? throw ApiException.NotFound();
    private async Task<FormulaDto> FormulaDtoAsync(TrainingFormula formula, int version, CancellationToken ct) => new(formula.Id, formula.Name, version, formula.Archived, (await db.FormulaVersions.AsNoTracking().SingleOrDefaultAsync(x => x.FormulaId == formula.Id && x.Version == version, ct) ?? throw ApiException.NotFound()).Definition);
    private async Task ApplyFolderAsync(TrainingFolder folder, FolderRequest request, AccountIdentity account, CancellationToken ct)
    {
        Validate(() => DocumentRules.Text(request.Name, 200, true));
        if (request.Position < 0)
            throw ApiException.Invalid("Folder position must be nonnegative.");
        await FolderAvailableAsync(request.ParentId, account, ct);
        var parents = await db.Folders.Where(x => x.WorkspaceId == account.WorkspaceId && x.OwnerId == account.UserId).ToDictionaryAsync(x => x.Id, x => x.ParentId, ct);
        Validate(() => FolderRules.ValidateMove(folder.Id, request.ParentId, parents, limits.MaximumFolderDepth));
        folder.Name = request.Name.Trim();
        folder.ParentId = request.ParentId;
        folder.Position = request.Position;
    }
    private async Task FolderAvailableAsync(Guid? id, AccountIdentity account, CancellationToken ct)
    {
        if (id != null && !await db.Folders.AnyAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct))
            throw ApiException.NotFound();
    }
    private async Task<TrainingPlan> PlanAsync(Guid id, AccountIdentity account, CancellationToken ct) => await db.Plans.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId, ct) ?? throw ApiException.NotFound();
    private async Task<AccountIdentity> ReadAsync(CancellationToken ct)
    {
        var account = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.programs.read", ct);
        return account;
    }
    private Task TemplateAccessAsync(DocumentKind kind, CancellationToken ct) => kind == DocumentKind.Template ? access.RequireAsync("training.templates.manage", ct) : Task.CompletedTask;
    private async Task<T> WriteAsync<T>(string feature, Func<AccountIdentity, Task<T>> action, CancellationToken ct)
    {
        var account = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync(feature, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({account.WorkspaceId.ToString()}, 7105))", ct);
        try
        {
            var result = await action(account);
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
        catch (DbUpdateConcurrencyException) { throw new ApiException(412, "VERSION_CONFLICT", "Resource changed; reload and retry."); }
    }
    private static void CheckVersion(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "Resource changed; reload and retry.");
    }
    private static void Active(TrainingPlan plan)
    {
        if (plan.Archived)
            throw ApiException.Conflict("Document is archived.");
    }
    private static void Validate(Action action)
    {
        try
        {
            action();
        }
        catch (TrainingValidationException e) { throw ApiException.Invalid(e.Message); }
    }
    private static void Pagination(int page, int pageSize)
    {
        if (page is < 1 or > 1000000 || pageSize is < 1 or > 100)
            throw ApiException.Invalid("Invalid pagination; pageSize must be 1 to 100.");
    }
    private static void Limit(bool allowed, string message)
    {
        if (!allowed)
            throw new ApiException(409, "LIMIT_EXCEEDED", message);
    }
    private static void ValidateKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128 || key.Any(char.IsControl))
            throw ApiException.Invalid("Idempotency-Key is required, up to 128 characters.");
    }
    private static string Hash<T>(T value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(TrainingJson.Serialize(value))));
    private static void SameHash(string actual, string expected)
    {
        if (actual != expected)
            throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different request.");
    }
    private static PlanDto Dto(TrainingPlan p) => new(p.Id, p.Name, p.Description, p.Kind, p.FolderId, p.Archived, p.Version, p.UpdatedAt, p.Draft);
    private static RevisionDto Dto(TrainingRevision r) => new(r.Id, r.Number, r.DraftVersion, r.PublishedAt, r.Snapshot);
    private static FolderDto Dto(TrainingFolder f) => new(f.Id, f.Name, f.ParentId, f.Position, f.Version);
}
