using System.Net;
using System.Net.Http.Json;

namespace TrainFlow.IntegrationTests;

public sealed class RequestPreconditionsHttpTests
{
    [Theory]
    [InlineData("/api/v1/training/executions/{id}/complete")]
    [InlineData("/api/v1/check-ins/requests/{id}/cancel")]
    [InlineData("/api/v1/calendar/events/{id}/cancel")]
    public async Task Shared_preconditions_reject_bad_headers_before_resource_access(string route)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(Guid.NewGuid()));
        var path = route.Replace("{id}", Guid.NewGuid().ToString());
        foreach (var header in new[] { null, "1", "W/\"1\"", "\"+1\"", "\" 1 \"", "\"0\"", "\"1\",\"2\"" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path);
            if (header != null)
                request.Headers.TryAddWithoutValidation("If-Match", header);
            using var response = await client.SendAsync(request);
            Assert.Equal(header == null ? (HttpStatusCode)428 : HttpStatusCode.BadRequest, response.StatusCode);
            var error = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal(header == null ? "VERSION_REQUIRED" : "VALIDATION_FAILED", error.GetProperty("code").GetString());
        }
    }
}
