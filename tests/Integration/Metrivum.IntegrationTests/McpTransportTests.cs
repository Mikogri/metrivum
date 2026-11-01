using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;

namespace Metrivum.IntegrationTests;

public sealed class McpTransportTests
{
    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Enable(ApiFactory source) => source.WithWebHostBuilder(builder =>
    {
        builder.UseSetting("Mcp:Enabled", "true");
        builder.UseSetting("Mcp:PublicResourceUrl", "http://localhost/mcp");
        builder.UseSetting("Mcp:WebUrl", "http://localhost");
    });

    [Fact]
    public async Task Discovery_uses_configured_resource_and_issuer_and_anonymous_mcp_has_challenge()
    {
        using var source = new ApiFactory();
        using var factory = Enable(source);
        using var http = factory.CreateClient();
        foreach (var path in new[] { "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp" })
        {
            var response = await http.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("http://localhost/mcp", body.GetProperty("resource").GetString());
            Assert.Equal("https://test-project.supabase.co/auth/v1", body.GetProperty("authorization_servers")[0].GetString());
        }
        var denied = await http.PostAsJsonAsync("/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" });
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        Assert.Contains("resource_metadata", denied.Headers.WwwAuthenticate.ToString());
    }

    [Theory]
    [InlineData("/api/v1/me")]
    [InlineData("/api/v1/me/ai-integrations")]
    [InlineData("/api/v1/me/ai-actions/00000000-0000-0000-0000-000000000001/approve")]
    [InlineData("/api/v1/messaging/hub/negotiate")]
    public async Task OAuth_tokens_cannot_bypass_integration_consent_using_rest_or_human_approval(string path)
    {
        using var source = new ApiFactory();
        using var http = source.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", source.Token(Guid.NewGuid(), oauthClientId: Guid.NewGuid().ToString()));
        var response = await http.PostAsJsonAsync(path, new { approved = true });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("expired")]
    [InlineData("signature")]
    public async Task Invalid_tokens_are_rejected_before_mcp_operations(string fault)
    {
        using var source = new ApiFactory();
        using var factory = Enable(source);
        using var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", source.Token(Guid.NewGuid(), fault, oauthClientId: Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.PostAsJsonAsync("/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" })).StatusCode);
    }

    [Fact]
    public async Task Normal_user_token_does_not_become_an_mcp_connection()
    {
        using var source = new ApiFactory();
        using var factory = Enable(source);
        using var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", source.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Forbidden, (await http.PostAsJsonAsync("/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" })).StatusCode);
    }
}
