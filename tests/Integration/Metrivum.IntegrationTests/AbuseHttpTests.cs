using System.Net;
using Metrivum.Api.Security;
using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class AbuseHttpTests
{
    [Fact]
    public async Task Same_IP_different_verified_users_are_isolated_and_429_uses_problem_details()
    {
        using var source = new ApiFactory();
        using var factory = source.WithWebHostBuilder(b =>
            b.UseSetting("AbuseProtection:Policies:read:Permits", "2")
        );
        using var first = factory.CreateClient();
        using var second = factory.CreateClient();
        first.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(Guid.NewGuid()));
        second.DefaultRequestHeaders.Authorization = new("Bearer", source.Token(Guid.NewGuid()));
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await first.GetAsync("/synthetic-missing")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await first.GetAsync("/synthetic-missing")).StatusCode
        );
        var response = await first.GetAsync("/synthetic-missing");
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.NotNull(response.Headers.RetryAfter);
        Assert.Contains("RATE_LIMIT_EXCEEDED", await response.Content.ReadAsStringAsync());
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await second.GetAsync("/synthetic-missing")).StatusCode
        );
    }

    [Fact]
    public async Task Spoofed_forwarded_IP_does_not_reset_anonymous_budget_and_health_is_exempt()
    {
        using var source = new ApiFactory();
        using var factory = source.WithWebHostBuilder(b =>
            b.UseSetting("AbuseProtection:Policies:read:Permits", "2")
        );
        using var client = factory.CreateClient();
        for (var i = 0; i < 3; i++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/synthetic-missing");
            request.Headers.Add("X-Forwarded-For", $"198.51.100.{i + 1}");
            Assert.Equal(
                i < 2 ? HttpStatusCode.Unauthorized : HttpStatusCode.TooManyRequests,
                (await client.SendAsync(request)).StatusCode
            );
        }
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }

    [Fact]
    public void Every_active_business_route_inherits_a_known_policy_and_autosave_is_separate()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var routes = factory
            .Services.GetRequiredService<EndpointDataSource>()
            .Endpoints.OfType<RouteEndpoint>()
            .Where(x =>
                x.RoutePattern.RawText?.StartsWith("/api/", StringComparison.Ordinal) == true
            )
            .ToArray();
        Assert.NotEmpty(routes);
        foreach (var route in routes)
        foreach (
            var method in route.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"]
        )
            Assert.Contains(
                AbuseHttpProtection.Category(method, route.RoutePattern.RawText!),
                new[]
                {
                    AbusePolicies.Read,
                    AbusePolicies.Write,
                    AbusePolicies.Search,
                    AbusePolicies.Autosave,
                }
            );
        Assert.Equal(
            AbusePolicies.Autosave,
            AbuseHttpProtection.Category("PUT", "/api/v1/training/programs/123/draft")
        );
    }
}
