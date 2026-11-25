using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class WorkerWakeupTests
{
    [Fact]
    public async Task Bursts_coalesce_and_signals_wake_an_idle_worker()
    {
        var wakeup = new WorkerWakeup<WorkerWakeupTests>();
        await wakeup.SignalAsync(default);
        await wakeup.SignalAsync(default);
        Assert.True(await wakeup.WaitAsync(TimeSpan.FromSeconds(1), default));
        Assert.False(await wakeup.WaitAsync(TimeSpan.Zero, default));

        var waiting = wakeup.WaitAsync(TimeSpan.FromSeconds(3), default);
        await wakeup.SignalAsync(default);
        Assert.True(await waiting);
    }

    [Theory]
    [InlineData(null, 60)]
    [InlineData(180, 60)]
    [InlineData(12, 12)]
    [InlineData(-1, 1)]
    public void Wait_is_bounded_by_due_time_recovery_and_contention(int? dueIn, int seconds)
    {
        var now = DateTimeOffset.UnixEpoch;
        DateTimeOffset? due = dueIn is int offset ? now.AddSeconds(offset) : null;
        Assert.Equal(
            TimeSpan.FromSeconds(seconds),
            WorkerWakeup<WorkerWakeupTests>.DelayUntil(due, now)
        );
    }
}
