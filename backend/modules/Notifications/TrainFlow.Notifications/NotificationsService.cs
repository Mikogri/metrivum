using Microsoft.AspNetCore.SignalR;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Notifications.Contracts;
namespace TrainFlow.Notifications;

public sealed record NotificationDto(Guid Id, string Type, string Category, string SourceModule, Guid SourceId, string? DeepLink, DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);
public sealed record NotificationPage(NotificationDto[] Items, int Page, int PageSize, long Total);
public sealed record NotificationTargetRequest(string Target);
public sealed record PreferenceRequest(bool Messaging, bool CheckIns, bool Coaching, bool System);
public sealed class NotificationsService(NotificationsDbContext db, ModuleTransaction tx, TimeProvider clock, IAccountContext accounts, IHubContext<NotificationsHub> hub)
{
    private Guid UserId => accounts.UserId;
    public static bool Enabled(NotificationPreference? p, string category, bool required) => required || category == "Billing" || p == null || category switch { "Messaging" => p.Messaging, "CheckIns" => p.CheckIns, "Coaching" => p.Coaching, _ => p.System };
    private IQueryable<Notification> Own() => db.Notifications.Where(x => x.RecipientUserId == UserId && !x.Cancelled && x.AvailableAt <= clock.GetUtcNow());
    private static readonly Expression<Func<Notification, NotificationDto>> Projection = x => new NotificationDto(x.Id, x.Type, x.Category, x.SourceModule, x.SourceId, x.DeepLink, x.AvailableAt, x.ReadAt);
    public async Task<NotificationDto> GetAsync(Guid id, CancellationToken ct) =>
        await Own().AsNoTracking().Where(x => x.Id == id).Select(Projection).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
    public async Task<NotificationPage> ListAsync(int page, int size, bool unread, CancellationToken ct, Guid? activeConversation = null)
    {
        if (page < 1 || page > 10000 || size is < 1 or > 100)
            throw ApiException.Invalid("Invalid notification pagination.");
        var q = Own().AsNoTracking();
        if (activeConversation.HasValue)
            q = q.Where(x => x.Type != "MessageCreated" || x.SourceId != activeConversation);
        if (unread)
            q = q.Where(x => x.ReadAt == null);
        var total = await q.LongCountAsync(ct);
        var rows = await q.OrderByDescending(x => x.AvailableAt).ThenByDescending(x => x.Id).Skip((page - 1) * size).Take(size).Select(Projection).ToArrayAsync(ct);
        return new(rows, page, size, total);
    }
    public Task<int> CountAsync(CancellationToken ct, Guid? activeConversation = null) => Own().CountAsync(x => x.ReadAt == null && (!activeConversation.HasValue || x.Type != "MessageCreated" || x.SourceId != activeConversation), ct);
    public async Task ReadAsync(Guid id, CancellationToken ct)
    {
        if (!await Own().AnyAsync(x => x.Id == id, ct))
            throw ApiException.NotFound();
        await Own().Where(x => x.Id == id && x.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, clock.GetUtcNow()), ct);
        await NotifyCountAsync();
    }
    public async Task ReadAllAsync(CancellationToken ct)
    {
        await Own().Where(x => x.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, clock.GetUtcNow()), ct);
        await NotifyCountAsync();
    }
    public async Task<int> ReadTargetAsync(NotificationTargetRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Target) || request.Target.Length > 2000 ||
            !request.Target.StartsWith("/app/", StringComparison.Ordinal) || request.Target.Contains('\\') || request.Target.Contains('#'))
            throw ApiException.Invalid("Invalid notification target.");
        var path = request.Target.Split('?')[0].TrimEnd('/');
        var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(new Uri("https://local" + request.Target).Query);
        var observedAt = clock.GetUtcNow();
        // Match the destination, not the navigation entry point. Chat reads use their message watermark instead.
        var unread = Own().Where(n => n.ReadAt == null && n.Type != "MessageCreated" && n.AvailableAt <= observedAt);
        var links = await unread.Where(n => n.DeepLink == path || n.DeepLink!.StartsWith(path + "?"))
            .Select(n => n.DeepLink!).Distinct().ToArrayAsync(ct);
        var targets = links.Where(link => Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(new Uri("https://local" + link).Query)
            .All(pair => query.TryGetValue(pair.Key, out var values) && pair.Value.SequenceEqual(values))).ToArray();
        if (targets.Length == 0) return 0;
        var changed = await unread.Where(n => targets.Contains(n.DeepLink!))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, observedAt), ct);
        if (changed > 0) await NotifyCountAsync();
        return changed;
    }
    private async Task NotifyCountAsync()
    {
        try
        {
            await hub.Clients.User(UserId.ToString()).SendAsync("UnreadCountChanged", CancellationToken.None);
        }
        catch { /* Persistent read state remains authoritative when a realtime hint fails. */ }
    }
    public async Task<PreferenceRequest> PreferencesAsync(CancellationToken ct)
    {
        var p = await db.Preferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == UserId, ct);
        return new(p?.Messaging ?? true, p?.CheckIns ?? true, p?.Coaching ?? true, p?.System ?? true);
    }
    public Task UpdatePreferencesAsync(PreferenceRequest r, CancellationToken ct) => tx.RunAsync(async token =>
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"notification-preference:" + UserId},0))", token);
        var p = await db.Preferences.SingleOrDefaultAsync(x => x.UserId == UserId, token);
        if (p == null)
        {
            p = new()
            {
                UserId = UserId
            };
            db.Preferences.Add(p);
        }
        p.Messaging = r.Messaging;
        p.CheckIns = r.CheckIns;
        p.Coaching = r.Coaching;
        p.System = r.System;
        await db.Notifications.Where(x => x.RecipientUserId == UserId && x.AvailableAt > clock.GetUtcNow() && !x.Required && x.Category != "Billing" && ((x.Category == "Messaging" && !r.Messaging) || (x.Category == "CheckIns" && !r.CheckIns) || (x.Category == "Coaching" && !r.Coaching) || (x.Category == "System" && !r.System)))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Cancelled, true), token);
        await db.SaveChangesAsync(token);
    }, ct);
}
