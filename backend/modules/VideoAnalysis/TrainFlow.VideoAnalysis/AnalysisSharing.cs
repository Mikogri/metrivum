using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media.Contracts;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.VideoAnalysis;

public sealed record AnalysisShareDto(string Token, DateTimeOffset CreatedAt, bool AllowSave = false);
public sealed record ShareRequest(bool AllowSave);
public sealed record SharedAnalysisDto(string Name, AnalysisConfiguration Configuration, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, bool HasVideo, AnalysisSourceVideo? SourceVideo,
    bool AllowSave = false, bool Saved = false, bool Own = false, string? OwnerName = null);
/// <summary>A shared analysis in the viewer's library: opened through its link, never copied.</summary>
public sealed record SavedAnalysisDto(string Token, Guid AnalysisId, string Name, string OwnerName, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, DateTimeOffset SavedAt, bool HasVideo);
public sealed record SharedVideoUrl(string Url, DateTimeOffset ExpiresAt);

/// <summary>
/// Read-only links to a completed analysis. The owner creates one link per analysis and can revoke it;
/// anyone signed in who has the unguessable token may read the result and the video, never change them.
/// Notes, tags and the owner's other analyses are not exposed through a link.
/// </summary>
public sealed class AnalysisSharing(VideoAnalysisDbContext db, IMediaLibrary media, IAccountDirectory? directory = null)
{
    /// <summary>Returns the analysis's active link, creating it on first use; sets whether people may keep it.</summary>
    public async Task<AnalysisShareDto> ShareAsync(Guid analysisId, Guid owner, CancellationToken ct, bool? allowSave = null)
    {
        var link = await CreateAsync(analysisId, owner, ct);
        if (allowSave is { } allow && allow != link.AllowSave)
        {
            await db.Shares.Where(x => x.AnalysisId == analysisId && x.OwnerId == owner && x.RevokedAt == null)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.AllowSave, allow), ct);
            link = link with { AllowSave = allow };
        }
        return link;
    }

    private async Task<AnalysisShareDto> CreateAsync(Guid analysisId, Guid owner, CancellationToken ct)
    {
        var job = await db.Jobs.AsNoTracking().Where(x => x.Id == analysisId && x.OwnerId == owner)
            .Select(x => new { x.Status }).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        if (job.Status != "Completed")
            throw new ApiException(409, "ANALYSIS_NOT_COMPLETED", "Only completed analyses can be shared.");
        var active = await ActiveAsync(analysisId, owner, ct);
        if (active != null)
            return new(active.Token, active.CreatedAt, active.AllowSave);
        var share = new AnalysisShare
        {
            Id = Guid.NewGuid(),
            AnalysisId = analysisId,
            OwnerId = owner,
            // 32 random bytes, URL-safe: the link itself is the credential, so it must not be guessable.
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_'),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Shares.Add(share);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // A parallel request created the link first; the unique index keeps one active link.
            db.ChangeTracker.Clear();
            active = await ActiveAsync(analysisId, owner, ct);
            if (active == null)
                throw;
            return new(active.Token, active.CreatedAt, active.AllowSave);
        }
        return new(share.Token, share.CreatedAt, share.AllowSave);
    }

    /// <summary>Turns the link off; it stops working for everyone who has it.</summary>
    public async Task RevokeAsync(Guid analysisId, Guid owner, CancellationToken ct)
    {
        if (!await db.Jobs.AnyAsync(x => x.Id == analysisId && x.OwnerId == owner, ct))
            throw ApiException.NotFound();
        var now = DateTimeOffset.UtcNow;
        await db.Shares.Where(x => x.AnalysisId == analysisId && x.OwnerId == owner && x.RevokedAt == null)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.RevokedAt, now), ct);
    }

    public async Task<AnalysisShareDto?> CurrentAsync(Guid analysisId, Guid owner, CancellationToken ct)
    {
        if (!await db.Jobs.AnyAsync(x => x.Id == analysisId && x.OwnerId == owner, ct))
            throw ApiException.NotFound();
        var active = await ActiveAsync(analysisId, owner, ct);
        return active == null ? null : new(active.Token, active.CreatedAt, active.AllowSave);
    }

    public Task<SharedAnalysisDto> ReadAsync(string token, CancellationToken ct) => ReadAsync(token, Guid.Empty, ct);

    public async Task<SharedAnalysisDto> ReadAsync(string token, Guid viewer, CancellationToken ct)
    {
        var share = await ShareAsync(token, ct);
        var job = await SharedJobAsync(token, ct);
        var dto = AnalysisLibrary.Dto(job);
        var saved = await db.SavedShares.AnyAsync(x => x.UserId == viewer && x.AnalysisId == share.AnalysisId, ct);
        return new(dto.Name, dto.Configuration, dto.CreatedAt, dto.CompletedAt, job.MediaId != null, dto.SourceVideo,
            share.AllowSave, saved, share.OwnerId == viewer, await OwnerNameAsync(share.OwnerId, ct));
    }

    /// <summary>Keeps a shared analysis in the viewer's library as a reference (only when the owner allows it).</summary>
    public async Task SaveAsync(string token, Guid viewer, CancellationToken ct)
    {
        var share = await ShareAsync(token, ct);
        if (!share.AllowSave) throw new ApiException(403, "SHARE_SAVE_NOT_ALLOWED", "The owner does not allow saving this analysis.");
        if (share.OwnerId == viewer) throw ApiException.Conflict("This analysis is already yours.");
        if (await db.SavedShares.AnyAsync(x => x.UserId == viewer && x.AnalysisId == share.AnalysisId, ct)) return;
        db.SavedShares.Add(new SavedShare { Id = Guid.NewGuid(), UserId = viewer, ShareId = share.Id, AnalysisId = share.AnalysisId, SavedAt = DateTimeOffset.UtcNow });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); /* saved twice at once: the unique index kept one */ }
    }

    public async Task UnsaveAsync(string token, Guid viewer, CancellationToken ct)
    {
        var share = await ShareAsync(token, ct);
        await db.SavedShares.Where(x => x.UserId == viewer && x.AnalysisId == share.AnalysisId).ExecuteDeleteAsync(ct);
    }

    /// <summary>The viewer's saved analyses whose link is still active and still allows keeping them.</summary>
    public async Task<SavedAnalysisDto[]> SavedAsync(Guid viewer, CancellationToken ct)
    {
        var rows = await (from saved in db.SavedShares.AsNoTracking()
                          join share in db.Shares.AsNoTracking() on saved.ShareId equals share.Id
                          join job in db.Jobs.AsNoTracking() on share.AnalysisId equals job.Id
                          where saved.UserId == viewer && share.RevokedAt == null && share.AllowSave && job.Status == "Completed"
                          orderby saved.SavedAt descending
                          select new { share.Token, job.Id, job.Name, job.OwnerId, job.CreatedAt, job.CompletedAt, saved.SavedAt, HasVideo = job.MediaId != null })
            .Take(200).ToArrayAsync(ct);
        var names = directory is null ? new Dictionary<Guid, AccountDirectoryEntry>() : await directory.GetAccountsAsync(rows.Select(x => x.OwnerId).Distinct().ToArray(), ct);
        return rows.Select(x => new SavedAnalysisDto(x.Token, x.Id, x.Name, names.TryGetValue(x.OwnerId, out var owner) ? owner.DisplayName : "Shared", x.CreatedAt, x.CompletedAt, x.SavedAt, x.HasVideo)).ToArray();
    }

    private async Task<string?> OwnerNameAsync(Guid owner, CancellationToken ct) =>
        directory is null ? null : (await directory.GetAccountsAsync([owner], ct)).TryGetValue(owner, out var entry) ? entry.DisplayName : null;

    public async Task<AnalysisResult> ResultAsync(string token, int? repetition, int maxPoints, CancellationToken ct)
    {
        var share = await ShareAsync(token, ct);
        var job = await db.Jobs.AsNoTracking().Where(x => x.Id == share.AnalysisId && x.OwnerId == share.OwnerId)
            .Select(x => new { x.Status, x.Result }).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        if (job.Status != "Completed" || job.Result == null)
            throw ApiException.NotFound();
        return AnalysisResults.Select(System.Text.Json.JsonSerializer.Deserialize<AnalysisResult>(job.Result, AnalysisResults.Json)!, repetition, maxPoints);
    }

    public async Task<SharedVideoUrl> VideoUrlAsync(string token, Guid viewer, CancellationToken ct)
    {
        var job = await SharedJobAsync(token, ct);
        if (job.MediaId is not { } mediaId)
            throw ApiException.NotFound();
        var ticket = await media.ReadUrlForAsync(mediaId, job.OwnerId, viewer, ct);
        return new(ticket.Url, ticket.ExpiresAt);
    }

    private Task<AnalysisShare?> ActiveAsync(Guid analysisId, Guid owner, CancellationToken ct) =>
        db.Shares.AsNoTracking().Where(x => x.AnalysisId == analysisId && x.OwnerId == owner && x.RevokedAt == null).SingleOrDefaultAsync(ct);

    /// <summary>Unknown, revoked and malformed tokens all look the same: not found.</summary>
    private async Task<AnalysisShare> ShareAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(token) || token.Length != 43)
            throw ApiException.NotFound();
        return await db.Shares.AsNoTracking().Where(x => x.Token == token && x.RevokedAt == null).SingleOrDefaultAsync(ct)
            ?? throw ApiException.NotFound();
    }

    private async Task<AnalysisJob> SharedJobAsync(string token, CancellationToken ct)
    {
        var share = await ShareAsync(token, ct);
        var job = await db.Jobs.AsNoTracking().Where(x => x.Id == share.AnalysisId && x.OwnerId == share.OwnerId && x.Status == "Completed")
            .Select(x => new AnalysisJob
            {
                Id = x.Id,
                OwnerId = x.OwnerId,
                Name = x.Name,
                MediaId = x.MediaId,
                Configuration = x.Configuration,
                Status = x.Status,
                CreatedAt = x.CreatedAt,
                CompletedAt = x.CompletedAt,
                Version = x.Version,
                ExecutionLocation = x.ExecutionLocation,
                LocalAnalysisId = x.LocalAnalysisId,
                SourceVideo = x.SourceVideo,
            }).SingleOrDefaultAsync(ct);
        return job ?? throw ApiException.NotFound();
    }
}
