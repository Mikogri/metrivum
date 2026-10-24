using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace TrainFlow.Api.Security;

public sealed class SupabaseAuthOptions
{
    public string ProjectUrl { get; set; } = "http://127.0.0.1:54321";
    public string Audience { get; set; } = "authenticated";
    public string Issuer => ProjectUrl.TrimEnd('/') + "/auth/v1";
    public string JwksUrl => Issuer + "/.well-known/jwks.json";
}

public static class SupabaseAuthentication
{
    public static IServiceCollection AddSupabaseAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var settings = configuration.GetSection("Supabase:Auth").Get<SupabaseAuthOptions>() ?? new();
        if (!Uri.TryCreate(settings.ProjectUrl, UriKind.Absolute, out var projectUri) ||
            (projectUri.Scheme != "https" && !(environment.IsDevelopment() || environment.IsEnvironment("Testing"))) ||
            (projectUri.Scheme != "https" && !projectUri.IsLoopback) || string.IsNullOrWhiteSpace(settings.Audience))
            throw new InvalidOperationException("Configure a trusted HTTPS Supabase Auth project URL and audience (loopback HTTP only in Development/Testing).");
        services.AddSingleton(settings);
        services.AddSingleton<IAuthSessionValidator, AuthSessionValidator>();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.SaveToken = false;
            options.IncludeErrorDetails = false;
            options.RefreshOnIssuerKeyNotFound = true;
            // Supabase exposes JWKS directly. Do not assume an OpenID discovery document exists.
            options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(settings.JwksUrl,
                new SupabaseJwksRetriever(settings.Issuer), new HttpDocumentRetriever { RequireHttps = projectUri.Scheme == "https" })
            {
                AutomaticRefreshInterval = TimeSpan.FromMinutes(5),
                RefreshInterval = TimeSpan.FromSeconds(30),
                UseLastKnownGoodConfiguration = false
            };
            options.TokenValidationParameters = ValidationParameters(settings);
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    // Only authenticated realtime transports accepts query credentials; REST keeps bearer headers.
                    if ((context.Request.Path == "/api/v1/messaging/hub" || context.Request.Path == "/api/v1/notifications/hub") &&
                        string.IsNullOrEmpty(context.Request.Headers.Authorization) &&
                        (context.HttpContext.WebSockets.IsWebSocketRequest || context.Request.Headers.Accept.Contains("text/event-stream")))
                        context.Token = context.Request.Query["access_token"];
                    return Task.CompletedTask;
                },
                OnTokenValidated = async context =>
                {
                    var principal = context.Principal!;
                    if (!Guid.TryParse(principal.FindFirst("sub")?.Value, out var id) || id == Guid.Empty ||
                        principal.FindFirst("role")?.Value != "authenticated" ||
                        principal.FindFirst("is_anonymous")?.Value != "false" ||
                        !Guid.TryParse(principal.FindFirst("session_id")?.Value, out var session) || session == Guid.Empty)
                    {
                        context.Fail("A non-anonymous Supabase user session is required.");
                        return;
                    }
                    var validator = context.HttpContext.RequestServices.GetRequiredService<IAuthSessionValidator>();
                    if (!await validator.IsActiveAsync(id, session, context.HttpContext.RequestAborted))
                        context.Fail("The user session is no longer active.");
                }
            };
        });
        services.AddAuthorizationBuilder().SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser().Build());
        return services;
    }

    public static TokenValidationParameters ValidationParameters(SupabaseAuthOptions settings) => new()
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
        RoleClaimType = "trainflow_role_never_from_jwt"
    };
}

public sealed class SupabaseJwksRetriever(string issuer) : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(string address, IDocumentRetriever retriever, CancellationToken cancellationToken)
    {
        var document = await retriever.GetDocumentAsync(address, cancellationToken);
        var configuration = new OpenIdConnectConfiguration { Issuer = issuer, JwksUri = address };
        foreach (var key in new JsonWebKeySet(document).GetSigningKeys())
            configuration.SigningKeys.Add(key);
        if (configuration.SigningKeys.Count == 0)
            throw new InvalidOperationException("No asymmetric signing keys were returned by the configured Supabase JWKS endpoint.");
        return configuration;
    }
}
