using System.Net.Http.Json;
using Metrivum.Billing.Features;

namespace Metrivum.IntegrationTests;

internal static class TestPlans
{
    public static async Task ActivateProAsync(HttpClient client)
    {
        var checkout = await client.PostAsJsonAsync("/api/v1/me/platform-subscription/checkout", new PlatformCheckoutRequest("Pro", "eur-monthly-v3-Pro"));
        checkout.EnsureSuccessStatusCode();
        var subscription = await checkout.Content.ReadFromJsonAsync<PlatformSubscriptionDto>();
        (await client.PostAsJsonAsync("/api/v1/me/platform-subscription/confirm-payment",
            new PlatformConfirmRequest(subscription!.PendingDue!.Id, Guid.NewGuid().ToString()))).EnsureSuccessStatusCode();
    }
}
