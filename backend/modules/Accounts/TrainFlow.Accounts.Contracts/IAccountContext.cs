namespace TrainFlow.Accounts.Contracts;

public sealed record AccountIdentity(Guid UserId, Guid WorkspaceId);

[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter<AccountRole>))]
public enum AccountRole
{
    Coach, Client
}

public interface IAccountContext
{
    Guid UserId
    {
        get;
    }
    Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken);
    Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken);
    Task RequireAdminAsync(string permission, CancellationToken cancellationToken);
}
