using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed class SupabaseAuthTests
{
    [SupabaseAuthFact]
    public async Task Local_password_session_is_validated_using_real_supabase_jwks()
    {
        var projectUrl = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_URL")!.TrimEnd('/');
        var serviceKey = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_SERVICE_KEY")!;
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var project = new Uri(projectUrl, UriKind.Absolute);
        Assert.True(project.IsLoopback && project.Scheme is "http" or "https" && project.UserInfo.Length == 0 &&
            project.AbsolutePath == "/" && project.Query.Length == 0 && project.Fragment.Length == 0,
            "Use a loopback Supabase project origin (without /auth/v1) whose configured JWT issuer matches that origin.");
        var databaseHost = new NpgsqlConnectionStringBuilder(database).Host;
        Assert.True(databaseHost == "localhost" || (IPAddress.TryParse(databaseHost, out var address) && IPAddress.IsLoopback(address)),
            "This test requires a disposable, migrated loopback Metrivum database.");

        // Public discovery uses the same endpoint as production JWT validation, without an admin key.
        using var discovery = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(15) };
        using var jwksResponse = await discovery.GetAsync(projectUrl + "/auth/v1/.well-known/jwks.json");
        Assert.True(jwksResponse.IsSuccessStatusCode, $"Local public JWKS discovery returned HTTP {(int)jwksResponse.StatusCode}.");
        var jwks = await jwksResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(jwks.TryGetProperty("keys", out var keys) && keys.ValueKind == JsonValueKind.Array && keys.EnumerateArray().Any(key =>
                key.TryGetProperty("kty", out var kind) && kind.GetString() is "RSA" or "EC"),
            "Local Supabase must expose asymmetric JWKS keys and issue RS256 or ES256 sessions. Configure asymmetric signing; HS256 fallback is intentionally unsupported.");

        using var admin = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            BaseAddress = new Uri(projectUrl + "/auth/v1/"),
            Timeout = TimeSpan.FromSeconds(15)
        };
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", serviceKey);
        admin.DefaultRequestHeaders.Add("apikey", serviceKey);
        var userId = Guid.NewGuid();
        var email = $"trainflow-{userId:N}@example.com";
        var password = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)) + "a!1";
        // Supplying the test UUID allows cleanup even when creation succeeds but response parsing fails.
        try
        {
            using var created = await admin.PostAsJsonAsync("admin/users", new
            {
                id = userId,
                email,
                password,
                email_confirm = true
            });
            Assert.True(created.IsSuccessStatusCode, $"Local Auth admin creation returned HTTP {(int)created.StatusCode}.");
            var authUser = await created.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(userId, authUser.GetProperty("id").GetGuid());

            using var login = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = admin.BaseAddress,
                Timeout = TimeSpan.FromSeconds(15)
            };
            login.DefaultRequestHeaders.Add("apikey", serviceKey);
            using var signedIn = await login.PostAsJsonAsync("token?grant_type=password", new
            {
                email,
                password
            });
            Assert.True(signedIn.IsSuccessStatusCode, $"Local password sign-in returned HTTP {(int)signedIn.StatusCode}.");
            var session = await signedIn.Content.ReadFromJsonAsync<JsonElement>();
            var token = session.GetProperty("access_token").GetString();
            Assert.False(string.IsNullOrWhiteSpace(token), "Local Auth returned no access token.");
            Assert.Equal(userId, session.GetProperty("user").GetProperty("id").GetGuid());

            using var factory = new LocalSupabaseApiFactory(projectUrl, database);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.GetAsync("/api/v1/me");
            Assert.True(response.StatusCode == HttpStatusCode.OK,
                $"Metrivum rejected the real local Supabase session with HTTP {(int)response.StatusCode}. Check the configured issuer and asymmetric signing key; JWT validation is not bypassed.");
            var profile = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(userId, profile.GetProperty("id").GetGuid());
            Assert.False(profile.GetProperty("onboarded").GetBoolean());
        }
        finally
        {
            // Auth owns its system tables. Never clean up by writing directly to auth.users.
            using var removed = await admin.DeleteAsync($"admin/users/{userId}");
            Assert.True(removed.IsSuccessStatusCode || removed.StatusCode == HttpStatusCode.NotFound,
                $"Local Auth test-user cleanup returned HTTP {(int)removed.StatusCode}.");
        }
    }

    private sealed class LocalSupabaseApiFactory(string projectUrl, string database) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:Database", database);
            builder.UseSetting("Supabase:Auth:ProjectUrl", projectUrl);
            builder.UseSetting("Supabase:Auth:Audience", "authenticated");
            builder.UseSetting("AllowedHosts", "*");
            // Keep the application's actual JWKS retriever, issuer, algorithms and signature checks.
        }
    }
}

public sealed class SupabaseAuthFactAttribute : FactAttribute
{
    public SupabaseAuthFactAttribute()
    {
        if (new[] { "TRAINFLOW_TEST_SUPABASE_URL", "TRAINFLOW_TEST_SUPABASE_SERVICE_KEY", "TRAINFLOW_TEST_DATABASE" }
            .Any(name => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name))))
            Skip = "Set TRAINFLOW_TEST_SUPABASE_URL, TRAINFLOW_TEST_SUPABASE_SERVICE_KEY and TRAINFLOW_TEST_DATABASE for local Supabase with asymmetric signing and a migrated disposable database.";
    }
}
