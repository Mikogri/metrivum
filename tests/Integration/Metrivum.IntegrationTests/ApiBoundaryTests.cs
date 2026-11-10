using System.Net;
using System.Text;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.IntegrationTests;

public sealed class ApiBoundaryTests
{
    [Fact]
    public async Task Every_registered_business_route_rejects_anonymous_requests()
    {
        using var discovery = new ApiFactory();
        using var discoveryClient = discovery.CreateClient();
        var routes = discovery
            .Services.GetRequiredService<EndpointDataSource>()
            .Endpoints.OfType<RouteEndpoint>()
            .Where(x =>
                x.RoutePattern.RawText!.StartsWith("/api/", StringComparison.Ordinal)
                || x.RoutePattern.RawText.StartsWith("/openapi/", StringComparison.Ordinal)
            )
            .Where(x => x.RoutePattern.RawText != "/api/v1/subscriptions/catalog") // Deliberate public price list; no account data.
            .SelectMany(endpoint =>
                (
                    endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"]
                ).Select(method =>
                {
                    var segments = endpoint.RoutePattern.PathSegments.Select(segment =>
                        string.Concat(
                            segment.Parts.Select(part =>
                                part switch
                                {
                                    Microsoft.AspNetCore.Routing.Patterns.RoutePatternLiteralPart literal =>
                                        literal.Content,
                                    Microsoft.AspNetCore.Routing.Patterns.RoutePatternSeparatorPart separator =>
                                        separator.Content,
                                    Microsoft.AspNetCore.Routing.Patterns.RoutePatternParameterPart parameter =>
                                        parameter.ParameterPolicies.Any(p =>
                                            p.Content is "int" or "long"
                                        )
                                            ? "1"
                                        : parameter.Name == "documentName" ? "v1"
                                        : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                                    _ => throw new InvalidOperationException(
                                        "Unhandled route segment."
                                    ),
                                }
                            )
                        )
                    );
                    return (Method: method, Path: "/" + string.Join('/', segments));
                })
            )
            .Distinct()
            .ToArray();
        Assert.NotEmpty(routes);
        // Separate limiter instances keep this authentication audit independent of rate-limit rejection.
        foreach (var batch in routes.Chunk(80))
        {
            using var factory = new ApiFactory();
            using var client = factory.CreateClient();
            foreach (var route in batch)
            {
                using var request = new HttpRequestMessage(
                    new HttpMethod(route.Method),
                    route.Path
                );
                using var response = await client.SendAsync(request);
                Assert.True(
                    response.StatusCode == HttpStatusCode.Unauthorized,
                    $"{route.Method} {route.Path} returned {(int)response.StatusCode} instead of 401."
                );
            }
        }
    }

    [Theory]
    [InlineData(
        "/api/v1/messaging/uploads",
        "{\"name\":\"voice\",\"contentType\":null,\"size\":24}"
    )]
    [InlineData(
        "/api/v1/media/uploads",
        "{\"name\":null,\"contentType\":\"video/mp4\",\"size\":24}"
    )]
    [InlineData("/api/v1/media/uploads", "{\"name\":\"video\",\"contentType\":null,\"size\":24}")]
    public async Task Explicit_null_required_fields_are_rejected_before_services_or_database(
        string path,
        string body
    )
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        using var response = await client.PostAsync(
            path,
            new StringContent(body, Encoding.UTF8, "application/json")
        );
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain("Exception", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("GET", "/api/v1/me")]
    [InlineData("GET", "/api/v1/messaging/conversations")]
    [InlineData("GET", "/api/v1/notifications")]
    [InlineData("POST", "/api/v1/media/uploads")]
    [InlineData("POST", "/api/v1/messaging/uploads")]
    [InlineData("GET", "/api/v1/coaching/relationships")]
    [InlineData("GET", "/api/v1/training/programs")]
    [InlineData("GET", "/openapi/v1.json")]
    public async Task Rest_routes_never_accept_query_string_tokens(string method, string path)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(
            new HttpMethod(method),
            path + "?access_token=" + factory.Token(Guid.NewGuid())
        );
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
