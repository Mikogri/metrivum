using System.Net;
using Microsoft.AspNetCore.Hosting;
using Metrivum.Api.Security;

namespace Metrivum.IntegrationTests;

public sealed class OriginProtectionTests
{
    // Synthetic fixture only; not a deployment credential.
    private const string Token = "synthetic-origin-protection-test-value";

    [Theory]
    [InlineData(null, 403)]
    [InlineData("synthetic-origin-protection-wrong-value", 403)]
    [InlineData(Token, 401)]
    public async Task Origin_requires_exact_edge_credential_before_authentication(string? supplied, int expected)
    {
        using var source = new ApiFactory();
        using var factory = source.WithWebHostBuilder(builder => builder.UseSetting("Security:OriginToken", Token));
        using var client = factory.CreateClient();
        if (supplied is not null) client.DefaultRequestHeaders.Add(OriginProtection.Header, supplied);
        var response = await client.GetAsync("/api/v1/me");
        Assert.Equal((HttpStatusCode)expected, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.True(response.Headers.Contains("X-Content-Type-Options"));
    }

    [Fact]
    public async Task Liveness_remains_available_but_similar_paths_and_duplicate_headers_do_not_bypass_guard()
    {
        using var source = new ApiFactory();
        using var factory = source.WithWebHostBuilder(builder => builder.UseSetting("Security:OriginToken", Token));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/health/live/other")).StatusCode);
        client.DefaultRequestHeaders.Add(OriginProtection.Header, new[] { Token, Token });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/me")).StatusCode);
    }
}
