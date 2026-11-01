using Npgsql;

namespace Metrivum.Api.Security;

public interface IAuthSessionValidator
{
    Task<bool> IsActiveAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken);

    /// <summary>
    /// False when the account has a verified second factor (an authenticator app) but this session has not passed
    /// it (Auth level aal1). Needs <c>infra/auth-second-factor.sql</c>.
    /// </summary>
    Task<bool> MeetsSecondFactorAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken);
}

/// <summary>JWT signatures outlive account deletion. Verify the exact user/session pair before any application work.</summary>
public sealed class AuthSessionValidator(NpgsqlDataSource database) : IAuthSessionValidator
{
    public async Task<bool> IsActiveAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        await using var command = database.CreateCommand("SELECT accounts.auth_session_is_active($1, $2)");
        command.Parameters.AddWithValue(userId);
        command.Parameters.AddWithValue(sessionId);
        // No positive cache: deleting an Auth user/session must take effect on the next request.
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }

    public async Task<bool> MeetsSecondFactorAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken)
    {
        await using var command = database.CreateCommand("SELECT accounts.auth_session_meets_second_factor($1, $2)");
        command.Parameters.AddWithValue(userId);
        command.Parameters.AddWithValue(sessionId);
        // Read from Auth's own records on every request: adding or removing a factor applies immediately.
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }
}
