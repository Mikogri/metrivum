using Metrivum.ClientDocumentation;
using Metrivum.ClientDocumentation.Infrastructure;
using Metrivum.Notifications;
using Metrivum.Integrations;
using Metrivum.Integrations.Infrastructure;
using Metrivum.Analytics;
using Metrivum.Messaging;
using Metrivum.Messaging.Infrastructure;
using Metrivum.Calendar;
using Metrivum.Calendar.Infrastructure;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using Npgsql;
using Metrivum.Access;
using Metrivum.Access.Domain;
using Metrivum.Access.Infrastructure;
using Metrivum.Accounts;
using Metrivum.Accounts.Features;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Coaching;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms;
using Metrivum.Forms.Infrastructure;
using Metrivum.Offers;
using Metrivum.Offers.Infrastructure;
using Metrivum.CheckIns;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Billing;
using Metrivum.Billing.Infrastructure;
using Metrivum.Api.Development;
using Metrivum.Api.Errors;
using Metrivum.Api.Security;
using Metrivum.ExerciseCatalog;
using Metrivum.ExerciseCatalog.Infrastructure;
using Metrivum.Media;
using Metrivum.Media.Infrastructure;
using Metrivum.Training;
using Metrivum.Training.Infrastructure;
using Metrivum.VideoAnalysis;
using Metrivum.VideoAnalysis.Infrastructure;

var exportContracts = args.Contains("--export-contracts");
var migrate = args.Contains("--migrate");
if (exportContracts && migrate)
    throw new InvalidOperationException("Contract export and database migration are separate operations.");
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    EnvironmentName = exportContracts ? "Testing" : null
});
// Browser SignalR transports carry JWTs in query strings; suppress request URL logging.
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.Logging.AddFilter("ModelContextProtocol", LogLevel.Warning);
if (exportContracts)
{
    // Export uses repository defaults only, never local secrets or deployment environment overrides.
    builder.Configuration.Sources.Clear();
    builder.Configuration.AddJsonFile("appsettings.json", optional: true).AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:Database"] = "Host=127.0.0.1;Port=1;Database=contract_export;Username=unconfigured",
        ["Supabase:Auth:ProjectUrl"] = "http://127.0.0.1:1",
        ["Workers:Enabled"] = "false"
    });
}
else
{
    if (!builder.Environment.IsEnvironment("Testing"))
        builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true);
    builder.Configuration.AddEnvironmentVariables();
}
// Development tool: `-- --delete-account <email or user id> [--confirm]` removes one account with everything tied to it.
var deleteAccount = Array.IndexOf(args, "--delete-account");
if (deleteAccount >= 0)
{
    if (deleteAccount + 1 >= args.Length || args[deleteAccount + 1].StartsWith("--", StringComparison.Ordinal))
        throw new InvalidOperationException("Usage: --delete-account <email or user id> [--confirm]");
    Environment.ExitCode = await AccountEraser.RunAsync(builder.Configuration, builder.Environment, args[deleteAccount + 1], args.Contains("--confirm"));
    return;
}
var connectionString = builder.Configuration.GetConnectionString(migrate ? "MigrationDatabase" : "Database");
if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("Set ConnectionStrings__Database (or ConnectionStrings__MigrationDatabase for the explicit --migrate command).");
var connection = new NpgsqlConnectionStringBuilder(connectionString);
if (builder.Environment.IsEnvironment("Testing") && connection.Host is not ("localhost" or "127.0.0.1" or "::1"))
    throw new InvalidOperationException("The isolated Testing host requires a loopback PostgreSQL database.");
if (!exportContracts && !migrate && !builder.Environment.IsEnvironment("Testing") && connection.Username is "postgres" or "supabase_admin")
    throw new InvalidOperationException("Use the restricted trainflow_api role for normal API operation, not a database administrator.");
if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing") && connection.SslMode != SslMode.VerifyFull)
    throw new InvalidOperationException("Production PostgreSQL connections must use SSL Mode=VerifyFull.");
connection.MaxPoolSize = Math.Min(connection.MaxPoolSize, 20);
connection.Timeout = 10;
connection.CommandTimeout = 30;
connection.IncludeErrorDetail = false;
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connection.ConnectionString));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHttpContextAccessor();
builder.Services.AddAccounts(builder.Configuration).AddAccess(builder.Configuration)
    .AddExerciseCatalog(builder.Configuration).AddTraining(builder.Configuration)
    .AddMedia(builder.Configuration).AddVideoAnalysis(builder.Configuration).AddClientAnalysis().AddCoaching(builder.Configuration).AddForms(builder.Configuration)
    .AddOffers(builder.Configuration).AddCheckIns(builder.Configuration).AddCalendar(builder.Configuration).AddMessaging(builder.Configuration).AddCoachingIntake().AddBilling(builder.Configuration).AddNotifications(builder.Configuration).AddAnalyticsModule(builder.Configuration).AddClientDocumentation();
if (!builder.Environment.IsEnvironment("Testing") && !exportContracts && !migrate
    && builder.Configuration.GetValue("Workers:Enabled", true))
    builder.Services.AddBillingWorker().AddNotificationsWorker().AddCheckInsWorker();
builder.Services.AddSupabaseAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddIntegrations(builder.Configuration);
builder.Services.AddMetrivumMcp(builder.Configuration, builder.Environment);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    options.SerializerOptions.RespectNullableAnnotations = true;
    options.SerializerOptions.MaxDepth = 48;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
});
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 2 * 1024 * 1024);
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    context.ProblemDetails.Extensions.TryAdd("traceId", Activity.Current?.Id ?? context.HttpContext.TraceIdentifier);
    context.ProblemDetails.Extensions.TryAdd("code", context.HttpContext.Response.StatusCode switch
    {
        401 => "UNAUTHENTICATED",
        403 => "FORBIDDEN",
        404 => "RESOURCE_NOT_FOUND",
        429 => "RATE_LIMIT_EXCEEDED",
        _ => "REQUEST_FAILED"
    });
});
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddOpenApi(options => options.AddSchemaTransformer((schema, context, ct) =>
{
    // Strict DTO binding must not make dynamic form-answer dictionaries look like empty objects.
    var type = context.JsonTypeInfo.Type;
    if (type.IsGenericType && type.GetGenericArguments() is [_, var valueType] && valueType == typeof(JsonElement)
        && (type.GetGenericTypeDefinition() == typeof(IReadOnlyDictionary<,>) || type.GetGenericTypeDefinition() == typeof(Dictionary<,>)))
    {
        schema.AdditionalPropertiesAllowed = true;
        schema.AdditionalProperties = new OpenApiSchema();
    }
    return Task.CompletedTask;
}).AddDocumentTransformer((document, context, ct) =>
{
    document.Info.Title = "Metrivum API";
    document.Info.Version = "v1";
    document.Components ??= new OpenApiComponents();
    document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
    document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT" };
    foreach (var (path, item) in document.Paths)
    {
        if (path.StartsWith("/health/", StringComparison.Ordinal) || path.StartsWith("/.well-known/", StringComparison.Ordinal))
            continue;
        if (item.Operations is null)
            continue;
        foreach (var operation in item.Operations.Values)
            operation.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] }];
    }
    // Contract files must not contain the ephemeral localhost port used by the export process.
    var relationship = document.Paths["/api/v1/coaching/relationships/{id}"].Operations!.Values.Single();
    relationship.Responses!["200"].Content!["application/json"].Schema = new OpenApiSchema
    {
        OneOf = [new OpenApiSchemaReference("ClientRelationshipDto", document), new OpenApiSchemaReference("CoachRelationshipDto", document)]
    };
    var application = document.Paths["/api/v1/coaching/applications/{id}"].Operations![HttpMethod.Get];
    application.Responses!["200"].Content!["application/json"].Schema = new OpenApiSchema
    {
        OneOf = [new OpenApiSchemaReference("ApplicationDetailDto", document), new OpenApiSchemaReference("CoachApplicationDetailDto", document)]
    };
    foreach (var (path, item) in document.Paths.Where(x =>
        new[] { "/api/v1/coaching/", "/api/v1/forms/", "/api/v1/offers/", "/api/v1/check-ins/" }.Any(prefix => x.Key.StartsWith(prefix, StringComparison.Ordinal))
        && x.Key.Contains('{') && !x.Key.Contains("/billing", StringComparison.Ordinal) && !x.Key.Contains("/payment-dues/", StringComparison.Ordinal)
        && !x.Key.EndsWith("/conversation", StringComparison.Ordinal)
        && !x.Key.Contains("/documentation", StringComparison.Ordinal)))
    {
        foreach (var (method, operation) in item.Operations!)
        {
            if (method == HttpMethod.Get)
                continue;
            operation.Parameters ??= [];
            operation.Parameters.Add(new OpenApiParameter
            {
                Name = "If-Match",
                In = ParameterLocation.Header,
                Required = true,
                Description = "Current strong numeric ETag. Membership changes use the group ETag.",
                Schema = new OpenApiSchema { Type = JsonSchemaType.String }
            });
        }
    }
    foreach (var (path, method, header, description) in new[]
    {
        ("/api/v1/messaging/conversations/{id}/messages", HttpMethod.Post, "Idempotency-Key", "Stable sender request key, at most 100 characters. Reuse only for the same message payload."),
        ("/api/v1/messaging/uploads/{id}", HttpMethod.Delete, "If-Match", "Current strong numeric Media ETag.")
    })
    {
        var operation = document.Paths[path].Operations![method];
        operation.Parameters ??= [];
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = header,
            In = ParameterLocation.Header,
            Required = true,
            Description = description,
            Schema = new OpenApiSchema { Type = JsonSchemaType.String }
        });
    }
    foreach (var (path, item) in document.Paths)
        foreach (var (method, operation) in item.Operations!)
        {
            var versionedTraining = path.StartsWith("/api/v1/training/", StringComparison.Ordinal)
                && (path.EndsWith("/status", StringComparison.Ordinal) || path.EndsWith("/refresh", StringComparison.Ordinal)
                    || path.Contains("/executions/", StringComparison.Ordinal)) && method != HttpMethod.Get;
            var versionedDocument = path.Contains("/documentation/", StringComparison.Ordinal)
                && (method == HttpMethod.Patch || path.EndsWith("/share", StringComparison.Ordinal));
            var idempotent = method == HttpMethod.Post && (path.EndsWith("/assignments", StringComparison.Ordinal)
                && path.StartsWith("/api/v1/training/programs/", StringComparison.Ordinal) || path.EndsWith("/generator/save-draft", StringComparison.Ordinal));
            if (!versionedTraining && !versionedDocument && !idempotent)
                continue;
            operation.Parameters ??= [];
            operation.Parameters.Add(new OpenApiParameter
            {
                Name = idempotent ? "Idempotency-Key" : "If-Match",
                In = ParameterLocation.Header,
                Required = true,
                Description = idempotent ? "Stable key for the same payload on retries." : "Current strong numeric ETag.",
                Schema = new OpenApiSchema { Type = JsonSchemaType.String }
            });
        }
    document.Servers = [];
    return Task.CompletedTask;
}));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
        .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .WithHeaders("Authorization", "Content-Type", "If-Match", "Idempotency-Key", "X-SignalR-User-Agent")
        .AllowCredentials()
        .WithExposedHeaders("ETag", "Location", "Retry-After")));
builder.Services.AddAbuseHttpProtection(builder.Configuration);
builder.Services.AddReviewedJsonCompression();
if (exportContracts) builder.WebHost.UseUrls("http://127.0.0.1:0");
var app = builder.Build();
_ = app.Services.GetRequiredService<FeatureCatalog>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseForwardedHeaders();
app.UseCors();
app.UseAuthentication();
app.UseAbuseHttpProtection();
app.UseRateLimiter();
app.UseIntegrationTokenIsolation();
app.UseAuthorization();
app.UseReviewedJsonCompression();
app.Use(async (http, next) =>
{
    http.Response.Headers.CacheControl = "no-store";
    http.Response.Headers["X-Content-Type-Options"] = "nosniff";
    // The API answers JSON and files only: nothing it returns may run scripts, be framed or leak the URL onward.
    http.Response.Headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    http.Response.Headers["X-Frame-Options"] = "DENY";
    http.Response.Headers["Referrer-Policy"] = "no-referrer";
    http.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
    await next(http);
});
app.MapGet("/health/live", () => Results.Ok(new { status = "live" })).AllowAnonymous();
app.MapGet("/health/ready", async (NpgsqlDataSource dataSource, CancellationToken ct) =>
{
    try
    {
        await using var command = dataSource.CreateCommand("SELECT 1");
        await command.ExecuteScalarAsync(ct);
        return Results.Ok(new
        {
            status = "ready"
        });
    }
    catch (NpgsqlException) { return Results.Problem(statusCode: 503, title: "DATABASE_UNAVAILABLE"); }
}).AllowAnonymous();
var openApi = app.MapOpenApi();
if (exportContracts) openApi.AllowAnonymous();
app.MapAccounts();
app.MapAccess();
app.MapExerciseCatalog();
app.MapTraining();
app.MapMedia();
app.MapVideoAnalysis();
app.MapCoaching();
app.MapForms();
app.MapOffers();
app.MapCheckIns();
app.MapCalendar();
app.MapMessaging();
app.MapCoachingIntake();
app.MapBilling();
app.MapNotifications();
app.MapAnalyticsModule();
app.MapClientDocumentation();
app.MapIntegrations();
app.MapDevelopmentTools();
app.MapMetrivumMcp();

if (migrate)
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbs = new DbContext[]
    {
        scope.ServiceProvider.GetRequiredService<NotificationsDbContext>(), scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>(),
        scope.ServiceProvider.GetRequiredService<AccountsDbContext>(), scope.ServiceProvider.GetRequiredService<AccessDbContext>(),
        scope.ServiceProvider.GetRequiredService<ExerciseCatalogDbContext>(), scope.ServiceProvider.GetRequiredService<TrainingDbContext>(),
        scope.ServiceProvider.GetRequiredService<MediaDbContext>(), scope.ServiceProvider.GetRequiredService<VideoAnalysisDbContext>(),
        scope.ServiceProvider.GetRequiredService<CoachingDbContext>(), scope.ServiceProvider.GetRequiredService<FormsDbContext>(),
        scope.ServiceProvider.GetRequiredService<OffersDbContext>(), scope.ServiceProvider.GetRequiredService<BillingDbContext>(), scope.ServiceProvider.GetRequiredService<CheckInsDbContext>(), scope.ServiceProvider.GetRequiredService<CalendarDbContext>(), scope.ServiceProvider.GetRequiredService<MessagingDbContext>(), scope.ServiceProvider.GetRequiredService<DocumentationDbContext>()
    };
    // Poolers may ignore startup Options. Keep the shared session open so EF retains SET ROLE.
    if (builder.Configuration.GetValue<bool>("Migrations:UseMigratorRole"))
    {
        await dbs[0].Database.OpenConnectionAsync();
        await dbs[0].Database.ExecuteSqlRawAsync("SET ROLE trainflow_migrator");
    }
    foreach (var db in dbs)
        await db.Database.MigrateAsync();
    var access = scope.ServiceProvider.GetRequiredService<AccessDbContext>();
    if (!await access.Configurations.AnyAsync(x => x.Id == "v1-default"))
    {
        access.Configurations.Add(new AccessConfiguration { Id = "v1-default", GrantedFeatures = app.Services.GetRequiredService<FeatureCatalog>().Definitions.Keys.Order().ToArray() });
        await access.SaveChangesAsync();
    }
    return;
}
if (exportContracts)
{
    await app.StartAsync();
    var output = Environment.GetEnvironmentVariable("TRAINFLOW_CONTRACT_OUTPUT") ?? Path.Combine(Directory.GetCurrentDirectory(), "contracts", "generated");
    Directory.CreateDirectory(output);
    using var http = new HttpClient();
    await WriteContractAsync("openapi.json", await http.GetStringAsync(app.Urls.Single() + "/openapi/v1.json"));
    var features = JsonSerializer.Serialize(app.Services.GetRequiredService<FeatureCatalog>().Definitions.Values.OrderBy(x => x.Key), new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
    await WriteContractAsync("features.json", features + "\n");
    await WriteContractAsync("features.ts", "// Generated from module feature definitions. Do not edit.\nexport const features = " + features + " as const;\nexport type FeatureKey = (typeof features)[number]['key'];\n");
    await app.StopAsync();
    return;

    async Task WriteContractAsync(string name, string content)
    {
        // Replace rather than truncate: editor/indexer mappings on Windows may keep the old file open.
        var path = Path.Combine(output, name);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, content);
            File.Move(temporary, path, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
if (!builder.Environment.IsEnvironment("Testing"))
    await RuntimeDatabaseGuard.ValidateAsync(app.Services.GetRequiredService<NpgsqlDataSource>(), CancellationToken.None);
await app.RunAsync();

public partial class Program;
