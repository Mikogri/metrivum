using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;

namespace TrainFlow.Accounts.Infrastructure;

public sealed class AccountDirectory(AccountsDbContext db) : IAccountDirectory
{
    public Task<Guid[]> FindNameMatchesAsync(IReadOnlyCollection<Guid> userIds, string search, CancellationToken cancellationToken)
    {
        if (userIds.Count == 0)
            return Task.FromResult(Array.Empty<Guid>());
        var ids = userIds.Distinct().ToArray();
        var term = search.ToLowerInvariant();
        return db.Profiles.AsNoTracking()
            .Where(x => ids.Contains(x.Id) && x.Active && x.Onboarded
                && db.Workspaces.Any(w => w.OwnerId == x.Id)
                && (x.DisplayName.ToLower().Contains(term) || (x.Username != null && x.Username.ToLower().Contains(term))))
            .Select(x => x.Id).ToArrayAsync(cancellationToken);
    }

    public Task<AccountSearchEntry[]> SearchAsync(string prefix, CancellationToken cancellationToken)
    {
        var normalized = prefix.Trim().TrimStart('@').ToUpperInvariant();
        if (normalized.Length < 2 || normalized.Length > 30)
            return Task.FromResult(Array.Empty<AccountSearchEntry>());
        return db.Profiles.AsNoTracking()
            .Where(x => x.Active && x.Onboarded && x.NormalizedUsername != null && x.NormalizedUsername.StartsWith(normalized))
            .OrderBy(x => x.NormalizedUsername).Take(20)
            .Select(x => new AccountSearchEntry(x.Id, x.Username!, x.DisplayName)).ToArrayAsync(cancellationToken);
    }

    public async Task<AccountDirectoryEntry?> ResolveExactUsernameAsync(string username, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 32)
            return null;
        var normalized = username.Trim().ToUpperInvariant();
        var id = await db.Profiles.AsNoTracking().Where(x => x.NormalizedUsername == normalized && x.Active && x.Onboarded).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(cancellationToken);
        return id is { } userId ? (await GetAccountsAsync([userId], cancellationToken)).GetValueOrDefault(userId) : null;
    }
    public async Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.Distinct().ToArray();
        var profiles = await (from profile in db.Profiles.AsNoTracking()
                              join workspace in db.Workspaces.AsNoTracking() on profile.Id equals workspace.OwnerId
                              where ids.Contains(profile.Id) && profile.Active && profile.Onboarded
                              select new
                              {
                                  profile.Id,
                                  workspaceId = workspace.Id,
                                  profile.Username,
                                  profile.DisplayName,
                                  SharedPhone = profile.PhoneVisibleToCoach ? profile.Phone : null
                              }).ToArrayAsync(cancellationToken);
        var roles = await db.Roles.AsNoTracking().Where(x => ids.Contains(x.UserId) && (x.Role == "Coach" || x.Role == "Client")).ToArrayAsync(cancellationToken);
        return profiles.ToDictionary(x => x.Id, x => new AccountDirectoryEntry(x.Id, x.workspaceId, x.Username, x.DisplayName,
            roles.Where(r => r.UserId == x.Id).Select(r => Enum.Parse<AccountRole>(r.Role)).Order().ToArray(), x.SharedPhone));
    }
}
