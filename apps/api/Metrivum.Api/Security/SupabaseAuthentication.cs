using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Metrivum.Api.Security;

/// <summary>Contains the configured supabase auth settings and bounds for API host; does not itself access the database.</summary>
public sealed class SupabaseAuthOptions
{
    public string ProjectUrl { get; set; } = "http://127.0.0.1:54321";
    public string Audience { get; set; } = "authenticated";

    /// <summary>
    /// Refuse first-level (aal1) sessions of accounts with a verified second factor. Off until
    /// <c>infra/auth-second-factor.sql</c> has been applied to the database.
    /// </summary>
    public bool RequireSecondFactorWhenEnrolled { get; set; }
    public string Issuer => ProjectUrl.TrimEnd('/') + "/auth/v1";
    public string JwksUrl => Issuer + "/.well-known/jwks.json";
}

/// <summary>Configures Supabase JWT validation and authentication events for the API host.</summary>
public static class SupabaseAuthentication
{
    /// <summary>Marks a request refused only because its session still needs the second factor.</summary>
    public const string SecondFactorRequiredItem = "Metrivum.Auth.SecondFactorRequired";
    public const string AdmissionChargedItem = "Metrivum.Auth.AdmissionCharged";
    public const string AdmissionRejectedItem = "Metrivum.Auth.AdmissionRejected";

    public static IServiceCollection AddSupabaseAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var settings =
            configuration.GetSection("Supabase:Auth").Get<SupabaseAuthOptions>() ?? new();
        if (
            !Uri.TryCreate(settings.ProjectUrl, UriKind.Absolute, out var projectUri)
            || (
                projectUri.Scheme != "https"
                && !(environment.IsDevelopment() || environment.IsEnvironment("Testing"))
            )
            || (projectUri.Scheme != "https" && !projectUri.IsLoopback)
            || string.IsNullOrWhiteSpace(settings.Audience)
        )
            throw new InvalidOperationException(
                "Configure a trusted HTTPS Supabase Auth project URL and audience (loopback HTTP only in Development/Testing)."
            );
        services.AddSingleton(settings);
        services.AddSingleton<IAuthSessionValidator, AuthSessionValidator>();
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.SaveToken = false;
                options.IncludeErrorDetails = false;
                options.RefreshOnIssuerKeyNotFound = true;
                // Supabase exposes JWKS directly. Do not assume an OpenID discovery document exists.
                options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                    settings.JwksUrl,
                    new SupabaseJwksRetriever(settings.Issuer),
                    new HttpDocumentRetriever { RequireHttps = projectUri.Scheme == "https" }
                )
                {
                    AutomaticRefreshInterval = TimeSpan.FromMinutes(5),
                    RefreshInterval = TimeSpan.FromSeconds(30),
                    UseLastKnownGoodConfiguration = false,
                };
                options.TokenValidationParameters = ValidationParameters(settings);
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        // Only authenticated realtime transports accepts query credentials; REST keeps bearer headers.
                        if (
                            (
                                context.Request.Path == "/api/v1/messaging/hub"
                                || context.Request.Path == "/api/v1/notifications/hub"
                            )
                            && string.IsNullOrEmpty(context.Request.Headers.Authorization)
                            && (
                                context.HttpContext.WebSockets.IsWebSocketRequest
                                || context.Request.Headers.Accept.Contains("text/event-stream")
                            )
                        )
                            context.Token = context.Request.Query["access_token"];
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal!;
                        if (
                            !Guid.TryParse(principal.FindFirst("sub")?.Value, out var id)
                            || id == Guid.Empty
                            || principal.FindFirst("role")?.Value != "authenticated"
                            || principal.FindFirst("is_anonymous")?.Value != "false"
                            || !Guid.TryParse(
                                principal.FindFirst("session_id")?.Value,
                                out var session
                            )
                            || session == Guid.Empty
                        )
                        {
                            context.Fail("A non-anonymous Supabase user session is required.");
                            return;
                        }
                        // Signature/issuer/claims are validated, but even revoked signed tokens can otherwise
                        // force unlimited session SQL reads before the ordinary HTTP limiter sees them.
                        try
                        {
                            context
                                .HttpContext.RequestServices.GetRequiredService<AbuseProtection>()
                                .Require(id, AbusePolicies.Global);
                            context.HttpContext.Items[AdmissionChargedItem] = true;
                        }
                        catch (ApiException error)
                            when (error.Status == StatusCodes.Status429TooManyRequests)
                        {
                            context.HttpContext.Items[AdmissionRejectedItem] = error;
                            context.NoResult();
                            return;
                        }
                        var validator =
                            context.HttpContext.RequestServices.GetRequiredService<IAuthSessionValidator>();
                        if (
                            !await validator.IsActiveAsync(
                                id,
                                session,
                                context.HttpContext.RequestAborted
                            )
                        )
                        {
                            context.Fail("The user session is no longer active.");
                            return;
                        }
                        // A signed aal2 token already passed the second step; only aal1 tokens need Auth's records.
                        if (
                            settings.RequireSecondFactorWhenEnrolled
                            && principal.FindFirst("aal")?.Value != "aal2"
                            && !await validator.MeetsSecondFactorAsync(
                                id,
                                session,
                                context.HttpContext.RequestAborted
                            )
                        )
                        {
                            context.HttpContext.Items[SecondFactorRequiredItem] = true;
                            context
                                .HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
                                .CreateLogger("Metrivum.Security")
                                .LogWarning(
                                    "Refused a first-level session for user {UserId}: the account requires its second factor.",
                                    id
                                );
                            context.Fail("The session has not passed the second factor.");
                        }
                    },
                    OnChallenge = async context =>
                    {
                        if (!context.HttpContext.Items.ContainsKey(SecondFactorRequiredItem))
                            return;
                        // A stable code lets the web app open the second step instead of signing the person out.
                        context.HandleResponse();
                        context.Response.Headers.CacheControl = "no-store";
                        await Results
                            .Problem(
                                statusCode: StatusCodes.Status401Unauthorized,
                                title: "Second factor required",
                                detail: "Verify with your authenticator app to continue.",
                                extensions: new Dictionary<string, object?>
                                {
                                    ["code"] = "MFA_REQUIRED",
                                }
                            )
                            .ExecuteAsync(context.HttpContext);
                    },
                };
            });
        services
            .AddAuthorizationBuilder()
            .SetFallbackPolicy(
                new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser()
                    .Build()
            );
        return services;
    }

    public static TokenValidationParameters ValidationParameters(SupabaseAuthOptions settings) =>
        new()
        {
            ValidateIssuer = true,
            ValidIssuer = settings.Issuer,
            ValidateAudience = true,
            ValidAudience = settings.Audience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            TryAllIssuerSigningKeys = false,
            ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256],
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "sub",
            RoleClaimType = "trainflow_role_never_from_jwt",
        };
}

/// <summary>Downloads Supabase signing keys for JWT verification; does not access application tables.</summary>
public sealed class SupabaseJwksRetriever(string issuer)
    : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address,
        IDocumentRetriever retriever,
        CancellationToken cancellationToken
    )
    {
        var document = await retriever.GetDocumentAsync(address, cancellationToken);
        var configuration = new OpenIdConnectConfiguration { Issuer = issuer, JwksUri = address };
        foreach (var key in new JsonWebKeySet(document).GetSigningKeys())
            configuration.SigningKeys.Add(key);
        if (configuration.SigningKeys.Count == 0)
            throw new InvalidOperationException(
                "No asymmetric signing keys were returned by the configured Supabase JWKS endpoint."
            );
        return configuration;
    }
}
