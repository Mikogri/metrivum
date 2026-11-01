using Metrivum.Offers.Contracts;
using Metrivum.Offers.Domain;
namespace Metrivum.UnitTests;
public sealed class PlanSaleRulesTests
{
    [Fact]
    public void One_time_price_is_a_supported_purchase_without_session_counts()
    {
        OfferRules.Validate(new(Guid.NewGuid(), "Plan", (BillingModel)4, 25));
    }
}
