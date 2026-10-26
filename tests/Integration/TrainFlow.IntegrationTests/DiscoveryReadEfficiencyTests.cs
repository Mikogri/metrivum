using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;
using TrainFlow.Billing.Features;
using TrainFlow.Billing.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class DiscoveryReadEfficiencyTests
{
    [CatalogPostgresFact]
    public async Task Personal_and_workspace_priority_uses_one_SQL_command_and_empty_pages_use_none()
    {
        var counter = new Reads();
        await using var db = new BillingDbContext(new DbContextOptionsBuilder<BillingDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!).AddInterceptors(counter).Options);
        var service = new BillingService(db, null!, null!, null!, null!, null!, TimeProvider.System, null!, null!);
        Assert.Empty(await service.GetPriorityCoachIdsAsync([], default));
        Assert.Equal(0, counter.Count);
        Assert.Empty(await service.GetPriorityCoachIdsAsync([Guid.NewGuid()], default));
        Assert.Equal(1, counter.Count);
    }

    [CatalogPostgresFact]
    public async Task Prefix_and_published_offer_indexes_reduce_scanned_rows_on_representative_data()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!);
        await connection.OpenAsync();
        // Temporary tables reproduce the migration operators and predicates without touching user fixtures.
        await using (var command = new NpgsqlCommand("""
            CREATE TEMP TABLE discovery_user_bench ("NormalizedUsername" varchar(32), "Active" boolean, "Onboarded" boolean);
            INSERT INTO discovery_user_bench SELECT 'INDEX' || lpad(n::text,6,'0'), true, true FROM generate_series(1,25000) n;
            ANALYZE discovery_user_bench;
            CREATE TEMP TABLE discovery_offer_bench ("CoachId" uuid, "Id" uuid, "Status" varchar(32), "CurrentPublishedRevisionId" uuid);
            INSERT INTO discovery_offer_bench SELECT md5((n % 500)::text)::uuid, md5(n::text)::uuid,
                CASE WHEN n % 5 = 0 THEN 'Archived' ELSE 'Active' END, CASE WHEN n % 3 = 0 THEN NULL ELSE md5((n+25000)::text)::uuid END
                FROM generate_series(1,25000) n;
            ANALYZE discovery_offer_bench;
            """, connection)) await command.ExecuteNonQueryAsync();
        const string prefix = """SELECT "NormalizedUsername" FROM discovery_user_bench WHERE "Active" AND "Onboarded" AND "NormalizedUsername" LIKE 'INDEX00042%' ORDER BY "NormalizedUsername" LIMIT 20""";
        const string offer = """SELECT "Id" FROM discovery_offer_bench WHERE "CoachId"=md5('1')::uuid AND "Status"='Active' AND "CurrentPublishedRevisionId" IS NOT NULL ORDER BY "Id" LIMIT 1""";
        var beforePrefix = await Explain(connection, prefix);
        var beforeOffer = await Explain(connection, offer);
        await using (var command = new NpgsqlCommand("""
            CREATE INDEX discovery_user_prefix_bench ON discovery_user_bench ("NormalizedUsername" varchar_pattern_ops)
                WHERE "Active" AND "Onboarded" AND "NormalizedUsername" IS NOT NULL;
            CREATE INDEX discovery_offer_card_bench ON discovery_offer_bench ("CoachId", "Id")
                WHERE "Status"='Active' AND "CurrentPublishedRevisionId" IS NOT NULL;
            """, connection)) await command.ExecuteNonQueryAsync();
        var afterPrefix = await Explain(connection, prefix);
        var afterOffer = await Explain(connection, offer);
        Assert.Contains("Seq Scan", beforePrefix); Assert.Contains("Seq Scan", beforeOffer);
        Assert.Contains("discovery_user_prefix_bench", afterPrefix); Assert.Contains("discovery_offer_card_bench", afterOffer);
        Assert.True(RemovedRows(afterPrefix) < RemovedRows(beforePrefix));
        Assert.True(RemovedRows(afterOffer) < RemovedRows(beforeOffer));
        Console.WriteLine($"Discovery index plans: username rows removed {RemovedRows(beforePrefix)} -> {RemovedRows(afterPrefix)}; offer {RemovedRows(beforeOffer)} -> {RemovedRows(afterOffer)}.");
    }

    private static async Task<string> Explain(NpgsqlConnection db, string query)
    {
        await using var command = new NpgsqlCommand("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query, db);
        return (string)(await command.ExecuteScalarAsync())!;
    }
    private static double RemovedRows(string json)
    {
        using var document = JsonDocument.Parse(json);
        return Nodes(document.RootElement[0].GetProperty("Plan")).Sum(x => x.TryGetProperty("Rows Removed by Filter", out var rows) ? rows.GetDouble() : 0);
    }
    private static IEnumerable<JsonElement> Nodes(JsonElement node)
    {
        yield return node;
        if (node.TryGetProperty("Plans", out var children)) foreach (var child in children.EnumerateArray()) foreach (var nested in Nodes(child)) yield return nested;
    }
    private sealed class Reads : DbCommandInterceptor
    {
        public int Count;
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        { Count++; return ValueTask.FromResult(result); }
    }
}
