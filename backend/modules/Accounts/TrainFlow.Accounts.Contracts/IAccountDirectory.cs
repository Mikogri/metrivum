namespace TrainFlow.Accounts.Contracts;

public sealed record AccountDirectoryEntry(Guid UserId, Guid WorkspaceId, string? Username, string DisplayName, IReadOnlyList<AccountRole> Roles, string? SharedPhone = null);

public sealed record AccountSearchEntry(Guid UserId, string Username, string DisplayName);

public interface IAccountDirectory
{
    Task<AccountSearchEntry[]> SearchAsync(string prefix, CancellationToken cancellationToken) => Task.FromResult(Array.Empty<AccountSearchEntry>());
    Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken);
    async Task<Guid[]> FindNameMatchesAsync(IReadOnlyCollection<Guid> userIds, string search, CancellationToken cancellationToken)
    {
        var entries = await GetAccountsAsync(userIds, cancellationToken);
        return entries.Values.Where(x => x.DisplayName.Contains(search, StringComparison.OrdinalIgnoreCase)
            || (x.Username?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)).Select(x => x.UserId).ToArray();
    }
    Task<AccountDirectoryEntry?> ResolveExactUsernameAsync(string username, CancellationToken cancellationToken) => Task.FromResult<AccountDirectoryEntry?>(null);
}
