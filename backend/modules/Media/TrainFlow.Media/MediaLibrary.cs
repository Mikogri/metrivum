using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media.Contracts;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.Media;

public sealed record UploadRequest(string Name, string ContentType, long Size);
public sealed record MediaDto(Guid Id, string Name, string ContentType, long Size, string State, bool Pinned, DateTimeOffset CreatedAt, long Version);
public sealed record UploadTicket(MediaDto File, string UploadUrl, DateTimeOffset ExpiresAt, string Method = "PUT");
public sealed record MediaReadTicket(string Url, DateTimeOffset ExpiresAt);

public sealed class MediaLibrary(MediaDbContext db, IPrivateObjectStorage storage, IOptions<StorageOptions> configured) : IMediaLibrary
{
    private readonly StorageOptions options = configured.Value;
    private static MediaDto Dto(MediaFile file) => new(file.Id, file.Name, file.ContentType, file.Size, file.State, file.Pinned, file.CreatedAt, file.Version);
    public async Task<MediaDto> GetAsync(Guid id, Guid owner, CancellationToken ct) => Dto(await OwnedAsync(id, owner, ct));

    public async Task<UploadTicket> CreateAsync(Guid owner, UploadRequest input, CancellationToken ct)
    {
        var extension = VideoFileValidation.Extension(input.ContentType);
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200 || input.Size <= 0 || input.Size > options.MaxVideoBytes)
            throw ApiException.Invalid("Provide a name of up to 200 characters and a file within the configured size limit.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var lockKey = "media-upload:" + owner;
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
        var now = DateTimeOffset.UtcNow;
        // Deletion cannot revoke an issued upload URL; retain its reservation until the capability expires.
        if (await db.Files.CountAsync(x => x.OwnerId == owner && (x.State == "Pending" || x.State == "Deleting") && x.UploadExpiresAt > now, ct) >= options.MaxPendingUploadsPerOwner)
            throw new ApiException(429, "LIMIT_EXCEEDED", "The pending upload limit has been reached.");
        var file = new MediaFile
        {
            Id = Guid.NewGuid(),
            OwnerId = owner,
            Name = input.Name.Trim(),
            Bucket = options.Bucket,
            ContentType = input.ContentType,
            Size = input.Size,
            CreatedAt = now,
            UploadExpiresAt = now.AddHours(2).AddMinutes(5)
        };
        file.ObjectKey = owner.ToString("N") + "/videos/" + file.Id.ToString("N") + "." + extension;
        // Persist the reservation before issuing a transport capability. A failed signer leaves a reclaimable pending reservation.
        db.Files.Add(file);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var url = await storage.CreateUploadUrlAsync(file.Bucket, file.ObjectKey, ct);
        return new UploadTicket(Dto(file), url, now.AddHours(2));
    }

    public async Task<MediaDto> FinalizeAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (file.State == "Ready")
            return Dto(file);
        if (file.State != "Pending" || file.UploadExpiresAt < DateTimeOffset.UtcNow)
            throw ApiException.Conflict("The upload is no longer pending.");
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(400, "MEDIA_FORMAT_INVALID", "Stored content type does not match the reservation.");
        VideoFileValidation.Validate(file.ContentType, file.Size, actual.Size, actual.Prefix, options.MaxVideoBytes);
        var changed = await db.Files.Where(x => x.Id == id && x.OwnerId == owner && x.State == "Pending" && x.Version == file.Version)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Ready").SetProperty(x => x.Version, x => x.Version + 1), ct);
        if (changed == 0)
            throw ApiException.Conflict("The file changed during finalization.");
        return Dto(file) with
        {
            State = "Ready",
            Version = file.Version + 1
        };
    }

    public async Task<ReadyMedia> RequireReadyAsync(Guid id, Guid ownerId, CancellationToken cancellationToken)
    {
        var file = await OwnedAsync(id, ownerId, cancellationToken);
        if (file.State != "Ready")
            throw new ApiException(409, "MEDIA_NOT_READY", "The source file is not ready.");
        return new ReadyMedia(file.Id, file.OwnerId, file.Bucket, file.ObjectKey, file.ContentType, file.Size);
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
        var file = await RequireReadyAsync(id, ownerId, cancellationToken);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, cancellationToken);
        VideoFileValidation.Validate(file.ContentType, file.Size, actual.Size, actual.Prefix, options.MaxVideoBytes);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(409, "MEDIA_FORMAT_INVALID", "Stored object content type changed.");
        return await storage.OpenReadAsync(file.Bucket, file.ObjectKey, cancellationToken);
    }

    public async Task<MediaReadTicket> ReadUrlAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var file = await RequireReadyAsync(id, owner, ct);
        var actual = await storage.InspectAsync(file.Bucket, file.ObjectKey, ct);
        VideoFileValidation.Validate(file.ContentType, file.Size, actual.Size, actual.Prefix, options.MaxVideoBytes);
        if (actual.ContentType != file.ContentType)
            throw new ApiException(409, "MEDIA_FORMAT_INVALID", "Stored object content type changed.");
        var expiresAt = DateTimeOffset.UtcNow.AddSeconds(options.ReadUrlSeconds);
        return new MediaReadTicket(await storage.CreateReadUrlAsync(file.Bucket, file.ObjectKey, ct), expiresAt);
    }

    public async Task DeleteAsync(Guid id, Guid owner, long version, CancellationToken ct)
    {
        var file = await OwnedAsync(id, owner, ct);
        if (file.Pinned)
            throw new ApiException(409, "MEDIA_IN_USE", "The file is pinned by an analysis.");
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
        var query = db.Files.AsNoTracking().Where(x => x.OwnerId == owner && x.State != "Deleted");
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
        await db.Files.Where(x => x.State == "Pending" && x.UploadExpiresAt < now && !x.Pinned)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.State, "Deleting").SetProperty(x => x.DeleteAfter, now).SetProperty(x => x.Version, x => x.Version + 1), ct);
        var files = await db.Files.AsNoTracking().Where(x => x.State == "Deleting" && x.DeleteAfter <= now && !x.Pinned)
            .OrderBy(x => x.DeleteAfter).ThenBy(x => x.Id).Take(25).ToListAsync(ct);
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
