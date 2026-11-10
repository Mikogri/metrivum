using System.Security.Claims;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Domain;
using Metrivum.Integrations.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Integrations.Features;

/// <summary>Checks AI connection consent and resource grants before integration operations.</summary>
public sealed class IntegrationAccess(
    IntegrationsDbContext db,
    IAccountContext accounts,
    IFeatureAccessService features,
    IHttpContextAccessor http
)
{
    public string ClientId
    {
        get
        {
            var claims = http.HttpContext?.User.FindAll("client_id").ToArray() ?? [];
            if (
                claims.Length != 1
                || string.IsNullOrWhiteSpace(claims[0].Value)
                || claims[0].Value.Length > 200
            )
                throw new ApiException(
                    403,
                    "INTEGRATION_CLIENT_REQUIRED",
                    "A validated OAuth client identity is required."
                );
            return claims[0].Value;
        }
    }

    public async Task RequireOwnerSessionAsync(CancellationToken ct)
    {
        if (http.HttpContext?.User.HasClaim(x => x.Type == "client_id") == true)
            throw new ApiException(
                403,
                "HUMAN_SESSION_REQUIRED",
                "Use your Metrivum account session to manage integrations and approve actions."
            );
        await accounts.RequireCoachAsync(ct);
        await features.RequireAsync(IntegrationGrants.Feature("connect"), ct);
    }

    public async Task<IntegrationConnection> RequireAsync(string grant, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        await features.RequireAsync(IntegrationGrants.Feature("connect"), ct);
        var clientId = ClientId;
        // No request-local consent cache: revocation and grant changes are checked on every operation.
        var connection = await db
            .Connections.AsNoTracking()
            .SingleOrDefaultAsync(
                x => x.UserId == accounts.UserId && x.ClientId == clientId && x.RevokedAt == null,
                ct
            );
        if (
            connection is null
            || (grant != "connect" && !connection.Grants.Contains(grant, StringComparer.Ordinal))
        )
            throw new ApiException(
                403,
                "INTEGRATION_PERMISSION_REQUIRED",
                "This assistant has no active consent for the requested operation."
            );
        var issuedAt = http.HttpContext?.User.FindFirstValue("iat");
        if (
            !long.TryParse(issuedAt, out var issuedSeconds)
            || issuedSeconds < connection.TokenNotBefore.ToUnixTimeSeconds()
        )
            throw new ApiException(
                403,
                "INTEGRATION_TOKEN_STALE",
                "Reconnect to obtain a token issued after this integration consent."
            );
        await features.RequireAsync(IntegrationGrants.Feature(grant), ct);
        await db
            .Connections.Where(x =>
                x.Id == connection.Id && x.RevokedAt == null && x.Version == connection.Version
            )
            .ExecuteUpdateAsync(
                set => set.SetProperty(x => x.LastUsedAt, DateTimeOffset.UtcNow),
                ct
            );
        return connection;
    }

    public Task LockAsync(Guid userId, string clientId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({"integration:" + userId + ":" + clientId}, 0))",
            ct
        );
}
