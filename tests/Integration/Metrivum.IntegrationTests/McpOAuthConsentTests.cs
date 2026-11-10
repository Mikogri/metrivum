using System.Net;
using System.Net.Http.Json;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Metrivum.IntegrationTests;

public sealed class McpOAuthConsentTests
{
    [Fact]
    public async Task Consent_identity_comes_from_fixed_provider_and_is_bound_to_exact_user()
    {
        var user = Guid.NewGuid();
        var handler = new ConsentHandler(user);
        var consent = Consent(user, handler);
        var details = await consent.DetailsAsync("authorization-123", default);
        Assert.Equal("client-verified", details.ClientId);
        Assert.Equal("Registered assistant", details.ClientName);
        Assert.Equal("https://assistant.example/callback", details.RedirectUri);
        Assert.Contains("prepare_messages", details.AvailableGrants);
        Assert.Equal(
            "https://assistant.example/callback?code=single-use&state=csrf",
            await consent.DecideAsync(
                details.AuthorizationId,
                "approve",
                details.RedirectUri,
                default
            )
        );
        Assert.Equal(
            "https://project.supabase.co/auth/v1/oauth/authorizations/authorization-123",
            handler.Requests[0].Uri
        );
        Assert.Equal(
            "https://project.supabase.co/auth/v1/oauth/authorizations/authorization-123/consent",
            handler.Requests[1].Uri
        );
        Assert.Equal("{\"action\":\"approve\"}", handler.Requests[1].Body);
        Assert.All(
            handler.Requests,
            request =>
            {
                Assert.Equal("Bearer current-user-token", request.Authorization);
                Assert.Equal("sb_publishable_fixture", request.ApiKey);
            }
        );
        handler.User = Guid.NewGuid();
        Assert.Equal(
            "OAUTH_CONSENT_UNAVAILABLE",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    consent.DetailsAsync("authorization-123", default)
                )
            ).Code
        );
    }

    [Fact]
    public async Task Unsafe_client_redirects_cross_origin_provider_redirects_and_arbitrary_paths_are_denied()
    {
        var user = Guid.NewGuid();
        var handler = new ConsentHandler(user) { RedirectUri = "http://evil.example/callback" };
        var consent = Consent(user, handler);
        Assert.Equal(
            "OAUTH_CLIENT_INVALID",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    consent.DetailsAsync("authorization-123", default)
                )
            ).Code
        );
        handler.RedirectUri = "https://assistant.example/callback";
        handler.RedirectResult = "https://evil.example/callback?code=stolen";
        Assert.Equal(
            "OAUTH_REDIRECT_INVALID",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    consent.DecideAsync(
                        "authorization-123",
                        "approve",
                        handler.RedirectUri,
                        default
                    )
                )
            ).Code
        );
        var before = handler.Requests.Count;
        await Assert.ThrowsAsync<ApiException>(() =>
            consent.DetailsAsync("../admin/users", default)
        );
        Assert.Equal(before, handler.Requests.Count);
    }

    [Fact]
    public async Task Provider_denial_and_revocation_use_documented_user_scoped_endpoints()
    {
        var user = Guid.NewGuid();
        var handler = new ConsentHandler(user)
        {
            RedirectResult = "https://assistant.example/callback?error=access_denied&state=csrf",
        };
        var consent = Consent(user, handler);
        await consent.DecideAsync("authorization-123", "deny", handler.RedirectUri, default);
        Assert.Equal("{\"action\":\"deny\"}", handler.Requests[0].Body);
        await consent.TryRevokeAsync("client-verified", default);
        Assert.Equal("DELETE", handler.Requests[1].Method);
        Assert.Equal(
            "https://project.supabase.co/auth/v1/user/oauth/grants?client_id=client-verified",
            handler.Requests[1].Uri
        );
    }

    private static SupabaseOAuthConsent Consent(Guid user, ConsentHandler handler)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Supabase:Auth:ProjectUrl"] = "https://project.supabase.co",
                    ["Supabase:Auth:PublishableKey"] = "sb_publishable_fixture",
                }
            )
            .Build();
        var http = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };
        http.HttpContext.Request.Headers.Authorization = "Bearer current-user-token";
        return new(
            new HttpClient(handler),
            configuration,
            http,
            new Account(user),
            NullLogger<SupabaseOAuthConsent>.Instance
        );
    }

    private sealed class ConsentHandler(Guid user) : HttpMessageHandler
    {
        public Guid User { get; set; } = user;
        public string RedirectUri { get; set; } = "https://assistant.example/callback";
        public string RedirectResult { get; set; } =
            "https://assistant.example/callback?code=single-use&state=csrf";
        public List<(
            string Method,
            string Uri,
            string? Authorization,
            string ApiKey,
            string? Body
        )> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct
        )
        {
            Requests.Add(
                (
                    request.Method.Method,
                    request.RequestUri!.AbsoluteUri,
                    request.Headers.Authorization?.ToString(),
                    request.Headers.GetValues("apikey").Single(),
                    request.Content == null ? null : await request.Content.ReadAsStringAsync(ct)
                )
            );
            object response =
                request.Method == HttpMethod.Get
                    ? new
                    {
                        authorization_id = "authorization-123",
                        client = new { id = "client-verified", name = "Registered assistant" },
                        user = new { id = User },
                        redirect_uri = RedirectUri,
                        scope = "openid profile email",
                    }
                    : new { redirect_url = RedirectResult };
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(response) };
        }
    }

    private sealed class Account(Guid user) : IAccountContext
    {
        public Guid UserId => user;

        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach]);

        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) =>
            Task.FromResult(new AccountIdentity(user, user));

        public Task RequireAdminAsync(string permission, CancellationToken ct) =>
            throw new NotSupportedException();
    }
}
