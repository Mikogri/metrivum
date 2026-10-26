using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using TrainFlow.Access.Contracts;
using TrainFlow.Access.Domain;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Access.Features;

public sealed record ConfigurationRequest(long ExpectedVersion, string[] GrantedFeatures);
public sealed record OverrideRequest(long ExpectedVersion, bool Granted);
public sealed record FlagRequest(long ExpectedVersion, bool Enabled);
public sealed record AssignmentRequest(long ExpectedVersion, string ConfigurationId);
public sealed record PlanUsageDto(string PlanId, Guid ScopeId, DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd, IReadOnlyList<LimitDecision> Usage);

public static class AccessEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/me/access", (IFeatureAccessService access, CancellationToken ct) => access.GetAsync(ct)).WithTags("Access");
        endpoints.MapGet("/api/v1/me/usage", async (Guid? teamId, IAccountContext account, IPlanEntitlementsProvider plans, IEnumerable<ILimitUsageProvider> providers, CancellationToken ct) =>
        {
            await account.GetRolesAsync(ct);
            var plan = teamId is {} team ? await plans.GetForTeamAsync(account.UserId, team, ct) : await plans.GetAsync(account.UserId, ct);
            var usage = new List<LimitDecision>();
            foreach (var provider in providers) usage.AddRange(await provider.GetScopedUsageAsync(account.UserId, teamId, ct));
            return new PlanUsageDto(plan.PlanId, plan.ScopeId, plan.PeriodStart, plan.PeriodEnd,
                plan.Limits.Select(x => new LimitDecision(x.Key, x.Value, usage.FirstOrDefault(u => u.Key == x.Key)?.Used ?? 0,
                    x.Key.EndsWith("_per_period", StringComparison.Ordinal) ? plan.PeriodEnd : null)).ToArray());
        }).RequireAuthorization().WithTags("Access");
        endpoints.MapGet("/api/v1/features", async (IAccountContext account, FeatureCatalog catalog, CancellationToken ct) =>
        {
            await account.RequireCoachAsync(ct);
            return catalog.Definitions.Values.OrderBy(x => x.Key);
        }).WithTags("Access");
        var admin = endpoints.MapGroup("/api/v1/admin/access").WithTags("Access administration");
        admin.MapPut("/configurations/{id}", async (string id, ConfigurationRequest request, AccessDbContext db, FeatureCatalog catalog, IAccountContext account, TimeProvider clock, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            if (string.IsNullOrWhiteSpace(id) || id.Length > 64 || id.Any(char.IsControl) || request.GrantedFeatures is null ||
                request.GrantedFeatures.Length > catalog.Definitions.Count || request.GrantedFeatures.Any(x => x is null || !catalog.Definitions.ContainsKey(x)))
                throw ApiException.Invalid("Invalid configuration id or feature keys.");
            var row = await db.Configurations.FindAsync([id], ct);
            CheckVersion(row?.Version ?? 0, request.ExpectedVersion);
            if (row is null)
            {
                row = new()
                {
                    Id = id
                };
                db.Configurations.Add(row);
            }
            else
                row.Version++;
            row.GrantedFeatures = request.GrantedFeatures.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
            AddAudit(db, account.UserId, "configuration", id, request, clock);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                row.Id,
                row.Version,
                row.GrantedFeatures
            });
        });
        admin.MapPut("/users/{userId:guid}/features/{key}", async (Guid userId, string key, OverrideRequest request, AccessDbContext db, FeatureCatalog catalog, IAccountContext account, TimeProvider clock, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            if (userId == Guid.Empty || !catalog.Definitions.ContainsKey(key))
                throw ApiException.Invalid("Unknown user id or feature key.");
            var row = await db.Overrides.FindAsync([userId, key], ct);
            CheckVersion(row?.Version ?? 0, request.ExpectedVersion);
            if (row is null)
            {
                row = new()
                {
                    UserId = userId,
                    Key = key
                };
                db.Overrides.Add(row);
            }
            else
                row.Version++;
            row.Granted = request.Granted;
            AddAudit(db, account.UserId, "override", $"{userId}/{key}", request, clock);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                row.Key,
                row.Granted,
                row.Version
            });
        });
        admin.MapPut("/flags/{key}", async (string key, FlagRequest request, AccessDbContext db, FeatureCatalog catalog, IAccountContext account, TimeProvider clock, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            if (!catalog.Definitions.ContainsKey(key))
                throw ApiException.Invalid("Unknown feature key.");
            var row = await db.Flags.FindAsync([key], ct);
            CheckVersion(row?.Version ?? 0, request.ExpectedVersion);
            if (row is null)
            {
                row = new()
                {
                    Key = key
                };
                db.Flags.Add(row);
            }
            else
                row.Version++;
            row.Enabled = request.Enabled;
            AddAudit(db, account.UserId, "flag", key, request, clock);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                row.Key,
                row.Enabled,
                row.Version
            });
        });
        admin.MapPut("/users/{userId:guid}/configuration", async (Guid userId, AssignmentRequest request, AccessDbContext db, IAccountContext account, TimeProvider clock, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            if (userId == Guid.Empty || string.IsNullOrWhiteSpace(request.ConfigurationId))
                throw ApiException.Invalid("A user and configuration id are required.");
            if (!await db.Configurations.AnyAsync(x => x.Id == request.ConfigurationId, ct))
                throw ApiException.Invalid("Unknown configuration.");
            var row = await db.Assignments.FindAsync([userId], ct);
            CheckVersion(row?.Version ?? 0, request.ExpectedVersion);
            if (row is null)
            {
                row = new()
                {
                    UserId = userId
                };
                db.Assignments.Add(row);
            }
            else
                row.Version++;
            row.ConfigurationId = request.ConfigurationId;
            AddAudit(db, account.UserId, "assignment", userId.ToString(), request, clock);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                row.UserId,
                row.ConfigurationId,
                row.Version
            });
        });
        admin.MapGet("/users/{userId:guid}", async (Guid userId, AccessDbContext db, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            return new
            {
                assignment = await db.Assignments.AsNoTracking().Where(x => x.UserId == userId)
                    .Select(x => new { x.ConfigurationId, x.Version }).SingleOrDefaultAsync(ct),
                overrides = await db.Overrides.AsNoTracking().Where(x => x.UserId == userId).OrderBy(x => x.Key)
                    .Select(x => new { x.Key, x.Granted, x.Version }).ToArrayAsync(ct)
            };
        });
        admin.MapGet("", async (AccessDbContext db, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            return new
            {
                configurations = await db.Configurations.AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.Version, x.GrantedFeatures }).Take(100).ToArrayAsync(ct),
                flags = await db.Flags.AsNoTracking().OrderBy(x => x.Key).Select(x => new { x.Key, x.Enabled, x.Version }).Take(100).ToArrayAsync(ct)
            };
        });
        admin.MapGet("/audit", async (int? page, AccessDbContext db, IAccountContext account, CancellationToken ct) =>
        {
            await account.RequireAdminAsync("access.manage", ct);
            var number = page ?? 1;
            if (number is < 1 or > 10000)
                throw ApiException.Invalid("Page must be between 1 and 10000.");
            return await db.Audit.AsNoTracking().OrderByDescending(x => x.At).ThenBy(x => x.Id).Skip((number - 1) * 50).Take(50)
                .Select(x => new { x.Id, x.ActorId, x.Operation, x.Subject, x.Change, x.At }).ToArrayAsync(ct);
        });
    }

    private static void CheckVersion(long current, long expected)
    {
        if (current != expected)
            throw new ApiException(409, "VERSION_CONFLICT", "Access configuration changed. Reload and retry.");
    }
    private static void AddAudit(AccessDbContext db, Guid actorId, string operation, string subject, object change, TimeProvider clock) =>
        db.Audit.Add(new()
        {
            Id = Guid.NewGuid(),
            ActorId = actorId,
            Operation = operation,
            Subject = subject,
            Change = JsonSerializer.Serialize(change),
            At = clock.GetUtcNow()
        });
}
