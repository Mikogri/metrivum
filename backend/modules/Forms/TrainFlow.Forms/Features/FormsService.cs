using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Forms.Contracts;
using TrainFlow.Forms.Domain;
using TrainFlow.Forms.Infrastructure;

namespace TrainFlow.Forms.Features;

public sealed record FormTemplateRequest(FormPurpose Purpose, string Name, string Description, FormDefinition Draft);
public sealed record DuplicateFormRequest(string IdempotencyKey);
public sealed record FormTemplateDto(Guid Id, Guid CoachId, FormPurpose Purpose, string Name, string Description,
    FormDefinition Draft, Guid? CurrentPublishedVersionId, bool Archived, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, long Version);
public sealed record FormListDto(IReadOnlyList<FormTemplateDto> Items, int Page, int PageSize, int Total);

public sealed class FormsService(FormsDbContext db, IAccountContext accounts, IFeatureAccessService access, TimeProvider clock, ModuleTransaction transaction) : IFormLibrary
{
    public async Task<FormListDto> ListAsync(int page, int pageSize, FormPurpose purpose, bool archived, string? search, string sort, CancellationToken ct)
    {
        await Authorize(purpose, ct);
        if (page < 1 || page > 100000 || pageSize is < 1 or > 100 || search?.Length > 200 || sort is not ("updated" or "name"))
            throw ApiException.Invalid("Invalid form list query.");
        var query = db.Templates.AsNoTracking().Where(x => x.CoachId == accounts.UserId && x.Purpose == purpose && x.Archived == archived);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x => x.Name.ToLower().Contains(term));
        }
        var total = await query.CountAsync(ct);
        var ordered = sort == "name" ? query.OrderBy(x => x.Name).ThenBy(x => x.Id) : query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id);
        return new((await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct)).Select(Dto).ToArray(), page, pageSize, total);
    }
    public async Task<FormTemplateDto> DetailAsync(Guid id, CancellationToken ct) => Dto(await Owned(id, ct));
    public async Task<FormTemplateDto> CreateAsync(FormTemplateRequest request, CancellationToken ct)
    {
        await Authorize(request.Purpose, ct);
        FormRules.ValidateDefinition(request.Purpose, request.Name, request.Description, request.Draft);
        return await transaction.RunAsync(async token => { var t = New(request); db.Templates.Add(t); await db.SaveChangesAsync(token); return Dto(t); }, ct);
    }
    public Task<FormTemplateDto> UpdateAsync(Guid id, FormTemplateRequest request, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock("template:" + id, token);
        var t = await Owned(id, token);
        Check(t, expected);
        if (t.Archived)
            throw ApiException.Conflict("Archived forms cannot be edited.");
        if (t.Purpose != request.Purpose)
            throw ApiException.Invalid("Form purpose is immutable.");
        FormRules.ValidateDefinition(request.Purpose, request.Name, request.Description, request.Draft);
        t.Name = request.Name.Trim();
        t.Description = request.Description;
        t.Draft = JsonSerializer.Serialize(request.Draft);
        Touch(t);
        await db.SaveChangesAsync(token);
        return Dto(t);
    }, ct);
    public Task<FormTemplateDto> PublishAsync(Guid id, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock("template:" + id, token);
        var t = await Owned(id, token);
        var retry = await db.Versions.AsNoTracking().SingleOrDefaultAsync(x => x.TemplateId == id && x.DraftVersion == expected, token);
        if (retry is not null && t.Version == expected + 1 && t.CurrentPublishedVersionId == retry.Id)
            return Dto(t);
        Check(t, expected);
        if (t.Archived)
            throw ApiException.Conflict("Archived forms cannot be published.");
        var definition = JsonSerializer.Deserialize<FormDefinition>(t.Draft)!;
        FormRules.ValidateDefinition(t.Purpose, t.Name, t.Description, definition);
        var number = (await db.Versions.Where(x => x.TemplateId == id).Select(x => (int?)x.Number).MaxAsync(token) ?? 0) + 1;
        var version = new FormVersion { Id = Guid.NewGuid(), TemplateId = id, CoachId = t.CoachId, Purpose = t.Purpose, Name = t.Name, Description = t.Description, Definition = t.Draft, Number = number, DraftVersion = expected, PublishedAt = clock.GetUtcNow() };
        db.Versions.Add(version);
        await db.SaveChangesAsync(token);
        t.CurrentPublishedVersionId = version.Id;
        Touch(t);
        await db.SaveChangesAsync(token);
        return Dto(t);
    }, ct);
    public Task<FormTemplateDto> ArchiveAsync(Guid id, bool archived, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        await Lock("template:" + id, token);
        var t = await Owned(id, token);
        if (t.Archived == archived && t.Version == expected + 1)
            return Dto(t);
        Check(t, expected);
        if (t.Archived != archived)
        {
            t.Archived = archived;
            Touch(t);
            await db.SaveChangesAsync(token);
        }
        return Dto(t);
    }, ct);
    public Task<FormTemplateDto> DuplicateAsync(Guid id, string key, long expected, CancellationToken ct) => transaction.RunAsync(async token =>
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100)
            throw ApiException.Invalid("A bounded idempotency key is required.");
        await Lock("template:" + id, token);
        var source = await Owned(id, token);
        var operation = await db.Operations.AsNoTracking().SingleOrDefaultAsync(x => x.SourceTemplateId == id && x.Key == key, token);
        if (operation is not null)
        {
            if (operation.SourceVersion != expected)
                throw ApiException.Conflict("Idempotency key was used with another version.");
            return Dto(await Owned(operation.ResultTemplateId, token));
        }
        Check(source, expected);
        var copy = New(new(source.Purpose, source.Name, source.Description, JsonSerializer.Deserialize<FormDefinition>(source.Draft)!));
        db.Templates.Add(copy);
        db.Operations.Add(new()
        {
            SourceTemplateId = id,
            Key = key,
            SourceVersion = expected,
            ResultTemplateId = copy.Id
        });
        await db.SaveChangesAsync(token);
        return Dto(copy);
    }, ct);
    public async Task<FormVersionDto> OwnedVersionAsync(Guid id, CancellationToken ct)
    {
        var version = await GetVersionAsync(id, ct);
        await Owned(version.TemplateId, ct);
        return version;
    }
    public async Task<FormVersionDto> GetVersionAsync(Guid id, CancellationToken cancellationToken) => VersionDto(await db.Versions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw ApiException.NotFound());
    public async Task<FormVersionDto> RequireUsableVersionAsync(Guid id, Guid coachId, FormPurpose purpose, CancellationToken cancellationToken)
    {
        var version = await GetVersionAsync(id, cancellationToken);
        if (version.CoachId != coachId || version.Purpose != purpose)
            throw ApiException.NotFound();
        if (!await db.Templates.AsNoTracking().AnyAsync(x => x.Id == version.TemplateId && !x.Archived, cancellationToken))
            throw ApiException.Conflict("Archived forms cannot be used for new offers or assignments.");
        return version;
    }
    public async Task<IReadOnlyDictionary<Guid, FormVersionDto>> GetVersionsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken)
    {
        if (ids.Count > 1000)
            throw ApiException.Invalid("Version batch exceeds 1000 identifiers.");
        return (await db.Versions.AsNoTracking().Where(x => ids.Contains(x.Id)).ToArrayAsync(cancellationToken)).ToDictionary(x => x.Id, VersionDto);
    }
    public async Task<FormVersionDto> GetCurrentVersionAsync(Guid templateId, CancellationToken cancellationToken)
    {
        var template = await db.Templates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == templateId && !x.Archived, cancellationToken) ?? throw ApiException.NotFound();
        return template.CurrentPublishedVersionId is { } version ? await GetVersionAsync(version, cancellationToken) : throw ApiException.Conflict("The form has no published version.");
    }
    public async Task ValidateAsync(Guid versionId, IReadOnlyDictionary<string, JsonElement> answers, CancellationToken cancellationToken) => FormRules.ValidateAnswers((await GetVersionAsync(versionId, cancellationToken)).Definition, answers);
    public Task<FormSubmissionDto> SubmitAsync(FormSubmissionCommand command, CancellationToken cancellationToken) => transaction.RunAsync(async ct =>
    {
        if (command.RespondentId == Guid.Empty || string.IsNullOrWhiteSpace(command.SourceKey) || command.SourceKey.Length > 200)
            throw ApiException.Invalid("A respondent and bounded source key are required.");
        var version = await GetVersionAsync(command.FormVersionId, ct);
        FormRules.ValidateAnswers(version.Definition, command.Answers);
        var answers = FormRules.CanonicalAnswers(command.Answers);
        await Lock("submission:" + command.SourceKey, ct);
        var existing = await db.Submissions.AsNoTracking().SingleOrDefaultAsync(x => x.SourceKey == command.SourceKey, ct);
        if (existing is not null)
        {
            if (existing.FormVersionId != command.FormVersionId || existing.RespondentId != command.RespondentId || FormRules.CanonicalAnswers(JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(existing.Answers)!) != answers)
                throw ApiException.Conflict("Submission source key is already bound to another response.");
            return SubmissionDto(existing);
        }
        var submission = new FormSubmission { Id = Guid.NewGuid(), FormVersionId = command.FormVersionId, RespondentId = command.RespondentId, SourceKey = command.SourceKey, Answers = answers, SubmittedAt = clock.GetUtcNow() };
        db.Submissions.Add(submission);
        await db.SaveChangesAsync(ct);
        return SubmissionDto(submission);
    }, cancellationToken);
    public async Task<FormSubmissionDto> GetSubmissionAsync(Guid id, CancellationToken cancellationToken) => SubmissionDto(await db.Submissions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw ApiException.NotFound());
    private async Task<FormTemplate> Owned(Guid id, CancellationToken ct)
    {
        var t = await db.Templates.SingleOrDefaultAsync(x => x.Id == id && x.CoachId == accounts.UserId, ct) ?? throw ApiException.NotFound();
        await db.Entry(t).ReloadAsync(ct);
        await Authorize(t.Purpose, ct);
        return t;
    }
    private async Task Authorize(FormPurpose purpose, CancellationToken ct)
    {
        if (!Enum.IsDefined(purpose))
            throw ApiException.Invalid("Unknown form purpose.");
        await accounts.RequireCoachAsync(ct);
        await access.RequireAsync(purpose == FormPurpose.Application ? "forms.application.manage" : "forms.checkin.manage", ct);
    }
    private FormTemplate New(FormTemplateRequest r) => new() { Id = Guid.NewGuid(), CoachId = accounts.UserId, Purpose = r.Purpose, Name = r.Name.Trim(), Description = r.Description, Draft = JsonSerializer.Serialize(r.Draft), CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
    private void Touch(FormTemplate t)
    {
        t.Version++;
        t.UpdatedAt = clock.GetUtcNow();
    }
    private static void Check(FormTemplate t, long expected)
    {
        if (t.Version != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "The form changed. Reload and retry.");
    }
    private Task Lock(string key, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"forms:" + key}, 0))", ct);
    private static FormTemplateDto Dto(FormTemplate t) => new(t.Id, t.CoachId, t.Purpose, t.Name, t.Description, JsonSerializer.Deserialize<FormDefinition>(t.Draft)!, t.CurrentPublishedVersionId, t.Archived, t.CreatedAt, t.UpdatedAt, t.Version);
    private static FormVersionDto VersionDto(FormVersion v) => new(v.Id, v.TemplateId, v.CoachId, v.Purpose, v.Name, v.Description, JsonSerializer.Deserialize<FormDefinition>(v.Definition)!, v.Number, v.PublishedAt);
    private static FormSubmissionDto SubmissionDto(FormSubmission s) => new(s.Id, s.FormVersionId, s.RespondentId, s.SourceKey, JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(s.Answers)!, s.SubmittedAt);
}
