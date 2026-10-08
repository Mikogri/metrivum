using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.ClientDocumentation.Contracts;
using TrainFlow.ClientDocumentation.Infrastructure;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Media.Contracts;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.ClientDocumentation;

public sealed class DocumentationService(DocumentationDbContext db, IAccountContext account, IRelationshipRecipients relationships,
    IRelationshipAccessPolicy policy, IFeatureAccessService features, IDocumentMedia media, TimeProvider clock,
    INotificationPublisher? notifications = null, ModuleTransaction? transaction = null, ITeamCaseAccess? teamCases = null) : INotificationDeliveryPolicy
{
    public string SourceModule => "ClientDocumentation";
    public static readonly MeasurementDefinition[] Definitions = [
        new("weight", "Body weight", ["kg", "lb"]), new("height", "Height", ["cm", "in"]),
        new("waist", "Waist circumference", ["cm", "in"]), new("arm", "Arm circumference", ["cm", "in"]),
        new("body-fat", "Body fat estimate", ["%"])
    ];

    private async Task<(RelationshipRecipient Relationship, bool Coach)> Authorize(Guid id, bool write, bool coachOnly, CancellationToken ct)
    {
        var relationship = await relationships.GetAsync(id, ct) ?? throw ApiException.NotFound();
        var coach = relationship.CoachId == account.UserId;
        if (!coach && (coachOnly || relationship.ClientId != account.UserId))
            throw ApiException.NotFound();
        var decision = await policy.DecideAsync(id, write ? RelationshipOperation.ProtectedWrite : RelationshipOperation.HistoricalSharedRead, ct);
        if (!decision.Allowed)
            throw new ApiException(decision.Reason == "RESOURCE_NOT_FOUND" ? 404 : 403, decision.Reason, "This relationship does not permit documentation access.");
        await features.RequireAsync(coach ? "coaching.documentation.manage" : "coaching.documentation.view-shared", ct);
        return (relationship, coach);
    }
    public async Task<DocumentationAccess> Access(Guid id, CancellationToken ct)
    {
        var (r, coach) = await Authorize(id, false, false, ct);
        return new(r.Status.ToString(), coach, r.Status == RelationshipStatus.Active ? coach ? ["measure", "create", "upload", "notes"] : ["measure", "create", "upload"] : []);
    }
    private static void Page(int page, int size)
    {
        if (page is < 1 or > 100000 || size is < 1 or > 100)
            throw ApiException.Invalid("Invalid pagination.");
    }
    private static void Range(DateTimeOffset from, DateTimeOffset to)
    {
        if (to < from || to - from > TimeSpan.FromDays(366))
            throw ApiException.Invalid("Choose a date range of up to 366 days.");
    }
    private static string Text(string? value, int max, string field, bool required = false)
    {
        var text = value?.Trim() ?? "";
        if (text.Length > max || required && text.Length == 0)
            throw ApiException.Invalid($"{field} must contain {(required ? "1" : "0")} to {max} characters.");
        return text;
    }
    private void Observed(DateTimeOffset value)
    {
        if (value > clock.GetUtcNow().AddMinutes(5) || value < new DateTimeOffset(1900, 1, 1, 0, 0, 0, TimeSpan.Zero))
            throw ApiException.Invalid("Use a valid observed date that is not in the future.");
    }
    private static void Version(long actual, long expected)
    {
        if (actual != expected)
            throw new ApiException(412, "VERSION_CONFLICT", "This entry changed. Reload before saving again.");
    }
    private async Task Save(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException) { throw new ApiException(412, "VERSION_CONFLICT", "This entry changed. Reload before saving again."); }
    }
    public async Task<MeasurementDto> AddMeasurement(Guid id, MeasurementInput input, CancellationToken ct)
    {
        var (_, coach) = await Authorize(id, true, false, ct);
        var definition = Definitions.SingleOrDefault(x => x.Key == input.Key);
        if (definition == null || !definition.Units.Contains(input.Unit) || input.Value < 0 || input.Value > 100000 || input.Key == "body-fat" && input.Value > 100)
            throw ApiException.Invalid("Choose a supported measurement and compatible unit with a valid nonnegative value.");
        Observed(input.ObservedAt);
        var row = new MeasurementRecord { Id = Guid.NewGuid(), RelationshipId = id, AuthorId = account.UserId, Source = coach ? "Coach" : "Client", Key = input.Key, Unit = input.Unit, Value = input.Value, ObservedAt = input.ObservedAt.ToUniversalTime(), Comment = Text(input.Comment, 2000, "Comment"), CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
        db.Measurements.Add(row);
        await Save(ct);
        return Measurement(row);
    }
    private static MeasurementDto Measurement(MeasurementRecord x) => new(x.Id, x.RelationshipId, x.Key, x.Unit, x.Value, x.ObservedAt, x.Comment, x.AuthorId, x.Source, x.CreatedAt);
    public async Task<DocumentationPage<MeasurementDto>> Measurements(Guid id, DateTimeOffset from, DateTimeOffset to, int page, int size, CancellationToken ct)
    {
        await Authorize(id, false, false, ct);
        Page(page, size);
        Range(from, to);
        from = from.ToUniversalTime();
        to = to.ToUniversalTime();
        var query = db.Measurements.AsNoTracking().Where(x => x.RelationshipId == id && x.ObservedAt >= from && x.ObservedAt <= to);
        var count = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.ObservedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows.Select(Measurement).ToArray(), page, size, count);
    }
    public async Task<MeasurementTrend> Trend(Guid id, string key, string unit, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        await Authorize(id, false, false, ct);
        Range(from, to);
        from = from.ToUniversalTime();
        to = to.ToUniversalTime();
        if (!Definitions.Any(x => x.Key == key && x.Units.Contains(unit)))
            throw ApiException.Invalid("Choose a compatible measurement unit.");
        // One daily average per typed key, converted in SQL, so payload is bounded by the requested date range.
        var mass = key == "weight";
        var targetFactor = unit == "lb" ? 0.45359237m : unit == "in" ? 2.54m : 1m;
        var points = await db.Measurements.AsNoTracking().Where(x => x.RelationshipId == id && x.Key == key && x.ObservedAt >= from && x.ObservedAt <= to)
            .GroupBy(x => new { x.ObservedAt.Year, x.ObservedAt.Month, x.ObservedAt.Day }).OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month).ThenBy(g => g.Key.Day)
            .Select(g => new { Date = g.Key, Value = g.Average(x => x.Value * (mass && x.Unit == "lb" ? 0.45359237m : !mass && x.Unit == "in" ? 2.54m : 1m) / targetFactor) }).ToListAsync(ct);
        return new(key, unit, points.Select(x => new MeasurementPoint(new DateTimeOffset(x.Date.Year, x.Date.Month, x.Date.Day, 0, 0, 0, TimeSpan.Zero), x.Value)).ToArray());
    }
    public async Task<DocumentationPage<NoteDto>> Notes(Guid id, string? search, int page, int size, CancellationToken ct)
    {
        await Authorize(id, false, true, ct);
        Page(page, size);
        var filter = Text(search, 200, "Search");
        var query = db.Notes.AsNoTracking().Where(x => x.RelationshipId == id);
        if (filter.Length > 0)
            query = query.Where(x => x.Text.Contains(filter));
        var count = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new NoteDto(x.Id, x.Text, x.CreatedAt, x.UpdatedAt, x.Version)).ToListAsync(ct);
        return new(rows, page, size, count);
    }
    public async Task<NoteDto> SaveNote(Guid id, Guid? noteId, NoteInput input, long version, CancellationToken ct)
    {
        await Authorize(id, true, true, ct);
        var text = Text(input.Text, 20000, "Note", true);
        var row = noteId.HasValue ? await db.Notes.SingleOrDefaultAsync(x => x.Id == noteId && x.RelationshipId == id, ct) ?? throw ApiException.NotFound() : new PrivateCoachNote { Id = Guid.NewGuid(), RelationshipId = id, AuthorId = account.UserId, CreatedAt = clock.GetUtcNow() };
        if (noteId.HasValue)
        {
            Version(row.Version, version);
            row.Version++;
        }
        else
            db.Notes.Add(row);
        row.Text = text;
        row.UpdatedAt = clock.GetUtcNow();
        await Save(ct);
        return new(row.Id, row.Text, row.CreatedAt, row.UpdatedAt, row.Version);
    }
    private IQueryable<RelationshipDocument> Visible(Guid id, bool coach) => db.Documents.Where(x => x.RelationshipId == id && (coach || x.Visibility == "SharedWithClient"));
    private DocumentDto Document(RelationshipDocument x, bool coach, bool active) => new(x.Id, x.RelationshipId, x.Title, x.Description, x.Category, x.Visibility, x.Text, x.ContentType, x.MediaId.HasValue, x.AuthorId, x.Source, x.ObservedAt, x.CreatedAt, x.UpdatedAt, x.Version, active ? coach ? ["edit", "share"] : x.AuthorId == account.UserId ? ["edit"] : [] : []);
    public async Task<DocumentationPage<DocumentDto>> Documents(Guid id, string? search, string? category, int page, int size, CancellationToken ct)
    {
        var (r, coach) = await Authorize(id, false, false, ct);
        Page(page, size);
        var filter = Text(search, 200, "Search");
        Text(category, 60, "Category");
        var query = Visible(id, coach).AsNoTracking();
        if (filter.Length > 0)
            query = query.Where(x => x.Title.Contains(filter));
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(x => x.Category == category);
        var count = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.ObservedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows.Select(x => Document(x, coach, r.Status == RelationshipStatus.Active)).ToArray(), page, size, count);
    }
    private void DocumentFields(RelationshipDocument row, DocumentEdit input)
    {
        row.Title = Text(input.Title, 200, "Title", true);
        row.Description = Text(input.Description, 2000, "Description");
        row.Category = Text(input.Category, 60, "Category", true);
        Observed(input.ObservedAt);
        row.ObservedAt = input.ObservedAt.ToUniversalTime();
        if (row.MediaId.HasValue && input.Text != null)
            throw ApiException.Invalid("Files cannot also contain editable text.");
        row.Text = row.MediaId.HasValue ? null : Text(input.Text, 50000, "Document text", true);
        row.UpdatedAt = clock.GetUtcNow();
    }
    private static void Visibility(string value)
    {
        if (value is not ("CoachPrivate" or "SharedWithClient"))
            throw ApiException.Invalid("Unknown visibility.");
    }
    public Task<DocumentDto> AddDocument(Guid id, DocumentInput input, CancellationToken ct) => transaction == null ? AddDocumentCore(id, input, ct) : transaction.RunAsync(token => AddDocumentCore(id, input, token), ct);
    private async Task<DocumentDto> AddDocumentCore(Guid id, DocumentInput input, CancellationToken ct)
    {
        var (r, coach) = await Authorize(id, true, false, ct);
        Visibility(input.Visibility);
        if (!coach && input.Visibility != "SharedWithClient")
            throw ApiException.Invalid("Client-provided material is shared with the relationship coach.");
        var row = new RelationshipDocument { Id = Guid.NewGuid(), RelationshipId = id, AuthorId = account.UserId, Source = coach ? "Coach" : "Client", Visibility = input.Visibility, MediaId = input.MediaId, CreatedAt = clock.GetUtcNow() };
        DocumentFields(row, new(input.Title, input.Description, input.Category, input.Text, input.ObservedAt));
        if (input.MediaId.HasValue)
        {
            var file = await media.RequireDocumentAsync(id, account.UserId, input.MediaId.Value, ct);
            if (await db.Documents.AnyAsync(x => x.MediaId == input.MediaId, ct))
                throw ApiException.Conflict("This file is already attached to a document.");
            row.ContentType = file.ContentType;
            if (input.Category == "ProgressPhoto" && !file.ContentType.StartsWith("image/", StringComparison.Ordinal))
                throw ApiException.Invalid("Progress photos require an image file.");
            await media.PinDocumentAsync(id, account.UserId, input.MediaId.Value, ct);
        }
        else if (input.Category == "ProgressPhoto")
            throw ApiException.Invalid("Progress photos require an image file.");
        db.Documents.Add(row);
        await Save(ct);
        await Notify(row, r, coach, ct);
        return Document(row, coach, true);
    }
    public async Task<DocumentDto> EditDocument(Guid id, Guid documentId, DocumentEdit input, long version, CancellationToken ct)
    {
        var (_, coach) = await Authorize(id, true, false, ct);
        var row = await Visible(id, coach).SingleOrDefaultAsync(x => x.Id == documentId, ct) ?? throw ApiException.NotFound();
        if (!coach && row.AuthorId != account.UserId)
            throw ApiException.NotFound();
        Version(row.Version, version);
        DocumentFields(row, input);
        if (row.Category == "ProgressPhoto" && (row.ContentType == null || !row.ContentType.StartsWith("image/", StringComparison.Ordinal)))
            throw ApiException.Invalid("Progress photos require an image file.");
        row.Version++;
        await Save(ct);
        return Document(row, coach, true);
    }
    public Task<DocumentDto> Share(Guid id, Guid documentId, VisibilityInput input, long version, CancellationToken ct) => transaction == null ? ShareCore(id, documentId, input, version, ct) : transaction.RunAsync(token => ShareCore(id, documentId, input, version, token), ct);
    private async Task<DocumentDto> ShareCore(Guid id, Guid documentId, VisibilityInput input, long version, CancellationToken ct)
    {
        var (r, _) = await Authorize(id, true, true, ct);
        Visibility(input.Visibility);
        var row = await Visible(id, true).SingleOrDefaultAsync(x => x.Id == documentId, ct) ?? throw ApiException.NotFound();
        Version(row.Version, version);
        if (row.Visibility == input.Visibility)
            return Document(row, true, true);
        row.Visibility = input.Visibility;
        row.Version++;
        row.UpdatedAt = clock.GetUtcNow();
        await Save(ct);
        await Notify(row, r, true, ct);
        return Document(row, true, true);
    }
    private Task Notify(RelationshipDocument row, RelationshipRecipient r, bool coach, CancellationToken ct) => notifications == null || row.Visibility != "SharedWithClient" ? Task.CompletedTask : notifications.PublishAsync(new(coach ? r.ClientId : r.CoachId, $"documentation:{row.Id}:{row.Version}", "documentation.shared", "Coaching", SourceModule, row.Id, coach ? $"/app/my-coaches/{r.Id}/documents" : $"/app/clients/{r.Id}?tab=documentation"), ct);
    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        var row = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == notification.SourceId && x.Visibility == "SharedWithClient", ct);
        if (row == null)
            return false;
        var r = await relationships.GetAsync(row.RelationshipId, ct);
        if (r?.TeamClientCaseId is { } caseId && r.CoachId == notification.RecipientUserId)
            return teamCases != null && (await teamCases.DecideAsync(caseId, notification.RecipientUserId, false, ct)).Allowed;
        return r != null && (r.CoachId == notification.RecipientUserId || r.ClientId == notification.RecipientUserId && r.Status is RelationshipStatus.Active or RelationshipStatus.Completed);
    }
    public async Task<DocumentUpload> Upload(Guid id, DocumentationUploadInput input, CancellationToken ct)
    {
        await Authorize(id, true, false, ct);
        return await media.CreateDocumentUploadAsync(id, account.UserId, input.Name, input.ContentType, input.Size, ct);
    }
    public async Task FinalizeUpload(Guid id, Guid mediaId, CancellationToken ct)
    {
        await Authorize(id, true, false, ct);
        await media.FinalizeDocumentUploadAsync(id, account.UserId, mediaId, ct);
    }
    public async Task<DocumentReadUrl> ReadFile(Guid id, Guid documentId, CancellationToken ct)
    {
        var (_, coach) = await Authorize(id, false, false, ct);
        var row = await Visible(id, coach).AsNoTracking().SingleOrDefaultAsync(x => x.Id == documentId && x.MediaId != null, ct) ?? throw ApiException.NotFound();
        return await media.ReadDocumentAsync(id, row.AuthorId, row.MediaId!.Value, ct);
    }
}
