using System.Security.Claims;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Accounts.Infrastructure;

/// <summary>Loads the current account and database-owned roles, provisions missing profile/workspace records and enforces account permissions.</summary>
public sealed class AccountContext : IAccountContext
{
    private readonly IHttpContextAccessor http;
    private readonly AccountsDbContext database;
    private AccountState? state;
    private Guid? stateTransactionId;
    private bool workspaceEnsured;

    public AccountContext(IHttpContextAccessor http, AccountsDbContext database)
    {
        this.http = http;
        this.database = database;
        // This service is scoped to one request. Writes within that request must refresh authorization.
        database.SavedChanges += (_, _) => state = null;
    }

    public Guid UserId =>
        Guid.TryParse(http.HttpContext?.User.FindFirstValue("sub"), out var id) && id != Guid.Empty
            ? id
            : throw new ApiException(401, "UNAUTHENTICATED", "A valid user session is required.");

    public async Task<Profile> EnsureProfileAsync(CancellationToken cancellationToken)
    {
        var id = UserId;
        var profile = await database.Profiles.FindAsync([id], cancellationToken);
        if (profile is null)
        {
            // Provision only missing accounts; concurrent first requests still share the unique key.
            await database.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO accounts.profiles ("Id", "DisplayName", "Locale", "TimeZone", "Onboarded", "Active", "Version")
                VALUES ({id}, '', 'en', 'UTC', false, true, 1) ON CONFLICT ("Id") DO NOTHING
                """,
                cancellationToken
            );
            profile = await database.Profiles.SingleAsync(x => x.Id == id, cancellationToken);
        }
        if (!profile.Active)
            throw new ApiException(403, "ACCOUNT_DISABLED", "This account is disabled.");
        if (!workspaceEnsured)
        {
            if (!await database.Workspaces.AnyAsync(x => x.OwnerId == id, cancellationToken))
                await database.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO accounts.workspaces ("Id", "OwnerId") VALUES ({Guid.NewGuid()}, {id})
                    ON CONFLICT ("OwnerId") DO NOTHING
                    """,
                    cancellationToken
                );
            workspaceEnsured = true;
        }
        return profile;
    }

    public async Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken)
    {
        var current = await GetStateAsync(cancellationToken);
        if (!current.Onboarded || !current.Roles.Contains("Coach"))
            throw new ApiException(403, "ONBOARDING_REQUIRED", "Complete coach onboarding first.");
        return new(UserId, current.WorkspaceId!.Value);
    }

    public async Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken)
    {
        var current = await GetStateAsync(cancellationToken);
        if (!current.Onboarded)
            throw new ApiException(403, "ONBOARDING_REQUIRED", "Complete onboarding first.");
        return current
            .Roles.Where(x => x is "Coach" or "Client")
            .Select(Enum.Parse<AccountRole>)
            .Order()
            .ToArray();
    }

    public async Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken)
    {
        if (!(await GetRolesAsync(cancellationToken)).Contains(AccountRole.Client))
            throw new ApiException(403, "CLIENT_ROLE_REQUIRED", "Activate the Client role first.");
        return new(UserId, (await GetStateAsync(cancellationToken)).WorkspaceId!.Value);
    }

    public async Task RequireAdminAsync(string permission, CancellationToken cancellationToken)
    {
        var current = await GetStateAsync(cancellationToken);
        var role = permission switch
        {
            "catalog.manage" => "CatalogAdmin",
            "catalog.exercises.edit" => current.Roles.Contains("CatalogAdmin")
                ? "CatalogAdmin"
                : "ExerciseEditor",
            "access.manage" => "AccessAdmin",
            _ => "",
        };
        if (role.Length == 0 || !current.Roles.Contains(role))
            throw new ApiException(
                403,
                "ADMIN_PERMISSION_REQUIRED",
                "This administrative operation is not permitted."
            );
    }

    private async Task<AccountState> GetStateAsync(CancellationToken cancellationToken)
    {
        var transactionId = database.Database.CurrentTransaction?.TransactionId;
        // A mutation may wait for its transaction lock after preflight authorization.
        // Do not carry an earlier account/role snapshot across that boundary.
        if (state is null || stateTransactionId != transactionId)
        {
            var id = UserId;
            var query = database
                .Profiles.AsNoTracking()
                .AsSingleQuery()
                .Where(x => x.Id == id)
                .Select(x => new AccountState
                {
                    Active = x.Active,
                    Onboarded = x.Onboarded,
                    WorkspaceId = database
                        .Workspaces.Where(w => w.OwnerId == id)
                        .Select(w => (Guid?)w.Id)
                        .FirstOrDefault(),
                    Roles = database.Roles.Where(r => r.UserId == id).Select(r => r.Role).ToArray(),
                });
            state = await query.SingleOrDefaultAsync(cancellationToken);
            if (state is null || state.WorkspaceId is null)
            {
                await EnsureProfileAsync(cancellationToken);
                state = await query.SingleAsync(cancellationToken);
            }
            workspaceEnsured = true;
            stateTransactionId = transactionId;
        }
        if (!state.Active)
            throw new ApiException(403, "ACCOUNT_DISABLED", "This account is disabled.");
        return state;
    }

    /// <summary>Holds the request-local account, role and workspace projection; it is not a separate database entity.</summary>
    private sealed class AccountState
    {
        public bool Active { get; init; }
        public bool Onboarded { get; init; }
        public Guid? WorkspaceId { get; init; }
        public string[] Roles { get; init; } = [];
    }
}
