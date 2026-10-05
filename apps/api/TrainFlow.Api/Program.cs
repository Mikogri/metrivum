using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using Npgsql;
using TrainFlow.Access;
using TrainFlow.Access.Domain;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Accounts;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.Api.Errors;
using TrainFlow.Api.Security;
using TrainFlow.ExerciseCatalog;
using TrainFlow.ExerciseCatalog.Infrastructure;
using TrainFlow.Media;
using TrainFlow.Media.Infrastructure;
using TrainFlow.Training;
using TrainFlow.Training.Infrastructure;
using TrainFlow.VideoAnalysis;
using TrainFlow.VideoAnalysis.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true).AddEnvironmentVariables();
var exportContracts = args.Contains("--export-contracts");
var migrate = args.Contains("--migrate");
var connectionString = builder.Configuration.GetConnectionString(migrate ? "MigrationDatabase" : "Database");
if (exportContracts) connectionString ??= "Host=127.0.0.1;Database=contract_export;Username=unconfigured";
if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("Set ConnectionStrings__Database (or ConnectionStrings__MigrationDatabase for the explicit --migrate command).");
var connection = new NpgsqlConnectionStringBuilder(connectionString);
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
    .AddMedia(builder.Configuration).AddVideoAnalysis(builder.Configuration);
builder.Services.AddSupabaseAuthentication(builder.Configuration, builder.Environment);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
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
builder.Services.AddOpenApi(options => options.AddDocumentTransformer((document, context, ct) =>
{
    document.Info.Title = "TrainFlow API";
    document.Info.Version = "v1";
    document.Components ??= new OpenApiComponents();
    document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
    document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT" };
    foreach (var (path, item) in document.Paths)
    {
        if (path.StartsWith("/health/", StringComparison.Ordinal))
            continue;
        if (item.Operations is null)
            continue;
        foreach (var operation in item.Operations.Values)
            operation.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] }];
    }
    // Contract files must not contain the ephemeral localhost port used by the export process.
    document.Servers = [];
    return Task.CompletedTask;
}));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
        .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .WithHeaders("Authorization", "Content-Type", "If-Match", "Idempotency-Key")
        .WithExposedHeaders("ETag", "Location", "Retry-After")));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http => RateLimitPartition.GetFixedWindowLimiter(
        http.User.FindFirst("sub")?.Value ?? http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
if (exportContracts) builder.WebHost.UseUrls("http://127.0.0.1:0");
var app = builder.Build();
_ = app.Services.GetRequiredService<FeatureCatalog>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.Use(async (http, next) =>
{
    http.Response.Headers.CacheControl = "no-store";
    http.Response.Headers["X-Content-Type-Options"] = "nosniff";
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

if (migrate)
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbs = new DbContext[]
    {
        scope.ServiceProvider.GetRequiredService<AccountsDbContext>(), scope.ServiceProvider.GetRequiredService<AccessDbContext>(),
        scope.ServiceProvider.GetRequiredService<ExerciseCatalogDbContext>(), scope.ServiceProvider.GetRequiredService<TrainingDbContext>(),
        scope.ServiceProvider.GetRequiredService<MediaDbContext>(), scope.ServiceProvider.GetRequiredService<VideoAnalysisDbContext>()
    };
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
    await File.WriteAllTextAsync(Path.Combine(output, "openapi.json"), await http.GetStringAsync(app.Urls.Single() + "/openapi/v1.json"));
    var features = JsonSerializer.Serialize(app.Services.GetRequiredService<FeatureCatalog>().Definitions.Values.OrderBy(x => x.Key), new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
    await File.WriteAllTextAsync(Path.Combine(output, "features.json"), features + "\n");
    await File.WriteAllTextAsync(Path.Combine(output, "features.ts"), "// Generated from module feature definitions. Do not edit.\nexport const features = " + features + " as const;\nexport type FeatureKey = (typeof features)[number]['key'];\n");
    await app.StopAsync();
    return;
}
if (!builder.Environment.IsEnvironment("Testing"))
    await RuntimeDatabaseGuard.ValidateAsync(app.Services.GetRequiredService<NpgsqlDataSource>(), CancellationToken.None);
await app.RunAsync();

public partial class Program;
