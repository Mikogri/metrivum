using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Metrivum.Api.Development;

/// <summary>
/// Development only: removes one account and everything tied to it, in every module, plus its sign-in and stored files.
///
/// <c>dotnet run --project apps/api/Metrivum.Api -- --delete-account &lt;email or user id&gt;</c> shows what would go;
/// adding <c>--confirm</c> deletes it. Settings offer the same for the signed-in account (DevelopmentEndpoints).
///
/// "Tied to" is found by following references: a row belongs to the account when any of its id columns points at the
/// account or at a row that already belongs to it (workspace, plans, relationships, conversations, ...). Only row ids
/// are followed, never other columns, so shared rows such as catalog entries are kept. Rows other people own that hang
/// off this account (for example messages in a conversation with it) go too, as they would in a cascading delete.
/// </summary>
public sealed record ErasureTableCount(string Table, long Rows);

/// <summary>What deleting the account removes: rows per table, stored files, and the sign-in account itself.</summary>
public sealed record ErasurePreview(Guid UserId, IReadOnlyList<ErasureTableCount> Tables, long Rows, int Files);

public sealed record AccountEraserOptions(string ConnectionString, bool UseMigratorRole, string? SupabaseUrl, string? SecretKey)
{
    public bool CanReachSupabase => !string.IsNullOrWhiteSpace(SupabaseUrl) && !string.IsNullOrWhiteSpace(SecretKey);

    /// <summary>Null outside Development or without the owner connection (the API role may not delete history rows).</summary>
    public static AccountEraserOptions? From(IConfiguration configuration, IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("MigrationDatabase");
        if (!environment.IsDevelopment() || string.IsNullOrWhiteSpace(connectionString))
            return null;
        return new(connectionString, configuration.GetValue<bool>("Migrations:UseMigratorRole"), configuration["Storage:Url"]?.TrimEnd('/'), configuration["Storage:SecretKey"]);
    }
}

/// <summary>Deletes an explicitly selected development account and its related module data; never runs automatically during API startup.</summary>
public static class AccountEraser
{
    private const int MaxRounds = 25;

    /// <summary>The command line: <c>--delete-account &lt;email or user id&gt; [--confirm]</c>.</summary>
    public static async Task<int> RunAsync(IConfiguration configuration, IHostEnvironment environment, string target, bool confirm, CancellationToken ct = default)
    {
        var options = AccountEraserOptions.From(configuration, environment);
        if (options is null)
        {
            Console.Error.WriteLine("--delete-account runs only with ASPNETCORE_ENVIRONMENT=Development and ConnectionStrings__MigrationDatabase (the owner role used by --migrate).");
            return 2;
        }
        if (!Guid.TryParse(target, out var userId))
        {
            if (!options.CanReachSupabase)
            {
                Console.Error.WriteLine("Finding a user by email needs Storage:Url and Storage:SecretKey (the project secret key). Pass the user id instead.");
                return 2;
            }
            using var http = Client(options);
            var found = await FindUserIdAsync(http, options.SupabaseUrl!, target.Trim(), ct);
            if (found is null)
            {
                Console.Error.WriteLine($"No sign-in account with the email {target}.");
                return 1;
            }
            userId = found.Value;
        }
        Console.WriteLine($"Account {target} -> user id {userId}");

        var preview = await PreviewAsync(options, userId, ct);
        Console.WriteLine();
        if (preview.Tables.Count == 0)
            Console.WriteLine("No rows in the app tables belong to this account.");
        foreach (var table in preview.Tables)
            Console.WriteLine($"  {table.Table,-60} {table.Rows,8}");
        Console.WriteLine($"  {"stored files",-60} {preview.Files,8}");
        Console.WriteLine($"  {"sign-in account (Supabase Auth)",-60} {1,8}");
        Console.WriteLine();
        if (!confirm)
        {
            Console.WriteLine("Dry run: nothing was deleted. Run again with --confirm to delete all of the above.");
            return 0;
        }
        try
        {
            var done = await EraseAsync(options, userId, ct);
            Console.WriteLine($"Deleted {done.Rows} rows in {done.Tables.Count} tables, {done.Files} stored file(s) and the sign-in account.");
            return 0;
        }
        catch (Exception error) when (error is InvalidOperationException or HttpRequestException)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    public static async Task<ErasurePreview> PreviewAsync(AccountEraserOptions options, Guid userId, CancellationToken ct)
    {
        await using var db = await OpenAsync(options, ct);
        return (await CollectAsync(db, userId, ct)).Preview;
    }

    /// <summary>
    /// Deletes the rows (one transaction), then the stored files and the sign-in account. Throws when something could
    /// not be removed; the message says what is left.
    /// </summary>
    public static async Task<ErasurePreview> EraseAsync(AccountEraserOptions options, Guid userId, CancellationToken ct)
    {
        ErasurePreview preview;
        List<(string Bucket, string Key)> files;
        await using (var db = await OpenAsync(options, ct))
        {
            var collected = await CollectAsync(db, userId, ct);
            preview = collected.Preview;
            files = collected.Files;
            await DeleteRowsAsync(db, collected.Tables, collected.Ids, ct);
        }
        if (!options.CanReachSupabase)
            throw new InvalidOperationException("The app data is gone. Storage:Url / Storage:SecretKey are not set, so delete the sign-in account and its files in the Supabase dashboard.");
        using var http = Client(options);
        var failedFiles = 0;
        foreach (var bucket in files.GroupBy(x => x.Bucket))
            foreach (var chunk in bucket.Select(x => x.Key).Chunk(100))
            {
                using var request = new HttpRequestMessage(HttpMethod.Delete, $"{options.SupabaseUrl}/storage/v1/object/{Uri.EscapeDataString(bucket.Key)}")
                {
                    Content = JsonContent.Create(new { prefixes = chunk })
                };
                using var response = await http.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode)
                    failedFiles += chunk.Length;
            }
        using (var response = await http.DeleteAsync($"{options.SupabaseUrl}/auth/v1/admin/users/{userId}", ct))
            if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.NotFound)
                throw new InvalidOperationException($"The app data is gone, but Supabase refused to delete the sign-in account (HTTP {(int)response.StatusCode}). Delete it in the dashboard.");
        if (failedFiles > 0)
            throw new InvalidOperationException($"The account is gone, but {failedFiles} stored file(s) could not be deleted. Remove them in Supabase Storage.");
        return preview;
    }

    private sealed record Collected(ErasurePreview Preview, List<Table> Tables, HashSet<Guid> Ids, List<(string Bucket, string Key)> Files);

    private static async Task<Collected> CollectAsync(NpgsqlConnection db, Guid userId, CancellationToken ct)
    {
        var tables = await TablesAsync(db, ct);
        var ids = await TiedIdsAsync(db, tables, userId, ct);
        var counts = new List<(Table Table, long Rows)>();
        foreach (var table in tables)
        {
            var rows = await ScalarAsync<long>(db, null, $"SELECT count(*) FROM {table.Name} WHERE {table.Predicate}", ct, ids);
            if (rows > 0)
                counts.Add((table, rows));
        }
        var files = await StoredFilesAsync(db, tables, ids, ct);
        var preview = new ErasurePreview(userId,
            counts.OrderBy(x => x.Table.Label, StringComparer.Ordinal).Select(x => new ErasureTableCount(x.Table.Label, x.Rows)).ToList(),
            counts.Sum(x => x.Rows), files.Count);
        return new(preview, counts.Select(x => x.Table).ToList(), ids, files);
    }

    private static async Task<NpgsqlConnection> OpenAsync(AccountEraserOptions options, CancellationToken ct)
    {
        var db = new NpgsqlConnection(options.ConnectionString);
        await db.OpenAsync(ct);
        if (options.UseMigratorRole)
            await ExecuteAsync(db, null, "SET ROLE trainflow_migrator", ct);
        return db;
    }

    private static HttpClient Client(AccountEraserOptions options)
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", options.SecretKey);
        http.DefaultRequestHeaders.Add("apikey", options.SecretKey);
        return http;
    }

    private sealed record Table(string Schema, string TableName, bool HasId, IReadOnlyList<string> UuidColumns, IReadOnlyList<string> TextIdColumns)
    {
        public string Name => $"{Quote(Schema)}.{Quote(TableName)}";
        public string Label => $"{Schema}.{TableName}";

        /// <summary>Any id column of the row points at something that belongs to the account ($1 uuid[], $2 text[]).</summary>
        public string Predicate => string.Join(" OR ",
            UuidColumns.Select(c => $"{Quote(c)} = ANY($1)").Concat(TextIdColumns.Select(c => $"{Quote(c)} = ANY($2)")));
    }

    private static async Task<List<Table>> TablesAsync(NpgsqlConnection db, CancellationToken ct)
    {
        // The app's schemas are the ones EF migrates; Supabase's own schemas (auth, storage, ...) are left alone.
        const string sql = """
            SELECT c.table_schema, c.table_name, c.column_name, c.data_type
            FROM information_schema.columns c
            JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
            WHERE c.table_schema IN (SELECT table_schema FROM information_schema.tables WHERE table_name = '__EFMigrationsHistory')
              AND c.table_name <> '__EFMigrationsHistory'
              AND (c.data_type = 'uuid' OR (c.data_type IN ('text', 'character varying') AND lower(c.column_name) LIKE '%id'))
            ORDER BY 1, 2, 3
            """;
        var columns = new List<(string Schema, string Table, string Column, string Type)>();
        await using (var command = new NpgsqlCommand(sql, db))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct))
                columns.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3)));
        return columns.GroupBy(x => (x.Schema, x.Table)).Select(g => new Table(g.Key.Schema, g.Key.Table,
            g.Any(x => x.Column == "Id" && x.Type == "uuid"),
            g.Where(x => x.Type == "uuid").Select(x => x.Column).ToList(),
            g.Where(x => x.Type != "uuid").Select(x => x.Column).ToList())).ToList();
    }

    /// <summary>The account id plus the ids of every row that (through any chain of references) points at it.</summary>
    private static async Task<HashSet<Guid>> TiedIdsAsync(NpgsqlConnection db, List<Table> tables, Guid userId, CancellationToken ct)
    {
        var ids = new HashSet<Guid> { userId };
        for (var round = 0; round < MaxRounds; round++)
        {
            var added = 0;
            foreach (var table in tables.Where(t => t.HasId))
            {
                var sql = $"SELECT \"Id\" FROM {table.Name} WHERE NOT (\"Id\" = ANY($1)) AND ({table.Predicate})";
                await using var command = Command(db, null, sql, ids);
                await using var reader = await command.ExecuteReaderAsync(ct);
                var found = new List<Guid>();
                while (await reader.ReadAsync(ct))
                    found.Add(reader.GetGuid(0));
                await reader.CloseAsync();
                foreach (var id in found)
                    if (ids.Add(id))
                        added++;
            }
            if (added == 0)
                return ids;
        }
        throw new InvalidOperationException($"References were still growing after {MaxRounds} rounds; nothing was deleted.");
    }

    private static async Task<List<(string Bucket, string Key)>> StoredFilesAsync(NpgsqlConnection db, List<Table> tables, HashSet<Guid> ids, CancellationToken ct)
    {
        var files = new List<(string, string)>();
        var media = tables.FirstOrDefault(t => t.Schema == "media" && t.TableName == "files");
        if (media is null)
            return files;
        await using var command = Command(db, null, $"SELECT \"Bucket\", \"ObjectKey\" FROM {media.Name} WHERE {media.Predicate}", ids);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            if (!reader.IsDBNull(0) && !reader.IsDBNull(1) && reader.GetString(1).Length > 0)
                files.Add((reader.GetString(0), reader.GetString(1)));
        return files;
    }

    /// <summary>
    /// One transaction. Tables are emptied in whatever order foreign keys allow (a blocked table is retried after the
    /// others). History tables guard themselves with triggers that refuse deletes; those user triggers are switched
    /// off only for this delete and switched back on before the commit.
    /// </summary>
    private static async Task DeleteRowsAsync(NpgsqlConnection db, List<Table> pending, HashSet<Guid> ids, CancellationToken ct)
    {
        await using var transaction = await db.BeginTransactionAsync(ct);
        while (pending.Count > 0)
        {
            var done = new List<Table>();
            string? lastError = null;
            foreach (var table in pending)
            {
                await ExecuteAsync(db, transaction, "SAVEPOINT erase", ct);
                try
                {
                    await ExecuteAsync(db, transaction, $"ALTER TABLE {table.Name} DISABLE TRIGGER USER", ct);
                    await ExecuteAsync(db, transaction, $"DELETE FROM {table.Name} WHERE {table.Predicate}", ct, ids);
                    await ExecuteAsync(db, transaction, $"ALTER TABLE {table.Name} ENABLE TRIGGER USER", ct);
                    await ExecuteAsync(db, transaction, "RELEASE SAVEPOINT erase", ct);
                    done.Add(table);
                }
                catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.ForeignKeyViolation)
                {
                    await ExecuteAsync(db, transaction, "ROLLBACK TO SAVEPOINT erase", ct);
                    lastError = $"{table.Name}: {error.MessageText}";
                }
            }
            if (done.Count == 0)
                throw new InvalidOperationException($"Some rows are still referenced from elsewhere; nothing was deleted. Last error: {lastError}");
            pending = pending.Except(done).ToList();
        }
        await transaction.CommitAsync(ct);
    }

    private static async Task<Guid?> FindUserIdAsync(HttpClient http, string url, string email, CancellationToken ct)
    {
        for (var page = 1; page <= 100; page++)
        {
            using var response = await http.GetAsync($"{url}/auth/v1/admin/users?page={page}&per_page=200", ct);
            response.EnsureSuccessStatusCode();
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var users = json.RootElement.GetProperty("users");
            if (users.GetArrayLength() == 0)
                return null;
            foreach (var user in users.EnumerateArray())
                if (user.TryGetProperty("email", out var value) && string.Equals(value.GetString(), email, StringComparison.OrdinalIgnoreCase))
                    return user.GetProperty("id").GetGuid();
        }
        return null;
    }

    private static NpgsqlCommand Command(NpgsqlConnection db, NpgsqlTransaction? transaction, string sql, HashSet<Guid>? ids = null)
    {
        var command = new NpgsqlCommand(sql, db, transaction);
        if (ids is not null)
        {
            command.Parameters.Add(new NpgsqlParameter { Value = ids.ToArray() });
            command.Parameters.Add(new NpgsqlParameter { Value = ids.Select(x => x.ToString()).ToArray() });
        }
        return command;
    }

    private static async Task ExecuteAsync(NpgsqlConnection db, NpgsqlTransaction? transaction, string sql, CancellationToken ct, HashSet<Guid>? ids = null)
    {
        await using var command = Command(db, transaction, sql, ids);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task<T> ScalarAsync<T>(NpgsqlConnection db, NpgsqlTransaction? transaction, string sql, CancellationToken ct, HashSet<Guid>? ids = null)
    {
        await using var command = Command(db, transaction, sql, ids);
        return (T)(await command.ExecuteScalarAsync(ct))!;
    }

    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";
}
