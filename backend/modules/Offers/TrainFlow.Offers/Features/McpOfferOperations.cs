using TrainFlow.Offers.Contracts;

namespace TrainFlow.Offers.Features;

public sealed class McpOfferOperations(OffersService offers) : IMcpOfferOperations
{
    public async Task<McpOfferPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct)
    {
        var result = await offers.ListAsync(page, pageSize, null, search, "updated", ct);
        return new(result.Items.Select(x => new McpOffer(x.Id, x.Name, x.Description, x.Category, x.Status.ToString(), x.CoachingMode.ToString())).ToArray(), page, pageSize, result.Total);
    }
}
