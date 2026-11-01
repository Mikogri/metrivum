using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Metrivum.Api.Errors;

namespace Metrivum.IntegrationTests;

public sealed class ApiExceptionHandlerTests
{
    [Fact]
    public async Task Invalid_json_identifies_the_field_without_disclosing_values()
    {
        await using var services = new ServiceCollection().AddLogging().AddProblemDetails().BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        http.Response.Body = new MemoryStream();
        var handler = new ApiExceptionHandler(services.GetRequiredService<IProblemDetailsService>(), NullLogger<ApiExceptionHandler>.Instance, new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Testing" });
        var error = new BadHttpRequestException("private body", new JsonException("private value", "$.document.maxesTables[0].rows[0].loadUnit", null, null));
        await handler.TryHandleAsync(http, error, default);
        http.Response.Body.Position = 0;
        var json = await JsonDocument.ParseAsync(http.Response.Body);
        Assert.Equal(400, http.Response.StatusCode);
        Assert.Contains("$.document.maxesTables[0].rows[0].loadUnit", json.RootElement.GetProperty("detail").GetString());
        Assert.DoesNotContain("private", json.RootElement.GetRawText());
    }

    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, false, 409, "CONFLICT")]
    [InlineData(PostgresErrorCodes.UniqueViolation, true, 409, "CONFLICT")]
    [InlineData(PostgresErrorCodes.ForeignKeyViolation, false, 400, "VALIDATION_FAILED")]
    [InlineData(PostgresErrorCodes.ForeignKeyViolation, true, 400, "VALIDATION_FAILED")]
    [InlineData(PostgresErrorCodes.InsufficientPrivilege, false, 503, "DATABASE_UNAVAILABLE")]
    [InlineData(PostgresErrorCodes.InsufficientPrivilege, true, 503, "DATABASE_UNAVAILABLE")]
    public async Task Database_error_contract_does_not_depend_on_EF_wrapping(string sqlState, bool wrapped, int status, string code)
    {
        await using var services = new ServiceCollection().AddLogging().AddProblemDetails().BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        http.Response.Body = new MemoryStream();
        var handler = new ApiExceptionHandler(services.GetRequiredService<IProblemDetailsService>(), NullLogger<ApiExceptionHandler>.Instance, new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Testing" });
        Exception error = new PostgresException("private database detail", "ERROR", "ERROR", sqlState);
        if (wrapped) error = new DbUpdateException("private EF detail", error);

        Assert.True(await handler.TryHandleAsync(http, error, default));
        Assert.Equal(status, http.Response.StatusCode);
        http.Response.Body.Position = 0;
        var json = await JsonDocument.ParseAsync(http.Response.Body);
        Assert.Equal(code, json.RootElement.GetProperty("code").GetString());
        Assert.DoesNotContain("private", json.RootElement.GetRawText());
    }
}
