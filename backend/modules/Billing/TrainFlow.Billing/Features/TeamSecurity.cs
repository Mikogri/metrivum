using System.Security.Claims;
using System.Text.Json;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Billing.Features;

public static class TeamSecurity
{
    public static void RequireRecentAuthentication(ClaimsPrincipal user, DateTimeOffset now)
    {
        var timestamps = new List<long>();
        if (long.TryParse(user.FindFirst("auth_time")?.Value, out var auth))
            timestamps.Add(auth);
        foreach (var claim in user.FindAll("amr"))
        {
            try
            {
                using var json = JsonDocument.Parse(claim.Value);
                var methods = json.RootElement.ValueKind == JsonValueKind.Array ? json.RootElement.EnumerateArray().ToArray() : [json.RootElement];
                foreach (var method in methods)
                    if (method.ValueKind == JsonValueKind.Object && method.TryGetProperty("method", out var name)
                        && name.ValueKind == JsonValueKind.String && name.GetString() is "password" or "otp" or "totp" or "oauth" or "magiclink" or "sso/saml"
                        && method.TryGetProperty("timestamp", out var time) && time.ValueKind == JsonValueKind.Number && time.TryGetInt64(out var value))
                        timestamps.Add(value);
            }
            catch (JsonException) { }
        }
        // Token refresh changes iat without proving a recent interactive authentication.
        if (!timestamps.Any(x => x <= now.ToUnixTimeSeconds() && x >= now.ToUnixTimeSeconds() - 600))
            throw new ApiException(403, "REAUTHENTICATION_REQUIRED", "Sign in again before changing Team ownership or scheduling dissolution.");
    }
}
