using System.IO.Compression;
using System.Net;
using System.Security.Claims;
using Metrivum.Api.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;

namespace Metrivum.IntegrationTests;

public sealed class JsonCompressionTests
{
    private static readonly string Body = "{\"items\":[\"" + new string('a', 12000) + "\"]}";

    [Theory]
    [InlineData("gzip")]
    [InlineData("br")]
    public async Task Reviewed_authenticated_json_negotiates_compression_without_changing_content(
        string encoding
    )
    {
        await using var server = await Server(true);
        using var client = server.GetTestClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            "https://localhost/api/v1/training/analysis-set-options"
        );
        request.Headers.AcceptEncoding.ParseAdd(encoding);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(encoding, response.Content.Headers.ContentEncoding);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length < Body.Length / 4);
        using var input = new MemoryStream(bytes);
        using Stream decompressed =
            encoding == "gzip"
                ? new GZipStream(input, CompressionMode.Decompress)
                : new BrotliStream(input, CompressionMode.Decompress);
        using var reader = new StreamReader(decompressed);
        Assert.Equal(Body, await reader.ReadToEndAsync());
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Theory]
    [InlineData("GET", "/api/v1/training/analysis-set-options", false, "application/json", "gzip")]
    [InlineData("POST", "/api/v1/training/analysis-set-options", true, "application/json", "gzip")]
    [InlineData("GET", "/api/v1/me", true, "application/json", "gzip")]
    [InlineData("GET", "/api/v1/messaging/conversations", true, "application/json", "gzip")]
    [InlineData("GET", "/api/v1/training/analysis-set-options", true, "video/mp4", "gzip")]
    [InlineData(
        "GET",
        "/api/v1/training/analysis-set-options",
        true,
        "application/json",
        "identity"
    )]
    public async Task Unreviewed_or_unnegotiated_responses_remain_uncompressed(
        string method,
        string path,
        bool authenticated,
        string mime,
        string encoding
    )
    {
        await using var server = await Server(authenticated, mime);
        using var client = server.GetTestClient();
        using var request = new HttpRequestMessage(
            new HttpMethod(method),
            "https://localhost" + path
        );
        request.Headers.AcceptEncoding.ParseAdd(encoding);
        using var response = await client.SendAsync(request);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Equal(Body, await response.Content.ReadAsStringAsync());
    }

    private static async Task<WebApplication> Server(
        bool authenticated,
        string mime = "application/json"
    )
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddReviewedJsonCompression();
        var app = builder.Build();
        app.Use(
            async (context, next) =>
            {
                if (authenticated)
                    context.User = new ClaimsPrincipal(
                        new ClaimsIdentity([new Claim("sub", "test")], "test")
                    );
                await next();
            }
        );
        app.UseReviewedJsonCompression();
        app.Run(async context =>
        {
            context.Response.ContentType = mime;
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsync(Body);
        });
        await app.StartAsync();
        return app;
    }
}
