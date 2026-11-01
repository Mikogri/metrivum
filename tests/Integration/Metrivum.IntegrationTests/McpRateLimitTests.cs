using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;

namespace Metrivum.IntegrationTests;

public sealed class McpRateLimitTests
{
    [Theory]
    [InlineData(2, 2)]
    [InlineData(600, 600)]
    public async Task Denied_integration_requests_are_limited_before_account_and_consent_checks(int mcpLimit, int effectiveLimit)
    {
        using var source = new ApiFactory();
        var account = new DeniedAccount();
        using var factory = source.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Mcp:Enabled", "true");
            builder.UseSetting("Mcp:PublicResourceUrl", "http://localhost/mcp");
            builder.UseSetting("Mcp:WebUrl", "http://localhost");
            builder.UseSetting("Mcp:RequestsPerMinute", mcpLimit.ToString());
            builder.UseSetting("Cors:Origins:0", "https://trainflow.test");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IAccountContext>();
                services.AddSingleton<IAccountContext>(account);
            });
        });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(account.UserId, oauthClientId: "rate-limit-fixture"));

        for (var i = 0; i < effectiveLimit; i++)
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/mcp", null)).StatusCode);

        Assert.Equal(effectiveLimit, account.Checks);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/mcp", null)).StatusCode);
        Assert.Equal(effectiveLimit, account.Checks);

        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/mcp");
        preflight.Headers.Add("Origin", "https://trainflow.test");
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "Authorization");
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(preflight)).StatusCode);
        Assert.Equal(effectiveLimit, account.Checks);
    }

    private sealed class DeniedAccount : IAccountContext
    {
        public Guid UserId { get; } = Guid.NewGuid();
        public int Checks { get; private set; }
        public Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken)
        {
            Checks++;
            throw new ApiException(403, "ACCOUNT_DISABLED", "This account is disabled.");
        }
        public Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task RequireAdminAsync(string permission, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
