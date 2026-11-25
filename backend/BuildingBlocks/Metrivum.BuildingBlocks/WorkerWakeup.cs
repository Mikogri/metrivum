using System.Threading.Channels;

namespace Metrivum.BuildingBlocks;

/// <summary>Coalesces local wakeups for one durable worker. The database remains authoritative.</summary>
public sealed class WorkerWakeup<TWorker>
{
    public static readonly TimeSpan RecoveryInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan MinimumDelay = TimeSpan.FromSeconds(1);

    private readonly Channel<bool> pending = Channel.CreateBounded<bool>(1);

    public Task SignalAsync(CancellationToken _)
    {
        pending.Writer.TryWrite(true);
        return Task.CompletedTask;
    }

    public static TimeSpan DelayUntil(DateTimeOffset? next, DateTimeOffset now) =>
        next is null ? RecoveryInterval
        : next - now < MinimumDelay ? MinimumDelay
        : next - now > RecoveryInterval ? RecoveryInterval
        : next.Value - now;

    public async Task<bool> WaitAsync(TimeSpan delay, CancellationToken stoppingToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        timeout.CancelAfter(delay);
        try
        {
            await pending.Reader.ReadAsync(timeout.Token);
            return true;
        }
        catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
        {
            return false;
        }
    }
}
