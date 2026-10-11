using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TrainFlow.Notifications;

namespace TrainFlow.UnitTests;

public sealed class MobilePushTests
{
    [Fact]
    public async Task Expo_transport_sends_only_generic_text_and_resource_identifiers_and_reads_invalidation()
    {
        var handler = new PushHandler();
        var transport = new ExpoPushTransport(new HttpClient(handler), Options.Create(new ExpoPushOptions { Enabled = true }));
        var notification = new Notification { RecipientUserId = Guid.NewGuid(), SourceModule = "Messaging", SourceId = Guid.NewGuid(), DeepLink = "/private?secret=yes", Type = "Private health detail" };
        var ticket = await transport.SendAsync("ExpoPushToken[test]", notification, default);
        Assert.Equal("receipt-1", ticket.TicketId);
        using var body = JsonDocument.Parse(handler.Bodies[0]);
        var data = body.RootElement.GetProperty("data");
        Assert.Equal(4, data.EnumerateObject().Count());
        Assert.Equal(notification.RecipientUserId, data.GetProperty("accountId").GetGuid());
        Assert.DoesNotContain("Private health", handler.Bodies[0]);
        Assert.DoesNotContain("secret", handler.Bodies[0]);
        Assert.Equal("DeviceNotRegistered", (await transport.ReceiptAsync("receipt-1", default))!.Error);
    }
    private sealed class PushHandler : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return new(HttpStatusCode.OK) { Content = new StringContent(Bodies.Count == 1
                ? "{\"data\":{\"status\":\"ok\",\"id\":\"receipt-1\"}}"
                : "{\"data\":{\"receipt-1\":{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}}}", Encoding.UTF8, "application/json") };
        }
    }
}
