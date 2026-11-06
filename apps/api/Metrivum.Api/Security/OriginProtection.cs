using System.Security.Cryptography;
using System.Text;

namespace Metrivum.Api.Security;

/// <summary>Optional edge-to-origin credential; host names and forwarded headers alone do not prove edge transit.</summary>
public static class OriginProtection
{
    public const string Header = "X-Metrivum-Origin-Token";

    public static IApplicationBuilder UseOriginProtection(this IApplicationBuilder app, IConfiguration configuration)
    {
        var secret = configuration["Security:OriginToken"];
        if (string.IsNullOrEmpty(secret)) return app; // Staged rollout: deploy first, configure the edge, then enforce.
        if (secret.Length < 32 || secret.Length > 256 || secret.Any(char.IsControl))
            throw new InvalidOperationException("Security:OriginToken must contain 32–256 characters without control characters.");
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
        return app.Use(async (http, next) =>
        {
            // Railway health probes cannot supply custom headers. Neither endpoint exposes application data.
            if (http.Request.Path is var path && (path == "/health/live" || path == "/health/ready"))
            {
                await next(http);
                return;
            }
            var values = http.Request.Headers[Header];
            if (values.Count != 1 || values[0] is not { Length: >= 32 and <= 256 } provided ||
                !CryptographicOperations.FixedTimeEquals(expected, SHA256.HashData(Encoding.UTF8.GetBytes(provided))))
            {
                http.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            // Never propagate the deployment credential to endpoint code or application logs.
            http.Request.Headers.Remove(Header);
            await next(http);
        });
    }
}
