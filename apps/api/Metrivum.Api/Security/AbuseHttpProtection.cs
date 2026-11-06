using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using Metrivum.Accounts.Features;
using Metrivum.BuildingBlocks;

namespace Metrivum.Api.Security;

public static class AbuseHttpProtection
{
    // Explicit special cases; all new business routes inherit Read/Write and Global.
    public static string Category(string method, string route)
    {
        route = route.TrimEnd('/');
        if (method == "PUT" && route.StartsWith("/api/v1/training/programs/", StringComparison.Ordinal)
            && route.EndsWith("/draft", StringComparison.Ordinal)) return AbusePolicies.Autosave;
        if (method == "GET" && (route == "/api/v1/accounts/people" || route == "/api/v1/messaging/people"
            || route == "/api/v1/exercises" || route == "/api/v1/discovery/coaches" || route.StartsWith("/api/v1/accounts/people/", StringComparison.Ordinal))) return AbusePolicies.Search;
        return method is "GET" or "HEAD" or "OPTIONS" ? AbusePolicies.Read : AbusePolicies.Write;
    }

    public static bool IsExempt(PathString path) => path.StartsWithSegments("/health") || path.StartsWithSegments("/.well-known");

    public static IServiceCollection AddAbuseHttpProtection(this IServiceCollection services, IConfiguration configuration)
    {
        var readinessLimit = configuration.GetValue("Security:ReadinessRequestsPerMinute", 120);
        if (readinessLimit is < 1 or > 600)
            throw new InvalidOperationException("Security:ReadinessRequestsPerMinute must be between 1 and 600.");
        services.AddOptions<AbuseProtectionOptions>().Bind(configuration.GetSection(AbuseProtectionOptions.Section))
            .Validate(x => x.IsValid(), "Invalid abuse protection configuration.").ValidateOnStart();
        services.AddSingleton<AbuseProtection>();
        services.AddSingleton<IAbuseProtection>(sp => sp.GetRequiredService<AbuseProtection>());
        services.AddOptions<ForwardedHeadersOptions>().Configure<IOptions<AbuseProtectionOptions>>((forwarding, configured) =>
        {
            // Never enable forwarding with an empty trust list: recent frameworks reject unknown proxies,
            // but explicitly clearing defaults also prevents accidentally trusting loopback ingress.
            forwarding.KnownProxies.Clear();
            forwarding.KnownIPNetworks.Clear();
            forwarding.ForwardedHeaders = configured.Value.TrustedProxies.Length == 0 ? ForwardedHeaders.None : ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            forwarding.ForwardLimit = 1;
            foreach (var proxy in configured.Value.TrustedProxies) forwarding.KnownProxies.Add(IPAddress.Parse(proxy));
        });
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            // Railway health is anonymous, but database probes must not be an unlimited pool bypass.
            options.AddPolicy("readiness", _ => RateLimitPartition.GetFixedWindowLimiter("readiness", _ => new FixedWindowRateLimiterOptions
            { PermitLimit = readinessLimit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            // Existing stricter account enumeration limits remain in addition to the bounded central budgets.
            options.AddPolicy(AccountRateLimits.Identity, http => RateLimitPartition.GetFixedWindowLimiter(Key(http), _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            options.AddPolicy(AccountRateLimits.Directory, http => RateLimitPartition.GetFixedWindowLimiter(Key(http), _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            options.OnRejected = async (context, ct) =>
            {
                var retry = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var delay) ? delay : TimeSpan.FromMinutes(1);
                context.HttpContext.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(retry.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
                await Results.Problem(statusCode: 429, title: "RATE_LIMIT_EXCEEDED", detail: "Too many requests. Please retry later.",
                    extensions: new Dictionary<string, object?> { ["code"] = "RATE_LIMIT_EXCEEDED", ["traceId"] = context.HttpContext.TraceIdentifier }).ExecuteAsync(context.HttpContext);
            };
        });
        return services;
    }

    private static string Key(HttpContext http) => http.User.Identity?.IsAuthenticated == true
        ? "user:" + http.User.FindFirst("sub")?.Value : "ip:" + (http.Connection.RemoteIpAddress?.ToString() ?? "unavailable");

    public static IApplicationBuilder UseAbuseHttpProtection(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        if (http.Items.TryGetValue(SupabaseAuthentication.AdmissionRejectedItem, out var rejected) && rejected is ApiException error)
            throw error;
        if (IsExempt(http.Request.Path) || http.Request.Method == "OPTIONS") { await next(http); return; }
        var limiter = http.RequestServices.GetRequiredService<AbuseProtection>();
        var category = Category(http.Request.Method, http.Request.Path.Value ?? "");
        if (http.User.Identity?.IsAuthenticated == true && Guid.TryParse(http.User.FindFirst("sub")?.Value, out var user))
        {
            if (!http.Items.ContainsKey(SupabaseAuthentication.AdmissionChargedItem)) limiter.Require(user, AbusePolicies.Global);
            // MCP has a dedicated transport budget, and hub frames are charged after the handshake.
            if (category != AbusePolicies.Autosave && category != AbusePolicies.Search && !http.Request.Path.StartsWithSegments("/mcp") && !http.Request.Path.StartsWithSegments("/api/v1/messaging/hub")) {
                if (category == AbusePolicies.Read) limiter.Require(user, category);
                else await limiter.RequireAsync(user, category, cancellationToken: http.RequestAborted);
            }
        }
        else
        {
            var address = http.Connection.RemoteIpAddress?.ToString() ?? "unavailable";
            limiter.RequireAnonymous(address, AbusePolicies.Global);
            limiter.RequireAnonymous(address, category);
        }
        await next(http);
    });
}
