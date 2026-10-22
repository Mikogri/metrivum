namespace TrainFlow.Offers.Contracts;

public sealed record McpOffer(Guid Id, string Name, string Description, string Category, string Status, string CoachingMode);
public sealed record McpOfferPage(McpOffer[] Items, int Page, int PageSize, long Total);
public interface IMcpOfferOperations
{
    Task<McpOfferPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct);
}
