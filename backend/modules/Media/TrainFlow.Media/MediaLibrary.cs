using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media.Contracts;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.Media;

public sealed record UploadRequest(string Name, string ContentType, long Size);
public sealed record MediaDto(Guid Id, string Name, string ContentType, long Size, string State, bool Pinned, DateTimeOffset CreatedAt, long Version, long? DurationMs = null);
public sealed record UploadTicket(MediaDto File, string UploadUrl, DateTimeOffset ExpiresAt, string Method = "PUT");
public sealed record MediaReadTicket(string Url, DateTimeOffset ExpiresAt);

public sealed partial class MediaLibrary(MediaDbContext db, IPrivateObjectStorage storage, IOptions<StorageOptions> configured,
    IOptions<MediaQuotaOptions>? quotaOptions = null, IAbuseProtection? abuse = null) : IMediaLibrary, IDocumentMedia
{
    private readonly StorageOptions options = configured.Value;
    private readonly MediaQuotaOptions quotas = quotaOptions?.Value ?? new();
    /// <summary>Files owned by a workflow (relationship documentation, coach portfolio): never reachable through the generic media endpoints.</summary>
    private static bool WorkflowOwned(string purpose) => purpose is "Documentation" or "Portfolio";
    private static MediaDto Dto(MediaFile file) => new(file.Id, file.Name, file.ContentType, file.Size, file.State, file.Pinned, file.CreatedAt, file.Version, file.DurationMs);
    public async Task<MediaDto> GetAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (WorkflowOwned(file.Purpose))
            throw ApiException.NotFound();
        return Dto(file);
    }

    public async Task<MediaDto> GetMessagingAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (file.Purpose != "Messaging")
            throw ApiException.NotFound();
        return Dto(file);
    }
    public async Task<MediaDto> FinalizeMessagingAsync(Guid id, Guid owner, CancellationToken ct)
    {
        await GetMessagingAsync(id, owner, ct);
        return await FinalizeAsync(id, owner, ct);
    }
    public async Task DeleteMessagingAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        await GetMessagingAsync(id, owner, ct);
        await DeleteAsync(id, owner, version, ct);
    }

    public Task<UploadTicket> CreateAsync(Guid owner, UploadRequest input, CancellationToken ct) => CreateCoreAsync(owner, input, false, ct);
    public Task<UploadTicket> CreateMessagingAsync(Guid owner, UploadRequest input, CancellationToken ct) => CreateCoreAsync(owner, input, true, ct);
    private async Task<UploadTicket> CreateCoreAsync(Guid owner, UploadRequest input, bool messaging, CancellationToken ct, Guid? documentationRelationship = null, bool portfolio = false)
    {
        if (messaging && !options.AllowedAttachmentTypes.Contains(input.ContentType, StringComparer.Ordinal))
            throw ApiException.Invalid("This attachment type is not enabled.");
        var extension = messaging ? AttachmentValidation.Extension(input.ContentType) : VideoFileValidation.Extension(input.ContentType);
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200 || input.Size <= 0 || input.Size > (messaging ? options.MaxAttachmentBytes : options.AcceptedVideoBytes))
            throw ApiException.Invalid("Provide a name of up to 200 characters and a file within the configured size limit.");
        abuse?.Require(owner, AbusePolicies.UploadStart);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // All admissions share this lock: pending signed capabilities reserve their maximum physical footprint.
        // ponytail: serializes upload admission only; use a locked aggregate counter if this query becomes costly.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(743165208914)", ct);
        var lockKey = "media-upload:" + owner;
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
        var now = DateTimeOffset.UtcNow;
        var hour = now.AddHours(-1);
        var day = now.AddDays(-1);
        if (await db.Files.CountAsync(x => x.OwnerId == owner && x.CreatedAt > hour, ct) >= quotas.UploadStartsPerHour)
            throw QuotaExceeded("upload-start");
        var physicalReservation = Math.Max(options.MaxVideoBytes, options.MaxAttachmentBytes);
        // Unaccepted capabilities can upload the bucket maximum regardless of the declared size.
        // Keep that liability charged after failure/deletion; only server-verified acceptance settles it to actual bytes.
        var daily = await db.Files.Where(x => x.OwnerId == owner &&
            (x.CreatedAt > day || x.AcceptedAt > day || (x.State != "Deleted" && x.State != "Ready" && x.UploadExpiresAt > now)))
            .SumAsync(x => (long?)(x.AcceptedAt != null ? x.Size : Math.Max(x.Size, x.ReservedStorageBytes)), ct) ?? 0;
        if (physicalReservation > quotas.DailyBytes - daily)
            throw QuotaExceeded("upload-bytes");
        var global = await db.Files.Where(x => x.State != "Deleted")
            .SumAsync(x => (long?)(x.ReservedStorageBytes > 0 ? x.ReservedStorageBytes : x.Size), ct) ?? 0;
        var usage = (double)(global + physicalReservation) / quotas.GlobalStorageBytes;
        MediaQuotaMetrics.StorageUsage.Record(usage);
        if (usage >= quotas.StorageAlertPercent / 100d)
            MediaQuotaMetrics.StorageAlerts.Add(1);
        if (physicalReservation > quotas.GlobalStorageBytes - global)
            throw QuotaExceeded("storage-global");
        // Deletion cannot revoke an issued upload URL; retain its reservation until the capability expires.
        if (await db.Files.CountAsync(x => x.OwnerId == owner && (x.State == "Pending" || x.State == "Deleting") && x.UploadExpiresAt > now, ct) >= options.AcceptedPendingUploads)
            throw QuotaExceeded("upload-concurrent");
        var file = new MediaFile
        {
            Id = Guid.NewGuid(),
            OwnerId = owner,
            Name = input.Name.Trim(),
            Purpose = documentationRelationship.HasValue ? "Documentation" : portfolio ? "Portfolio" : messaging ? "Messaging" : "Video",
            Bucket = options.Bucket,
            ContentType = input.ContentType,
            Size = input.Size,
            ReservedStorageBytes = physicalReservation,
            CreatedAt = now,
            UploadExpiresAt = now.AddHours(2).AddMinutes(5)
        };
        file.ObjectKey = owner.ToString("N") + (documentationRelationship.HasValue ? $"/documentation/{documentationRelationship:N}/" : portfolio ? "/portfolio/" : messaging ? "/attachments/" : "/videos/") + file.Id.ToString("N") + "." + extension;
        // Persist the reservation before issuing a transport capability. A failed signer leaves a reclaimable pending reservation.
        db.Files.Add(file);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        MediaQuotaMetrics.Reserved.Add(physicalReservation);
        var url = await storage.CreateUploadUrlAsync(file.Bucket, file.ObjectKey, ct);
        return new UploadTicket(Dto(file), url, now.AddHours(2));
    }

    private static ApiException QuotaExceeded(string policy)
    {
        MediaQuotaMetrics.Rejected.Add(1, new KeyValuePair<string, object?>("policy", policy));
        return new ApiException(429, "LIMIT_EXCEEDED", "The upload resource budget has been reached. Try again later.",
            retryAfter: TimeSpan.FromSeconds(policy switch
            {
                "upload-start" => 3600,
                "upload-bytes" => 86400,
                "upload-concurrent" => 7500,
                _ => 60
            }));
    }

    public Task<MediaDto> FinalizeAsync(Guid id, Guid owner, CancellationToken ct) => FinalizeCoreAsync(id, owner, ct);

    private async Task<MediaDto> FinalizeCoreAsync(Guid id, Guid owner, CancellationToken ct, bool workflow = false)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (WorkflowOwned(file.Purpose) && !workflow)
            throw ApiException.NotFound();
        if (file.State == "Ready")
            return Dto(file);
        if (file.State != "Pending" || file.UploadExpiresAt < DateTimeOffset.UtcNow)
            throw ApiException.Conflict("The upload is no longer pending.");
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(400, "MEDIA_FORMAT_INVALID", "Stored content type does not match the reservation.");
        var duration = await ValidateAsync(file, actual, ct);
        var acceptedAt = DateTimeOffset.UtcNow;
        var changed = await db.Files.Where(x => x.Id == id && x.OwnerId == owner && x.State == "Pending" && x.Version == file.Version)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Ready").SetProperty(x => x.DurationMs, duration)
                .SetProperty(x => x.AcceptedAt, acceptedAt)
                .SetProperty(x => x.ReservedStorageBytes, x => x.UploadExpiresAt > acceptedAt ? x.ReservedStorageBytes : actual.Size)
                .SetProperty(x => x.Version, x => x.Version + 1), ct);
        if (changed == 0)
            throw ApiException.Conflict("The file changed during finalization.");
        return Dto(file) with
        {
            State = "Ready",
            DurationMs = duration,
            Version = file.Version + 1
        };
    }

    public async Task<ReadyMedia> RequireReadyAsync(Guid id, Guid ownerId, CancellationToken cancellationToken)
    {
        var file = await RequireReadableFileAsync(id, ownerId, cancellationToken);
        return new ReadyMedia(file.Id, file.OwnerId, file.Bucket, file.ObjectKey, file.ContentType, file.Size, file.DurationMs);
    }

    private async Task<MediaFile> RequireReadableFileAsync(Guid id, Guid ownerId, CancellationToken cancellationToken)
    {
        var file = await OwnedAsync(id, ownerId, cancellationToken);
        if (WorkflowOwned(file.Purpose))
            throw ApiException.NotFound();
        if (file.State != "Ready")
            throw new ApiException(409, "MEDIA_NOT_READY", "The source file is not ready.");
        return file;
    }

    public async Task PinAsync(Guid id, Guid ownerId, CancellationToken cancellationToken)
    {
        var changed = await db.Files.Where(x => x.Id == id && x.OwnerId == ownerId && x.State == "Ready")
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Pinned, true).SetProperty(x => x.Version, x => x.Version + 1), cancellationToken);
        if (changed == 0)
            throw ApiException.NotFound();
    }

    public async Task<Stream> OpenReadAsync(Guid id, Guid ownerId, CancellationToken cancellationToken)
    {
        var file = await RequireReadableFileAsync(id, ownerId, cancellationToken);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, cancellationToken);
        await ValidateAsync(file, actual, cancellationToken);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(409, "MEDIA_FORMAT_INVALID", "Stored object content type changed.");
        return await storage.OpenReadAsync(file.Bucket, file.ObjectKey, cancellationToken);
    }

    public async Task<MediaReadUrl> ReadUrlForAsync(Guid id, Guid ownerId, Guid viewerId, CancellationToken ct)
    {
        var file = await RequireReadableFileAsync(id, ownerId, ct);
        abuse?.Require(viewerId, AbusePolicies.SignedDownload);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        await ValidateAsync(file, actual, ct);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(409, "MEDIA_FORMAT_INVALID", "Stored object content type changed.");
        return new MediaReadUrl(await storage.CreateReadUrlAsync(file.Bucket, file.ObjectKey, ct), DateTimeOffset.UtcNow.AddSeconds(options.ReadUrlSeconds));
    }

    public async Task<MediaReadTicket> ReadUrlAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var file = await RequireReadableFileAsync(id, owner, ct);
        abuse?.Require(owner, AbusePolicies.SignedDownload);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        await ValidateAsync(file, actual, ct);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(409, "MEDIA_FORMAT_INVALID", "Stored object content type changed.");
        var expiresAt = DateTimeOffset.UtcNow.AddSeconds(options.ReadUrlSeconds);
        return new MediaReadTicket(await storage.CreateReadUrlAsync(file.Bucket, file.ObjectKey, ct), expiresAt);
    }

    private async Task<long?> ValidateAsync(MediaFile file, StoredObject actual, CancellationToken ct)
    {
        if (file.Purpose is not ("Messaging" or "Documentation" or "Portfolio"))
        {
            VideoFileValidation.Validate(file.ContentType, file.Size, actual.Size, actual.Prefix, options.AcceptedVideoBytes);
            return null;
        }
        AttachmentValidation.Validate(file.ContentType, file.Size, actual, options);
        if (file.ContentType != "audio/wav")
            return null;
        await using var stream = await storage.OpenReadAsync(file.Bucket, file.ObjectKey, ct);
        return await AttachmentValidation.WavDurationAsync(stream, actual.Size, options.MaxVoiceDurationMs, ct);
    }

    public async Task ReleaseVideoAsync(Guid id, Guid ownerId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await db.Files.Where(x => x.Id == id && x.OwnerId == ownerId && x.Purpose == "Video" && x.State != "Deleting" && x.State != "Deleted")
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Pinned, false).SetProperty(x => x.State, "Deleting")
                .SetProperty(x => x.DeleteAfter, (DateTimeOffset?)now).SetProperty(x => x.Version, x => x.Version + 1), ct);
    }

    public async Task DeleteAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (file.Pinned)
            throw new ApiException(409, "MEDIA_IN_USE", "The file is retained by an analysis or message.");
        if (file.Version != version)
            throw new ApiException(412, "VERSION_CONFLICT", "The file has changed.");
        var now = DateTimeOffset.UtcNow;
        var deleteAfter = file.UploadExpiresAt > now ? file.UploadExpiresAt : now;
        var changed = await db.Files.Where(x => x.Id == id && x.OwnerId == owner && !x.Pinned && x.Version == version)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Deleting").SetProperty(x => x.DeleteAfter, deleteAfter)
                .SetProperty(x => x.Version, x => x.Version + 1), ct);
        if (changed == 0)
            throw ApiException.Conflict("The file changed or became pinned.");
    }

    private Task<MediaFile> OwnedAsync(Guid id, Guid owner, CancellationToken ct) => FindAsync(id, owner, ct);
    private async Task<MediaFile> FindAsync(Guid id, Guid owner, CancellationToken ct) =>
        await db.Files.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner && x.State != "Deleted", ct) ?? throw ApiException.NotFound();

    public async Task<IReadOnlyList<MediaDto>> ListAsync(Guid owner, string? search, string? state, string? sort, int page, int pageSize, CancellationToken ct)
    {
        if (page < 1 || page > 100000 || pageSize is < 1 or > 100 || search?.Length > 200 || state is not (null or "Pending" or "Ready" or "Deleting"))
            throw ApiException.Invalid("Invalid list filters or pagination.");
        var query = db.Files.AsNoTracking().Where(x => x.OwnerId == owner && x.State != "Deleted" && x.Purpose != "Documentation" && x.Purpose != "Portfolio");
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(x => x.Name.ToLower().Contains(search.ToLower()));
        if (state != null)
            query = query.Where(x => x.State == state);
        var ordered = sort switch
        {
            null or "newest" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
            "oldest" => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
            "name" => query.OrderBy(x => x.Name).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Unknown sort order.")
        };
        return await ordered.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new MediaDto(x.Id, x.Name, x.ContentType, x.Size, x.State, x.Pinned, x.CreatedAt, x.Version)).ToListAsync(ct);
    }

    public async Task<int> CleanupAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await db.Files.Where(x => x.State == "Pending" && x.UploadExpiresAt < now && !x.Pinned)
            .OrderBy(x => x.UploadExpiresAt).ThenBy(x => x.Id).Select(x => x.Id).Take(quotas.CleanupBatchSize).ToListAsync(ct);
        await db.Files.Where(x => expired.Contains(x.Id) && x.State == "Pending" && !x.Pinned)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Deleting").SetProperty(x => x.DeleteAfter, now).SetProperty(x => x.Version, x => x.Version + 1), ct);
        var settled = await db.Files.Where(x => x.State == "Ready" && x.UploadExpiresAt < now && x.ReservedStorageBytes > x.Size)
            .OrderBy(x => x.UploadExpiresAt).ThenBy(x => x.Id).Select(x => x.Id).Take(quotas.CleanupBatchSize).ToListAsync(ct);
        await db.Files.Where(x => settled.Contains(x.Id) && x.State == "Ready")
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.ReservedStorageBytes, x => x.Size), ct);
        var files = await db.Files.AsNoTracking().Where(x => x.State == "Deleting" && x.DeleteAfter <= now && !x.Pinned)
            .OrderBy(x => x.DeleteAfter).ThenBy(x => x.Id).Take(quotas.CleanupBatchSize).ToListAsync(ct);
        var deleted = 0;
        foreach (var file in files)
        {
            try
            {
                await storage.DeleteAsync(file.Bucket, file.ObjectKey, ct);
                deleted += await db.Files.Where(x => x.Id == file.Id && x.State == "Deleting" && !x.Pinned)
                    .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Deleted").SetProperty(x => x.Version, x => x.Version + 1), ct);
            }
            catch (ApiException)
            {
                var retry = now.AddSeconds(Math.Min(3600, 30 * Math.Pow(2, Math.Min(file.DeleteAttempts, 7))));
                await db.Files.Where(x => x.Id == file.Id && x.State == "Deleting").ExecuteUpdateAsync(update => update
                    .SetProperty(x => x.DeleteAttempts, x => x.DeleteAttempts + 1).SetProperty(x => x.DeleteAfter, retry), ct);
            }
        }
        return deleted;
    }
}
