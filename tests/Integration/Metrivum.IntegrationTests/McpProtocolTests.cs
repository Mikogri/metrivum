using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using Metrivum.Integrations.Domain;
using Metrivum.Integrations.Features;
using Metrivum.Integrations.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class CatalogPostgresTheoryAttribute : TheoryAttribute
{
    public CatalogPostgresTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")))
            Skip = "Set TRAINFLOW_TEST_DATABASE to a migrated, disposable PostgreSQL database.";
    }
}

public sealed class McpProtocolTests
{
    [CatalogPostgresTheory]
    [InlineData("2025-11-25")]
    [InlineData("2026-07-28")]
    public async Task Generic_sdk_client_lists_tools_creates_valid_draft_and_executes_only_human_approved_message(string protocolVersion)
    {
        using var source = new ApiFactory(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        using var factory = source.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Mcp:Enabled", "true");
            builder.UseSetting("Mcp:PublicResourceUrl", "http://localhost/mcp");
            builder.UseSetting("Mcp:WebUrl", "http://localhost");
        });
        var coach = Guid.NewGuid();
        var recipient = Guid.NewGuid();
        using var human = factory.CreateClient();
        using var clientUser = factory.CreateClient();
        human.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(coach));
        clientUser.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(recipient));
        await Onboard(human, coach, "Coach");
        await TestPlans.ActivateProAsync(human);
        await Onboard(clientUser, recipient, "Client");
        var response = await human.PostAsJsonAsync("/api/v1/messaging/conversations/direct", new { userId = recipient });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var conversation = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var oauthClient = Guid.NewGuid().ToString();
        IntegrationConnection connection;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>();
            connection = new() { UserId = coach, ClientId = oauthClient, ClientName = "Generic protocol fixture", Grants = IntegrationGrants.All, CreatedAt = DateTimeOffset.UtcNow };
            db.Connections.Add(connection);
            await db.SaveChangesAsync();
        }
        using var transportHttp = factory.CreateClient();
        var transport = new HttpClientTransport(new HttpClientTransportOptions
        {
            Endpoint = new Uri(transportHttp.BaseAddress!, "/mcp"), TransportMode = HttpTransportMode.StreamableHttp,
            AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = "Bearer " + source.Token(coach, oauthClientId: oauthClient) }
        }, transportHttp);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        await using var mcp = await McpClient.CreateAsync(transport, new McpClientOptions { ProtocolVersion = protocolVersion }, cancellationToken: timeout.Token);
        var tools = await mcp.ListToolsAsync(cancellationToken: timeout.Token);
        if (Environment.GetEnvironmentVariable("TRAINFLOW_MCP_CATALOG_OUTPUT") is { Length: > 0 } catalogOutput)
            await File.WriteAllTextAsync(catalogOutput, JsonSerializer.Serialize(tools.Select(x => x.ProtocolTool), new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }), timeout.Token);
        Assert.Contains(tools, x => x.Name == "prepare_message");
        Assert.Contains(tools, x => x.Name == "validate_program");
        Assert.DoesNotContain(tools, x => x.Name.Contains("publish") || x.Name.Contains("payment") || x.Name.Contains("delete"));
        var context = await mcp.CallToolAsync("get_my_context", cancellationToken: timeout.Token);
        Assert.False(context.IsError == true);
        Assert.Equal(coach, Data(context).GetProperty("userId").GetGuid());
        var draftArgs = new Dictionary<string, object?>
        {
            ["draft"] = new { name = "Protocol draft", description = "Private integration draft", folderId = (Guid?)null, document = new { schemaVersion = 1, blocks = Array.Empty<object>() } },
            ["idempotencyKey"] = Guid.NewGuid()
        };
        var draft = await mcp.CallToolAsync("create_program_draft", draftArgs, cancellationToken: timeout.Token);
        Assert.False(draft.IsError == true, Text(draft));
        Assert.Equal(Data(draft).GetProperty("id").GetGuid(), Data(await mcp.CallToolAsync("create_program_draft", draftArgs, cancellationToken: timeout.Token)).GetProperty("id").GetGuid());
        var validation = await mcp.CallToolAsync("validate_program", new Dictionary<string, object?> { ["document"] = new { schemaVersion = 1, blocks = Array.Empty<object>() } }, cancellationToken: timeout.Token);
        Assert.False(validation.IsError == true, Text(validation));
        Assert.True(Data(validation).GetProperty("valid").GetBoolean());
        var prepared = await mcp.CallToolAsync("prepare_message", new Dictionary<string, object?> { ["conversationId"] = conversation, ["body"] = "Approved through the real protocol", ["idempotencyKey"] = Guid.NewGuid() }, cancellationToken: timeout.Token);
        Assert.False(prepared.IsError == true, Text(prepared));
        var action = Data(prepared);
        var actionId = action.GetProperty("id").GetGuid();
        Assert.Equal($"http://localhost/app/integrations/actions/{actionId}", action.GetProperty("reviewUrl").GetString());
        var forged = await mcp.CallToolAsync("send_approved_message", new Dictionary<string, object?> { ["actionId"] = actionId, ["approved"] = true }, cancellationToken: timeout.Token);
        Assert.True(forged.IsError == true);
        Assert.Equal("validation_failed", Data(forged).GetProperty("code").GetString());
        var sendArgs = new Dictionary<string, object?> { ["actionId"] = actionId };
        var denied = await mcp.CallToolAsync("send_approved_message", sendArgs, cancellationToken: timeout.Token);
        Assert.True(denied.IsError == true);
        Assert.Equal("approval_required", Data(denied).GetProperty("code").GetString());
        var approval = await human.PostAsJsonAsync($"/api/v1/me/ai-actions/{actionId}/approve", new { expectedVersion = action.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, approval.StatusCode);
        var sent = await mcp.CallToolAsync("send_approved_message", sendArgs, cancellationToken: timeout.Token);
        Assert.False(sent.IsError == true, Text(sent));
        Assert.Equal(Data(sent).GetProperty("messageId").GetGuid(), Data(await mcp.CallToolAsync("send_approved_message", sendArgs, cancellationToken: timeout.Token)).GetProperty("messageId").GetGuid());
        var revoke = await human.PostAsync($"/api/v1/me/ai-integrations/{connection.Id}/revoke", null);
        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        await Assert.ThrowsAnyAsync<Exception>(() => mcp.CallToolAsync("get_my_context", cancellationToken: timeout.Token).AsTask());
    }

    private static JsonElement Data(CallToolResult result) => result.StructuredContent ?? JsonSerializer.Deserialize<JsonElement>(Text(result));
    private static string Text(CallToolResult result) => string.Join("\n", result.Content.OfType<TextContentBlock>().Select(x => x.Text));
    private static async Task Onboard(HttpClient http, Guid id, string role)
    {
        var response = await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = $"p{id:N}"[..30], displayName = "Protocol " + role, birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
