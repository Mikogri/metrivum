using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Api.Errors;

public sealed class ApiExceptionHandler(IProblemDetailsService problems, ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken cancellationToken)
    {
        var error = exception switch
        {
            ApiException api => api,
            DbUpdateConcurrencyException => new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload and retry."),
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => ApiException.Conflict("A record with these unique values already exists."),
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } } => ApiException.Invalid("A referenced resource is missing or still in use."),
            BadHttpRequestException => ApiException.Invalid("The request body or parameters are invalid."),
            NpgsqlException or DbUpdateException => new ApiException(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable."),
            HttpRequestException => new ApiException(503, "INTEGRATION_UNAVAILABLE", "An external integration is temporarily unavailable."),
            _ => new ApiException(500, "INTERNAL_ERROR", "An unexpected error occurred.")
        };
        if (error.Status >= 500)
            logger.LogError("Request failed: {Code}; exception type {ExceptionType}; trace {TraceId}", error.Code, exception.GetType().Name, http.TraceIdentifier);
        http.Response.StatusCode = error.Status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = new ProblemDetails
            {
                Status = error.Status,
                Title = error.Code,
                Detail = error.Message,
                Extensions = { ["code"] = error.Code, ["traceId"] = Activity.Current?.Id ?? http.TraceIdentifier, ["errors"] = error.Errors }
            }
        });
    }
}
