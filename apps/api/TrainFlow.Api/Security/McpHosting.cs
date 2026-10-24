using System.Diagnostics;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using System.Text.Json.Serialization;
using TrainFlow.BuildingBlocks;
using TrainFlow.Integrations.Features;

namespace TrainFlow.Api.Security;

public sealed class McpHostingOptions
{
    public bool Enabled { get; set; }
    public string PublicResourceUrl { get; set; } = "";
    public string WebUrl { get; set; } = "";
    public int RequestsPerMinute { get; set; } = 60;
    public int ToolTimeoutSeconds { get; set; } = 30;
    public int MaximumRequestBytes { get; set; } = 262144;
    public int MaximumResponseBytes { get; set; } = 1048576;
}

public static class McpHosting
{
    public static IServiceCollection AddTrainFlowMcp(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var settings = configuration.GetSection("Mcp").Get<McpHostingOptions>() ?? new();
        services.AddSingleton(settings);
        if (!settings.Enabled) return services;
        if (!ValidPublicUri(settings.PublicResourceUrl, environment) || !ValidPublicUri(settings.WebUrl, environment)
            || new Uri(settings.PublicResourceUrl).AbsolutePath != "/mcp"
            || settings.RequestsPerMinute is < 1 or > 600 || settings.ToolTimeoutSeconds is < 1 or > 120
            || settings.MaximumRequestBytes is < 4096 or > 1048576 || settings.MaximumResponseBytes is < 4096 or > 4194304)
            throw new InvalidOperationException("Mcp requires exact public HTTPS resource/web URLs and bounded limits (HTTP loopback only in Development/Testing).");
        services.AddRateLimiter(options => options.AddPolicy("mcp", http => RateLimitPartition.GetFixedWindowLimiter(
            $"{http.User.FindFirst("sub")?.Value}:{http.User.FindFirst("client_id")?.Value}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = settings.RequestsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
        services.AddMcpServer()
            .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.Stateless)
            .WithToolsFromAssembly(typeof(IntegrationService).Assembly, new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
                TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver(),
                RespectNullableAnnotations = true,
                MaxDepth = 48
            })
            .WithRequestFilters(filters => filters.AddCallToolFilter(next => async (context, ct) =>
            {
                var started = Stopwatch.GetTimestamp();
                var logger = context.Services!.GetRequiredService<ILogger<McpHostingOptions>>();
                var http = context.Services!.GetRequiredService<IHttpContextAccessor>().HttpContext!;
                var outcome = "allowed";
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeout.CancelAfter(TimeSpan.FromSeconds(settings.ToolTimeoutSeconds));
                try
                {
                    if (context.MatchedPrimitive is McpServerTool tool && context.Params?.Arguments is { } arguments
                        && tool.ProtocolTool.InputSchema.TryGetProperty("properties", out var properties)
                        && arguments.Keys.Any(key => !properties.TryGetProperty(key, out _)))
                        throw ApiException.Invalid("Tool arguments contain unsupported fields.");
                    var guard = context.Services!.GetRequiredService<IAbuseProtection>();
                    var user = Guid.Parse(http.User.FindFirst("sub")!.Value);
                    var read = context.MatchedPrimitive is McpServerTool classified && classified.ProtocolTool.Annotations?.ReadOnlyHint == true;
                    guard.Require(user, read ? AbusePolicies.McpRead : AbusePolicies.McpWrite, http.User.FindFirst("client_id")?.Value);
                    var result = await next(context, timeout.Token);
                    if (JsonSerializer.SerializeToUtf8Bytes(result).Length > settings.MaximumResponseBytes)
                        return Failure("response_too_large", "Narrow the query or page size. The operation may have completed; retry writes only with the same idempotency key.");
                    return result;
                }
                catch (JsonException)
                {
                    outcome = "denied";
                    return Failure("validation_failed", "Tool arguments do not match the declared schema.");
                }
                catch (ApiException error)
                {
                    outcome = "denied";
                    var code = error.Code switch
                    {
                        "APPROVAL_REQUIRED" => "approval_required",
                        "STALE_REVISION" => "stale_revision",
                        _ => error.Status switch { 404 => "not_found", 403 => "forbidden", 412 => "stale_revision", 409 => "conflict", 400 => "validation_failed", 429 => "rate_limited", _ => "not_available" }
                    };
                    return Failure(code, error.Status == 404 ? "Resource unavailable." : error.Message);
                }
                catch (OperationCanceledException) when (timeout.IsCancellationRequested)
                {
                    outcome = "timeout";
                    return Failure("not_available", "Operation interrupted. Retry writes with the same idempotency key.");
                }
                catch (Exception)
                {
                    outcome = "failed";
                    return Failure("not_available", "The operation is temporarily unavailable.");
                }
                finally
                {
                    logger.LogInformation("MCP {Tool} user {User} client {Client} outcome {Outcome} duration {Milliseconds} trace {Trace}",
                        context.Params?.Name, http.User.FindFirst("sub")?.Value, http.User.FindFirst("client_id")?.Value,
                        outcome, Stopwatch.GetElapsedTime(started).TotalMilliseconds, http.TraceIdentifier);
                }
            }));
        return services;
    }

    private static CallToolResult Failure(string code, string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { code, message }) }],
        StructuredContent = JsonSerializer.SerializeToElement(new { code, message })
    };

    internal static bool ValidPublicUri(string value, IHostEnvironment environment) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)
        && (uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback && (environment.IsDevelopment() || environment.IsEnvironment("Testing")));

    public static IApplicationBuilder UseIntegrationTokenIsolation(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        // OAuth clients must use consent-checked MCP; normal REST and approval screens are human-session-only.
        if (http.User.FindFirst("client_id") != null && http.Request.Path != "/mcp")
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        if (http.Request.Path == "/mcp")
        {
            var settings = http.RequestServices.GetRequiredService<McpHostingOptions>();
            if (!settings.Enabled) { http.Response.StatusCode = 404; return; }
            var resource = http.User.FindFirst("resource")?.Value;
            if (resource != null && resource != settings.PublicResourceUrl) { http.Response.StatusCode = 401; return; }
            if (http.Request.ContentLength > settings.MaximumRequestBytes) { http.Response.StatusCode = 413; return; }
            var size = http.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
            if (size is { IsReadOnly: false }) size.MaxRequestBodySize = settings.MaximumRequestBytes;
            if (http.User.Identity?.IsAuthenticated != true)
                http.Response.Headers.WWWAuthenticate = $"Bearer resource_metadata=\"{MetadataUrl(settings.PublicResourceUrl)}\"";
            else if (http.User.FindAll("client_id").Count() != 1 || string.IsNullOrWhiteSpace(http.User.FindFirst("client_id")?.Value))
            {
                http.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            else
                await http.RequestServices.GetRequiredService<IntegrationAccess>().RequireAsync("connect", http.RequestAborted);
        }
        await next(http);
    });

    private static string MetadataUrl(string resource) => new Uri(new Uri(resource), "/.well-known/oauth-protected-resource/mcp").AbsoluteUri;

    public static IEndpointRouteBuilder MapTrainFlowMcp(this IEndpointRouteBuilder endpoints)
    {
        var settings = endpoints.ServiceProvider.GetRequiredService<McpHostingOptions>();
        if (!settings.Enabled) return endpoints;
        var auth = endpoints.ServiceProvider.GetRequiredService<SupabaseAuthOptions>();
        var metadata = new { resource = settings.PublicResourceUrl, authorization_servers = new[] { auth.Issuer }, scopes_supported = new[] { "openid", "profile", "email" }, bearer_methods_supported = new[] { "header" }, resource_name = "Metrivum", resource_documentation = settings.WebUrl.TrimEnd('/') + "/app/settings?section=integrations" };
        endpoints.MapGet("/.well-known/oauth-protected-resource/mcp", () => Results.Json(metadata)).AllowAnonymous();
        endpoints.MapGet("/.well-known/oauth-protected-resource", () => Results.Json(metadata)).AllowAnonymous();
        endpoints.MapMcp("/mcp").RequireAuthorization().RequireRateLimiting("mcp");
        return endpoints;
    }
}
