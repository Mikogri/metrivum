using Microsoft.EntityFrameworkCore;
using Npgsql;
using Microsoft.Extensions.Logging;

namespace Metrivum.BuildingBlocks;
/// <summary>One physical transaction across module contracts within a request or worker scope.</summary>
public sealed class ModuleTransaction(NpgsqlDataSource dataSource, ILogger<ModuleTransaction>? logger = null) : IDisposable, IAsyncDisposable
{
    private readonly List<DbContext> contexts = [];
    private NpgsqlTransaction? transaction;
    private readonly List<Func<CancellationToken, Task>> committedCallbacks = [];
    public void OnCommitted(Func<CancellationToken, Task> callback)
    {
        if (transaction is null)
            throw new InvalidOperationException("After-commit callbacks require an active transaction.");
        committedCallbacks.Add(callback);
    }

    public NpgsqlConnection Connection { get; } = dataSource.CreateConnection();
    public bool IsActive => transaction is not null;

    internal void Register(DbContext context)
    {
        contexts.Add(context);
        if (transaction is not null)
            context.Database.UseTransaction(transaction);
    }

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct)
    {
        if (transaction is not null)
            return await action(ct);
        if (Connection.State != System.Data.ConnectionState.Open)
            await Connection.OpenAsync(ct);
        await using var current = await Connection.BeginTransactionAsync(ct);
        transaction = current;
        T result;
        Func<CancellationToken, Task>[] callbacks;
        try
        {
            foreach (var context in contexts)
                await context.Database.UseTransactionAsync(current, ct);
            result = await action(ct);
            await current.CommitAsync(ct);
            callbacks = committedCallbacks.ToArray();
        }
        catch
        {
            // A provider may already have aborted and detached the transaction. Preserve the
            // original failure instead of replacing it with "transaction has completed".
            if (current.Connection is not null)
            {
                try { await current.RollbackAsync(CancellationToken.None); }
                catch (Exception rollback) when (rollback is InvalidOperationException or NpgsqlException)
                {
                    logger?.LogWarning("Rollback failed with {FailureType}; preserving the original operation failure", rollback.GetType().Name);
                }
            }
            foreach (var context in contexts)
                context.ChangeTracker.Clear();
            throw;
        }
        finally
        {
            committedCallbacks.Clear();
            transaction = null;
            foreach (var context in contexts)
                await context.Database.UseTransactionAsync(null, CancellationToken.None);
        }

        // The durable commit has succeeded. Callbacks may open new module transactions.
        foreach (var callback in callbacks)
            await callback(CancellationToken.None);
        return result;
    }

    public Task RunAsync(Func<CancellationToken, Task> action, CancellationToken ct) => RunAsync(async token =>
    {
        await action(token);
        return true;
    }, ct);
    public ValueTask DisposeAsync() => Connection.DisposeAsync();
    public void Dispose() => Connection.Dispose();
}
