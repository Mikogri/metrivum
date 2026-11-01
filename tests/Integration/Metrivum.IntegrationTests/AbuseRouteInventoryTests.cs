using System.Text;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.Api.Security;
using Metrivum.BuildingBlocks;
using Xunit.Abstractions;

namespace Metrivum.IntegrationTests;

public sealed class AbuseRouteInventoryTests(ITestOutputHelper output)
{
    [Fact]
    public void Export_actual_REST_endpoint_policy_inventory()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var rows = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.RoutePattern.RawText?.StartsWith("/api/", StringComparison.Ordinal) == true)
            .SelectMany(endpoint => (endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"])
                .Select(method => (Method: method, Path: endpoint.RoutePattern.RawText!)))
            .Distinct().OrderBy(x => x.Path, StringComparer.Ordinal).ThenBy(x => x.Method, StringComparer.Ordinal).ToArray();
        Assert.NotEmpty(rows);
        var csv = new StringBuilder("method,path,http_policy,key,logical_budget\n");
        foreach (var row in rows)
        {
            var category = AbuseHttpProtection.Category(row.Method, row.Path);
            Assert.Contains(category, new[] { AbusePolicies.Read, AbusePolicies.Write, AbusePolicies.Search, AbusePolicies.Autosave });
            csv.Append(row.Method).Append(',').Append(row.Path).Append(',')
                .Append("global+").Append(category is AbusePolicies.Autosave or AbusePolicies.Search ? category + "-in-owning-service" : category)
                .Append(",verified-user-id-or-trusted-remote-ip,")
                .Append(category == AbusePolicies.Autosave ? "autosave120/min shared with MCP" : "owning-service policy when applicable; see stage-01.md")
                .Append('\n');
        }
        output.WriteLine($"Inventoried {rows.Length} active REST operations from EndpointDataSource.");
        if (Environment.GetEnvironmentVariable("TRAINFLOW_ABUSE_ROUTE_INVENTORY") is { } path) File.WriteAllText(path, csv.ToString());
    }
}
