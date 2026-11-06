using Metrivum.BuildingBlocks;
using Npgsql;

namespace Metrivum.Access.Infrastructure;

public sealed class PostgresAbuseCounterStore : IAbuseCounterStore, IDisposable
{
    private readonly NpgsqlDataSource source;
    private readonly NpgsqlDataSource leases;
    private readonly SemaphoreSlim leaseSlots = new(8, 8);

    public PostgresAbuseCounterStore(string connectionString)
    {
        // Admission can run while a ModuleTransaction holds an application-pool connection.
        // An independent bounded pool prevents all request connections waiting on each other.
        // NpgsqlDataSource.ConnectionString redacts credentials. Use the original host-validated
        // configuration to create private pools; never enable Persist Security Info globally.
        var settings = new NpgsqlConnectionStringBuilder(connectionString)
        { MaxPoolSize = 4, MinPoolSize = 0, Timeout = 3, CommandTimeout = 5, IncludeErrorDetail = false, ApplicationName = "Metrivum abuse admission" };
        source = NpgsqlDataSource.Create(settings.ConnectionString);
        settings.MaxPoolSize = 8;
        settings.ApplicationName = "Metrivum operation leases";
        leases = NpgsqlDataSource.Create(settings.ConnectionString);
    }

    public async Task<bool> TryAcquireAsync(Guid userId, string policy, AbuseLimit limit, CancellationToken cancellationToken)
    {
        if (limit.Concurrent) throw new ArgumentException("Concurrency policies require leases.", nameof(limit));
        // A separate autocommit command makes admission survive a rejected/rolled-back business
        // transaction. The unique owner/policy row coordinates every API instance without reading
        // or parallelizing operations on the request's ModuleTransaction connection.
        await using var command = source.CreateCommand("""
            INSERT INTO access.abuse_windows AS budget ("UserId", "Policy", "WindowStart", "Count")
            VALUES (@user, @policy, statement_timestamp(), 1)
            ON CONFLICT ("UserId", "Policy") DO UPDATE
            SET "WindowStart" = CASE
                    WHEN EXTRACT(EPOCH FROM (statement_timestamp() - budget."WindowStart")) >= @seconds
                    THEN statement_timestamp() ELSE budget."WindowStart" END,
                "Count" = CASE
                    WHEN EXTRACT(EPOCH FROM (statement_timestamp() - budget."WindowStart")) >= @seconds
                    THEN CASE WHEN @refill = 0 THEN 1
                        ELSE GREATEST(0, budget."Count" - FLOOR(EXTRACT(EPOCH FROM (statement_timestamp() - budget."WindowStart")) / @seconds) * @refill)::int + 1 END
                    ELSE budget."Count" + 1 END
            WHERE CASE WHEN EXTRACT(EPOCH FROM (statement_timestamp() - budget."WindowStart")) >= @seconds
                    THEN CASE WHEN @refill = 0 THEN 0
                        ELSE GREATEST(0, budget."Count" - FLOOR(EXTRACT(EPOCH FROM (statement_timestamp() - budget."WindowStart")) / @seconds) * @refill)::int END
                    ELSE budget."Count" END < @permits
            RETURNING 1
            """);
        command.CommandTimeout = 5;
        command.Parameters.AddWithValue("user", userId);
        command.Parameters.AddWithValue("policy", policy);
        command.Parameters.AddWithValue("seconds", limit.WindowSeconds);
        command.Parameters.AddWithValue("refill", limit.Refill);
        command.Parameters.AddWithValue("permits", limit.Permits);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<IAsyncDisposable?> TryEnterAsync(Guid userId, string policy, AbuseLimit limit, CancellationToken cancellationToken)
    {
        if (!limit.Concurrent || limit.Permits is < 1 or > 100)
            throw new ArgumentException("A bounded concurrency policy is required.", nameof(limit));
        if (!await leaseSlots.WaitAsync(0, cancellationToken)) return null;
        NpgsqlConnection? connection = null;
        NpgsqlTransaction? transaction = null;
        var transferred = false;
        try
        {
            connection = await leases.OpenConnectionAsync(cancellationToken);
            transaction = await connection.BeginTransactionAsync(cancellationToken);
            for (var slot = 0; slot < limit.Permits; slot++)
            {
                await using var command = new NpgsqlCommand("SELECT pg_try_advisory_xact_lock(hashtextextended(@key, 0))", connection, transaction);
                command.CommandTimeout = 5;
                command.Parameters.AddWithValue("key", $"abuse-concurrency:{userId:N}:{policy}:{slot}");
                if (await command.ExecuteScalarAsync(cancellationToken) is not true) continue;
                transferred = true;
                // Transaction-scoped locks remain correct behind transaction poolers. Releasing
                // on request cancellation would let unfinished synchronous renders exceed the cap.
                return new OperationLease(connection, transaction, leaseSlots);
            }
            return null;
        }
        finally
        {
            if (!transferred)
            {
                try { if (transaction is not null) await transaction.DisposeAsync(); }
                finally
                {
                    try { if (connection is not null) await connection.DisposeAsync(); }
                    finally { leaseSlots.Release(); }
                }
            }
        }
    }

    public void Dispose() { source.Dispose(); leases.Dispose(); leaseSlots.Dispose(); }

    private sealed class OperationLease(NpgsqlConnection connection, NpgsqlTransaction transaction, SemaphoreSlim slots) : IAsyncDisposable
    {
        private int released;
        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref released, 1) != 0) return;
            try { await transaction.DisposeAsync(); }
            finally
            {
                try { await connection.DisposeAsync(); }
                finally { slots.Release(); }
            }
        }
    }
}
