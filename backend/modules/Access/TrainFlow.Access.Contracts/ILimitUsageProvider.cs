namespace TrainFlow.Access.Contracts;

public interface ILimitUsageProvider
{
    Task<IReadOnlyList<LimitDecision>> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken);
}
