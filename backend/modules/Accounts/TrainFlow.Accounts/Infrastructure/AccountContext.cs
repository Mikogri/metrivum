using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.Accounts.Domain;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Infrastructure;

public sealed class AccountContext(IHttpContextAccessor http, AccountsDbContext database) : IAccountContext
{
    public Guid UserId => Guid.TryParse(http.HttpContext?.User.FindFirstValue("sub"), out var id) && id != Guid.Empty
        ? id : throw new ApiException(401, "UNAUTHENTICATED", "A valid user session is required.");

    public async Task<Profile> EnsureProfileAsync(CancellationToken cancellationToken)
    {
        var id = UserId;
        // A unique key and ON CONFLICT make first-request provisioning safe across API instances.
        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO accounts.profiles ("Id", "DisplayName", "Locale", "TimeZone", "Onboarded", "Active", "Version")
            VALUES ({id}, '', 'en', 'UTC', false, true, 1) ON CONFLICT ("Id") DO NOTHING
            """, cancellationToken);
        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO accounts.workspaces ("Id", "OwnerId") VALUES ({Guid.NewGuid()}, {id})
            ON CONFLICT ("OwnerId") DO NOTHING
            """, cancellationToken);
        var profile = await database.Profiles.SingleAsync(x => x.Id == id, cancellationToken);
        if (!profile.Active)
            throw new ApiException(403, "ACCOUNT_DISABLED", "This account is disabled.");
        return profile;
    }

    public async Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken)
    {
        var profile = await EnsureProfileAsync(cancellationToken);
        if (!profile.Onboarded || !await database.Roles.AnyAsync(x => x.UserId == UserId && x.Role == "Coach", cancellationToken))
            throw new ApiException(403, "ONBOARDING_REQUIRED", "Complete coach onboarding first.");
        var workspace = await database.Workspaces.AsNoTracking().SingleAsync(x => x.OwnerId == UserId, cancellationToken);
        return new(UserId, workspace.Id);
    }

    public async Task RequireAdminAsync(string permission, CancellationToken cancellationToken)
    {
        await EnsureProfileAsync(cancellationToken);
        var role = permission switch
        {
            "catalog.manage" => "CatalogAdmin",
            "access.manage" => "AccessAdmin",
            _ => ""
        };
        if (role.Length == 0 || !await database.Roles.AnyAsync(x => x.UserId == UserId && x.Role == role, cancellationToken))
            throw new ApiException(403, "ADMIN_PERMISSION_REQUIRED", "This administrative operation is not permitted.");
    }
}
