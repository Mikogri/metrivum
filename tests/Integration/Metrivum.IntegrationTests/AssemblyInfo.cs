using Xunit;

// Bound concurrent database/host fixtures; individual tests still exercise concurrent requests.
[assembly: CollectionBehavior(MaxParallelThreads = 4)]
