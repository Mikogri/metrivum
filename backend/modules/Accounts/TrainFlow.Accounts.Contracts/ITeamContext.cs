namespace TrainFlow.Accounts.Contracts;

public sealed record TeamAccess(Guid TeamId, Guid OwnerId, string Role, string Status, bool IsActive, string Name = "");

public interface ITeamContext
{
    Task<TeamAccess?> GetForUserAsync(Guid userId, CancellationToken ct);
    Task<TeamAccess> RequireAsync(Guid teamId, Guid userId, bool administrative, CancellationToken ct);
}
