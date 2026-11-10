using System.Net;
using Metrivum.Api.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class AuthAdmissionTests
{
    [Fact]
    public async Task Anonymous_readiness_cannot_bypass_database_probe_budget()
    {
        using var source = new ApiFactory();
        using var factory = source.WithWebHostBuilder(builder =>
            builder.UseSetting("Security:ReadinessRequestsPerMinute", "1")
        );
        using var client = factory.CreateClient();
        Assert.Equal(
            HttpStatusCode.ServiceUnavailable,
            (await client.GetAsync("/health/ready")).StatusCode
        );
        var refused = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.NotNull(refused.Headers.RetryAfter);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }

    [Fact]
    public async Task Repeated_signed_tokens_cannot_keep_querying_sessions_after_the_user_budget_is_spent()
    {
        using var source = new ApiFactory();
        var sessions = new DeniedSessions();
        using var factory = source.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("AbuseProtection:Policies:global:Permits", "2");
            builder.ConfigureServices(services =>
                services.AddSingleton<IAuthSessionValidator>(sessions)
            );
        });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
        var refused = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.NotNull(refused.Headers.RetryAfter);
        Assert.Equal(2, sessions.Reads);
    }

    private sealed class DeniedSessions : IAuthSessionValidator
    {
        private int reads;
        public int Reads => Volatile.Read(ref reads);

        public Task<bool> IsActiveAsync(Guid userId, Guid sessionId, CancellationToken ct)
        {
            Interlocked.Increment(ref reads);
            return Task.FromResult(false);
        }

        public Task<bool> MeetsSecondFactorAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken ct
        ) => throw new InvalidOperationException();
    }
}
