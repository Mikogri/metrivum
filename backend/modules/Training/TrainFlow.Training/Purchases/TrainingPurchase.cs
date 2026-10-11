using TrainFlow.Training.Infrastructure;
namespace TrainFlow.Training.Purchases;
public sealed class TrainingPurchase
{
    public Guid OrderId { get; set; }
    public Guid ApplicationId { get; set; }
    public Guid SellerId { get; set; }
    public Guid BuyerId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid SourceRevisionId { get; set; }
    public string Name { get; set; } = "";
    public string Snapshot { get; set; } = "{}";
    public Guid? PlanId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
}
public sealed record PurchasedPlanDto(Guid OrderId, Guid ApplicationId, string Name, Guid? PlanId, DateTimeOffset CreatedAt, DateTimeOffset? DeliveredAt);
