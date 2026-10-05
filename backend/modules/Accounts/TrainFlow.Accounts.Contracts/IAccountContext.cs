namespace TrainFlow.Accounts.Contracts;

public sealed record AccountIdentity(Guid UserId, Guid WorkspaceId);

public interface IAccountContext
{
    Guid UserId
    {
        get;
    }
    Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken);
    Task RequireAdminAsync(string permission, CancellationToken cancellationToken);
}
