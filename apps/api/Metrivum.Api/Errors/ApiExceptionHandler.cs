using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Metrivum.BuildingBlocks;

namespace Metrivum.Api.Errors;

/// <summary>Converts API and infrastructure failures into consistent HTTP problem responses without exposing internal database errors.</summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problems, ILogger<ApiExceptionHandler> logger, IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken cancellationToken)
    {
        // SaveChanges wraps provider errors; ExecuteUpdate and raw SQL report them directly.
        var cause = exception is DbUpdateException { InnerException: PostgresException provider } ? provider : exception;
        var error = cause switch
        {
            ApiException api => api,
            DbUpdateConcurrencyException => new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload and retry."),
            PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } => ApiException.Conflict("A record with these unique values already exists."),
            PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } => ApiException.Invalid("A referenced resource is missing or still in use."),
            BadHttpRequestException { StatusCode: 413 } => new ApiException(413, "REQUEST_TOO_LARGE", "The request exceeds the allowed body size."),
            BadHttpRequestException { InnerException: JsonException { Path: { } path } } => ApiException.Invalid($"Invalid JSON value at {path}. Check the field format and API version."),
            BadHttpRequestException => ApiException.Invalid("The request body or parameters are invalid."),
            NpgsqlException or DbUpdateException => new ApiException(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable."),
            HttpRequestException => new ApiException(503, "INTEGRATION_UNAVAILABLE", "An external integration is temporarily unavailable."),
            _ => new ApiException(500, "INTERNAL_ERROR", "An unexpected error occurred.")
        };
        if (error.Status >= 500)
        {
            // Development keeps the whole exception so unexpected failures can be diagnosed; elsewhere only the type.
            if (environment.IsDevelopment())
                logger.LogError(exception, "Request failed: {Code}; {Method} {Path}; trace {TraceId}", error.Code, http.Request.Method, http.Request.Path, http.TraceIdentifier);
            else
                logger.LogError("Request failed: {Code}; exception type {ExceptionType}; trace {TraceId}", error.Code, exception.GetType().Name, http.TraceIdentifier);
        }
        http.Response.StatusCode = error.Status;
        if (error.RetryAfter is { } retryAfter)
            http.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
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
