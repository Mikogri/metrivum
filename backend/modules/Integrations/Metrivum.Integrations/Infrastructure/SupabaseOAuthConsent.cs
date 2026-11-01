using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Features;

namespace Metrivum.Integrations.Infrastructure;

public sealed class SupabaseOAuthConsent(HttpClient client, IConfiguration configuration, IHttpContextAccessor http, IAccountContext accounts, ILogger<SupabaseOAuthConsent> logger)
{
    public async Task TryRevokeAsync(string clientId, CancellationToken ct)
    {
        try
        {
            var origin = configuration["Supabase:Auth:ProjectUrl"];
            var key = configuration["Supabase:Auth:PublishableKey"];
            var bearer = http.HttpContext?.Request.Headers.Authorization.ToString();
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var project) || !string.IsNullOrEmpty(project.UserInfo)
                || (project.Scheme != "https" && !(configuration.GetValue<bool>("Integrations:AllowLocalHttp") && project.IsLoopback && project.Scheme == "http"))
                || string.IsNullOrWhiteSpace(key) || !key.StartsWith("sb_publishable_", StringComparison.Ordinal)
                || bearer is null || !bearer.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("Supabase OAuth grant revocation skipped because consent configuration is unavailable; Metrivum access was revoked.");
                return;
            }
            using var request = new HttpRequestMessage(HttpMethod.Delete, origin!.TrimEnd('/') + "/auth/v1/user/oauth/grants?client_id=" + Uri.EscapeDataString(clientId));
            request.Headers.Authorization = AuthenticationHeaderValue.Parse(bearer);
            request.Headers.Add("apikey", key);
            using var response = await client.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("Supabase OAuth grant revocation returned status {Status}; Metrivum access remains revoked.", (int)response.StatusCode);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            logger.LogWarning("Supabase OAuth grant revocation was unavailable; Metrivum access remains revoked.");
        }
    }
    public async Task<ConsentDetails> DetailsAsync(string authorizationId, CancellationToken ct)
    {
        var data = await SendAsync(authorizationId, null, ct);
        if (!data.TryGetProperty("authorization_id", out var verifiedId) || verifiedId.GetString() != authorizationId
            || !data.TryGetProperty("user", out var user) || !user.TryGetProperty("id", out var userId)
            || !Guid.TryParse(userId.GetString(), out var subject) || subject != accounts.UserId)
            throw new ApiException(409, "OAUTH_CONSENT_UNAVAILABLE", "This authorization cannot be used to grant Metrivum permissions. Start a new connection request.");
        var app = data.GetProperty("client");
        var clientId = app.GetProperty("id").GetString();
        var name = app.TryGetProperty("name", out var clientName) ? clientName.GetString() : null;
        var redirect = data.GetProperty("redirect_uri").GetString();
        if (string.IsNullOrWhiteSpace(clientId) || clientId.Length > 200 || string.IsNullOrWhiteSpace(name)
            || name.Length > 200 || name.Any(char.IsControl) || !SafeRedirect(redirect, out _))
            throw new ApiException(400, "OAUTH_CLIENT_INVALID", "The requesting client identity or redirect URI is invalid.");
        var scopes = data.TryGetProperty("scope", out var scope) ? scope.GetString()?.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [] : [];
        return new(authorizationId, clientId, name, redirect!, scopes, IntegrationGrants.All);
    }

    public async Task<string> DecideAsync(string authorizationId, string action, string expectedRedirectUri, CancellationToken ct)
    {
        var response = await SendAsync(authorizationId, action, ct);
        var redirect = response.GetProperty("redirect_url").GetString();
        if (!SafeRedirect(redirect, out var uri) || !Uri.TryCreate(expectedRedirectUri, UriKind.Absolute, out var expected)
            || uri!.GetLeftPart(UriPartial.Path) != expected.GetLeftPart(UriPartial.Path))
            throw new ApiException(502, "OAUTH_REDIRECT_INVALID", "The authorization server returned an invalid redirect.");
        return redirect!;
    }

    private bool SafeRedirect(string? value, out Uri? uri) => Uri.TryCreate(value, UriKind.Absolute, out uri)
        && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Fragment)
        && (uri.Scheme == "https" || (configuration.GetValue<bool>("Integrations:AllowLocalHttp") && uri.Scheme == "http" && uri.IsLoopback));

    private async Task<JsonElement> SendAsync(string authorizationId, string? action, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(authorizationId) || authorizationId.Length > 200 || authorizationId.Any(x => !char.IsAsciiLetterOrDigit(x) && x != '-'))
            throw ApiException.Invalid("Invalid authorization ID.");
        var origin = configuration["Supabase:Auth:ProjectUrl"];
        var apiKey = configuration["Supabase:Auth:PublishableKey"];
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var project) || !string.IsNullOrEmpty(project.UserInfo)
            || (project.Scheme != "https" && !(configuration.GetValue<bool>("Integrations:AllowLocalHttp") && project.IsLoopback && project.Scheme == "http"))
            || string.IsNullOrWhiteSpace(apiKey) || !apiKey.StartsWith("sb_publishable_", StringComparison.Ordinal))
            throw new ApiException(503, "OAUTH_NOT_CONFIGURED", "OAuth consent requires the configured Supabase project and publishable key.");
        var bearer = http.HttpContext?.Request.Headers.Authorization.ToString();
        if (bearer is null || !bearer.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            throw new ApiException(401, "UNAUTHENTICATED", "A valid Metrivum session is required.");
        using var request = new HttpRequestMessage(action is null ? HttpMethod.Get : HttpMethod.Post,
            origin!.TrimEnd('/') + "/auth/v1/oauth/authorizations/" + Uri.EscapeDataString(authorizationId) + (action is null ? "" : "/consent"));
        request.Headers.Authorization = AuthenticationHeaderValue.Parse(bearer);
        request.Headers.Add("apikey", apiKey);
        if (action is not null) request.Content = JsonContent.Create(new { action });
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
            throw new ApiException((int)response.StatusCode is 400 or 401 or 403 or 404 ? (int)response.StatusCode : 502,
                "OAUTH_CONSENT_FAILED", "The authorization server could not verify this consent request.");
        await response.Content.LoadIntoBufferAsync(64 * 1024, ct);
        return await response.Content.ReadFromJsonAsync<JsonElement>(ct);
    }
}
