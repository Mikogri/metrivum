using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Metrivum.Billing.Infrastructure;
using Metrivum.Coaching.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Paged_team_indexes_upgrade_and_rollback_without_removing_existing_indexes()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        await using var coaching = new CoachingDbContext(new DbContextOptionsBuilder<CoachingDbContext>()
            .UseNpgsql(isolated.Connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "coaching")).Options);
        await coaching.Database.MigrateAsync();
        await using var billing = new BillingDbContext(new DbContextOptionsBuilder<BillingDbContext>()
            .UseNpgsql(isolated.Connection, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "billing")).Options);
        await Check(coaching, "20261012161041_OptionalApplicationForm", "coaching", 3);
        await Check(billing, "20261009234144_PlanPurchaseOrders", "billing", 1);

        static async Task Check(DbContext db, string baseline, string schema, int count)
        {
            // Isolate this migration's delta from tables/indexes introduced by later features.
            var target = db.GetService<IMigrationsAssembly>().Migrations.Keys.Single(x => x.EndsWith("_PagedTeamReadIndexes", StringComparison.Ordinal));
            await db.GetService<IMigrator>().MigrateAsync(target);
            var names = schema == "billing"
                ? new[] { "IX_team_memberships_TeamId_JoinedAt_UserId" }
                : new[] { "IX_TeamClientCases_TeamId_CreatedAt_Id", "IX_ClientTransferRequests_ClientId_CreatedAt_Id", "IX_ClientTransferRequests_TeamId_CreatedAt_Id" };
            async Task<int> Present() => await db.Database.SqlQuery<int>($"""
                SELECT count(*)::int AS "Value" FROM pg_indexes WHERE schemaname = {schema} AND indexname = ANY({names})
                """).SingleAsync();
            var before = await db.Database.SqlQuery<int>($"""
                SELECT count(*)::int AS "Value" FROM pg_indexes WHERE schemaname = {schema}
                """).SingleAsync();
            Assert.Equal(count, await Present());
            await db.GetService<IMigrator>().MigrateAsync(baseline);
            Assert.Equal(0, await Present());
            Assert.Equal(before - count, await db.Database.SqlQuery<int>($"""
                SELECT count(*)::int AS "Value" FROM pg_indexes WHERE schemaname = {schema}
                """).SingleAsync());
            await db.Database.MigrateAsync();
            Assert.Equal(count, await Present());
            Assert.False(db.Database.HasPendingModelChanges());
        }
    }
}
