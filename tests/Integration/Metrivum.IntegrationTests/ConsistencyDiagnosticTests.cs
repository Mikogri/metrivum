using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed class ConsistencyDiagnosticTests
{
    [TrainingPostgresFact]
    public async Task Diagnostic_executes_all_rules_and_database_enforces_read_only()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "Metrivum.slnx")))
            root = root.Parent;
        Assert.NotNull(root);
        var sql = await File.ReadAllTextAsync(
            Path.Combine(root.FullName, "infra", "diagnostics", "consistency.sql")
        );
        await using var connection = new NpgsqlConnection(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")
        );
        await connection.OpenAsync();
        await using (var command = new NpgsqlCommand(sql, connection))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            var rules = new HashSet<string>();
            do
            {
                if (reader.FieldCount == 0)
                    continue;
                while (await reader.ReadAsync())
                {
                    rules.Add(reader.GetString(reader.GetOrdinal("rule")));
                    Assert.True(reader.GetInt64(reader.GetOrdinal("affected_count")) >= 0);
                }
            } while (await reader.NextResultAsync());
            Assert.Equal(10, rules.Count);
            Assert.Contains("settled_due_payment", rules);
            Assert.Contains("checkin_submission_identity", rules);
        }

        // Even accidental future writes fail at PostgreSQL, including writes matching zero rows.
        var guardedWrite =
            sql[..sql.IndexOf("WITH checks", StringComparison.Ordinal)]
            + "UPDATE coaching.\"Applications\" SET \"Status\" = \"Status\" WHERE false; ROLLBACK;";
        await using var write = new NpgsqlCommand(guardedWrite, connection);
        var error = await Assert.ThrowsAsync<PostgresException>(() => write.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.ReadOnlySqlTransaction, error.SqlState);
        await using var rollback = new NpgsqlCommand("ROLLBACK", connection);
        await rollback.ExecuteNonQueryAsync();
    }
}
