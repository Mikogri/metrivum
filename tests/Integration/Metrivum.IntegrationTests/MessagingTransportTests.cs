using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Protocol;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Messaging.Domain;
using Metrivum.Messaging.Features;

namespace Metrivum.IntegrationTests;

public sealed class MessagingTransportTests
{
    [Fact]
    public void Realtime_message_json_matches_rest_string_enums_and_camel_case_contract()
    {
        using var factory = new ApiFactory();
        var protocol = factory.Services.GetServices<IHubProtocol>().Single(x => x.Name == "json");
        var message = new MessageDto(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), MessageType.Text,
            "Hello", null, DateTimeOffset.UtcNow, "cursor", []);
        var bytes = protocol.GetMessageBytes(new InvocationMessage("MessageCreated", [message]));
        using var json = JsonDocument.Parse(Encoding.UTF8.GetString(bytes.Span).TrimEnd('\u001e'));
        var payload = json.RootElement.GetProperty("arguments")[0];
        Assert.Equal("Text", payload.GetProperty("type").GetString());
        Assert.Equal(message.SenderUserId, payload.GetProperty("senderUserId").GetGuid());
        Assert.False(payload.TryGetProperty("SenderUserId", out _));
    }

    [Fact]
    public async Task Browser_transport_preflight_allows_only_configured_origin_and_signalr_headers()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        foreach (var origin in new[] { "http://localhost:5173", "https://untrusted.invalid" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Options, "/api/v1/messaging/hub/negotiate");
            request.Headers.Add("Origin", origin);
            request.Headers.Add("Access-Control-Request-Method", "POST");
            request.Headers.Add("Access-Control-Request-Headers", "authorization,x-signalr-user-agent");
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            if (origin.Contains("localhost", StringComparison.Ordinal))
            {
                Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
                Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
                Assert.Contains("X-SignalR-User-Agent", string.Join(',', response.Headers.GetValues("Access-Control-Allow-Headers")), StringComparison.OrdinalIgnoreCase);
            }
            else
                Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
        }
    }

    [Fact]
    public async Task Query_jwt_is_not_a_rest_or_negotiate_authentication_bypass()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var token = Uri.EscapeDataString(factory.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/messaging/conversations?access_token=" + token)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me/notifications?access_token=" + token)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/notifications/hub/negotiate?negotiateVersion=1&access_token=" + token, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/messaging/hub/negotiate?negotiateVersion=1&access_token=" + token, null)).StatusCode);
    }
}
