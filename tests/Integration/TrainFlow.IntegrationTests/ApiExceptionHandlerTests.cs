using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using TrainFlow.Api.Errors;

namespace TrainFlow.IntegrationTests;

public sealed class ApiExceptionHandlerTests
{
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
        var handler = new ApiExceptionHandler(services.GetRequiredService<IProblemDetailsService>(), NullLogger<ApiExceptionHandler>.Instance);
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
