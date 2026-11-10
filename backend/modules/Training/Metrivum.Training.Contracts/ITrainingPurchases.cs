namespace Metrivum.Training.Contracts;

// Internal Billing contract; no public route can prepare or fulfill a purchase.
public interface ITrainingPurchases
{
    Task PrepareAsync(
        Guid orderId,
        Guid applicationId,
        Guid revisionId,
        Guid sellerId,
        Guid buyerId,
        Guid? teamId,
        CancellationToken ct
    );
    Task<Guid> FulfillAsync(Guid orderId, CancellationToken ct);
}
