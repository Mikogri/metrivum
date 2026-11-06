using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Metrivum.Api.Security;

namespace Metrivum.IntegrationTests;

public sealed class JwtTests
{
    [Fact]
    public void Isolated_test_host_rejects_remote_database_before_accepting_test_identities()
    {
        using var factory = new ApiFactory("Host=unapproved.supabase.co;Database=postgres;Username=test");
        var error = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("loopback PostgreSQL", error.Message);
    }

    [Theory]
    [InlineData("signature")]
    [InlineData("audience")]
    [InlineData("issuer")]
    [InlineData("expired")]
    [InlineData("future")]
    [InlineData("anonymous")]
    [InlineData("role")]
    [InlineData("subject")]
    [InlineData("session")]
    [InlineData("none")]
    [InlineData("unknown_kid")]
    [InlineData("missing_sub")]
    [InlineData("missing_role")]
    [InlineData("missing_session_id")]
    [InlineData("missing_is_anonymous")]
    public async Task Invalid_sessions_are_rejected_before_database_access(string fault)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid(), fault));
        var result = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
    }

    [Fact]
    public async Task Deleted_or_revoked_sessions_are_rejected_before_profile_provisioning()
    {
        using var factory = new ApiFactory { SessionActive = false };
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
    }

    [Fact]
    public async Task First_level_session_of_an_account_with_a_second_factor_gets_a_distinct_refusal()
    {
        using var factory = new ApiFactory { RequireSecondFactor = true, SecondFactorMet = false };
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid(), aal: "aal1"));
        var result = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
        Assert.Contains("\"MFA_REQUIRED\"", await result.Content.ReadAsStringAsync());
        Assert.Equal(1, factory.SecondFactorChecks);
    }

    [Fact]
    public async Task Second_level_token_skips_the_factor_lookup()
    {
        using var factory = new ApiFactory { RequireSecondFactor = true, SecondFactorMet = false };
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid(), aal: "aal2"));
        var result = await client.GetAsync("/api/v1/me");
        Assert.DoesNotContain("MFA_REQUIRED", await result.Content.ReadAsStringAsync());
        Assert.Equal(0, factory.SecondFactorChecks);
    }

    [Fact]
    public async Task Second_factor_check_stays_off_until_configured()
    {
        using var factory = new ApiFactory { SecondFactorMet = false };
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid(), aal: "aal1"));
        var result = await client.GetAsync("/api/v1/me");
        Assert.DoesNotContain("MFA_REQUIRED", await result.Content.ReadAsStringAsync());
        Assert.Equal(0, factory.SecondFactorChecks);
    }

    [Fact]
    public async Task Revoked_session_is_refused_before_the_second_factor_lookup()
    {
        using var factory = new ApiFactory { SessionActive = false, RequireSecondFactor = true, SecondFactorMet = false };
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid(), aal: "aal1"));
        var result = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
        Assert.DoesNotContain("MFA_REQUIRED", await result.Content.ReadAsStringAsync());
        Assert.Equal(0, factory.SecondFactorChecks);
    }

    [Fact]
    public async Task Missing_token_is_unauthorized_and_liveness_is_public()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly RSA rsa = RSA.Create(2048);
    private readonly string? database;
    public ApiFactory(string? database = null) => this.database = database;
    public bool SessionActive { get; set; } = true;
    public bool RequireSecondFactor { get; set; }
    public bool SecondFactorMet { get; set; } = true;
    private int secondFactorChecks;
    public int SecondFactorChecks => Volatile.Read(ref secondFactorChecks);
    public RsaSecurityKey Key => new(rsa) { KeyId = "test-key" };
    public IConfigurationManager<OpenIdConnectConfiguration>? KeyManager
    {
        get; set;
    }
    public SecurityKey? SigningKey
    {
        get; set;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services => services.AddSingleton<IAuthSessionValidator>(new TestSessionValidator(this)));
        builder.ConfigureServices(services => services.AddSingleton<Metrivum.Billing.Infrastructure.IPlatformCurrencyConverter>(new TestCurrencyConverter()));
        foreach (var setting in new Dictionary<string, string?>
        {
            ["ConnectionStrings:Database"] = database ?? "Host=127.0.0.1;Port=1;Database=unused;Username=test;Timeout=1",
            ["AbuseProtection:DistributedEnabled"] = database is null ? "false" : "true",
            ["Supabase:Auth:ProjectUrl"] = "https://test-project.supabase.co",
            ["Supabase:Auth:RequireSecondFactorWhenEnrolled"] = RequireSecondFactor ? "true" : "false",
            ["AllowedHosts"] = "*"
        })
            builder.UseSetting(setting.Key, setting.Value);
        builder.ConfigureServices(services => services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            var config = new OpenIdConnectConfiguration { Issuer = "https://test-project.supabase.co/auth/v1" };
            config.SigningKeys.Add(Key);
            options.ConfigurationManager = KeyManager ?? new StaticConfigurationManager<OpenIdConnectConfiguration>(config);
        }));
    }

    private sealed class TestSessionValidator(ApiFactory factory) : IAuthSessionValidator
    {
        public Task<bool> IsActiveAsync(Guid userId, Guid sessionId, CancellationToken ct) => Task.FromResult(factory.SessionActive);
        public Task<bool> MeetsSecondFactorAsync(Guid userId, Guid sessionId, CancellationToken ct)
        {
            Interlocked.Increment(ref factory.secondFactorChecks);
            return Task.FromResult(factory.SecondFactorMet);
        }
    }

    private sealed class TestCurrencyConverter : Metrivum.Billing.Infrastructure.IPlatformCurrencyConverter
    {
        public Task<Metrivum.Billing.Infrastructure.PlatformCurrencyQuote> ConvertAsync(decimal amount, string from, string to, CancellationToken ct)
        {
            var rate = from == to ? 1m : to == "PLN" ? 4m : 0.9m;
            return Task.FromResult(new Metrivum.Billing.Infrastructure.PlatformCurrencyQuote(decimal.Round(amount * rate, 2), to,
                from == to ? "" : $"test-{from}-{to}", "Test fixture", "2026-10-08"));
        }
    }

    public string Token(Guid userId, string? fault = null, bool metadataAdmin = false, string? oauthClientId = null, string? aal = null)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new("sub", fault == "subject" ? "not-a-guid" : userId.ToString()),
            new("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("role", fault == "role" ? "service_role" : "authenticated"),
            new("is_anonymous", fault == "anonymous" ? "true" : "false", ClaimValueTypes.Boolean),
            new("session_id", fault == "session" ? "invalid" : Guid.NewGuid().ToString()),
            new("user_metadata", metadataAdmin ? "{\"Admin\":true,\"role\":\"AccessAdmin\",\"capabilities\":[\"all\"]}" : "{}", "JSON")
        };
        if (fault?.StartsWith("missing_", StringComparison.Ordinal) == true)
            claims.RemoveAll(claim => claim.Type == fault["missing_".Length..]);
        if (oauthClientId != null && fault != "missing_client") claims.Add(new("client_id", fault == "blank_client" ? " " : oauthClientId));
        if (fault == "duplicate_client") claims.Add(new("client_id", "another-client"));
        if (fault == "resource") claims.Add(new("resource", "https://unrelated-resource.invalid/mcp"));
        if (aal != null) claims.Add(new("aal", aal));
        using var other = RSA.Create(2048);
        var key = fault == "signature" ? new RsaSecurityKey(other) { KeyId = "test-key" } : SigningKey ?? Key;
        if (fault == "unknown_kid")
            key.KeyId = "missing-key";
        var token = new JwtSecurityToken(fault == "issuer" ? "https://foreign-project.supabase.co/auth/v1" : "https://test-project.supabase.co/auth/v1",
            fault == "audience" ? "wrong" : "authenticated", claims,
            fault == "future" ? now.AddHours(1) : now.AddHours(-1),
            fault == "expired" ? now.AddMinutes(-2) : now.AddHours(2),
            fault == "none" ? null : new SigningCredentials(key, SecurityAlgorithms.RsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public sealed class JwksRotationTests
{
    [Fact]
    public async Task Unknown_key_refreshes_cached_jwks_and_rotated_key_becomes_valid()
    {
        using var factory = new ApiFactory();
        using var rotated = RSA.Create(2048);
        var newKey = new RsaSecurityKey(rotated) { KeyId = "rotated-key" };
        var documents = new PublicKeysDocument(factory.Key);
        var manager = new ConfigurationManager<OpenIdConnectConfiguration>("https://test-project.supabase.co/auth/v1/.well-known/jwks.json",
            new SupabaseJwksRetriever("https://test-project.supabase.co/auth/v1"), documents)
        {
            RefreshInterval = TimeSpan.FromSeconds(1),
            AutomaticRefreshInterval = TimeSpan.FromMinutes(5),
            UseLastKnownGoodConfiguration = false
        };
        factory.KeyManager = manager;
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/openapi/v1.json")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/openapi/v1.json")).StatusCode);
        Assert.Equal(1, documents.Requests);
        documents.Key = newKey;
        factory.SigningKey = newKey;
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        var status = (await client.GetAsync("/openapi/v1.json")).StatusCode;
        for (var i = 0; status != HttpStatusCode.OK && i < 40; i++)
        {
            await Task.Delay(100);
            status = (await client.GetAsync("/openapi/v1.json")).StatusCode;
        }
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.InRange(documents.Requests, 2, 3);
        factory.SigningKey = factory.Key;
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/openapi/v1.json")).StatusCode);
    }

    private sealed class PublicKeysDocument(RsaSecurityKey key) : IDocumentRetriever
    {
        public RsaSecurityKey Key { get; set; } = key;
        public int Requests
        {
            get; private set;
        }
        public Task<string> GetDocumentAsync(string address, CancellationToken cancellationToken)
        {
            Assert.Equal("https://test-project.supabase.co/auth/v1/.well-known/jwks.json", address);
            Requests++;
            var parameters = Key.Rsa.ExportParameters(false);
            return Task.FromResult(System.Text.Json.JsonSerializer.Serialize(new
            {
                keys = new[] { new { kty = "RSA", alg = "RS256", use = "sig", kid = Key.KeyId,
                    n = Base64UrlEncoder.Encode(parameters.Modulus!), e = Base64UrlEncoder.Encode(parameters.Exponent!) } }
            }));
        }
    }
}
