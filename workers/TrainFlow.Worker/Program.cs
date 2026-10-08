using TrainFlow.Notifications;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using TrainFlow.Media;
using TrainFlow.VideoAnalysis;

var builder = Host.CreateApplicationBuilder(args);
if (!builder.Environment.IsEnvironment("Testing"))
{
    builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);
    if (builder.Environment.IsDevelopment())
        builder.Configuration.AddUserSecrets<Worker>(optional: true);
    builder.Configuration.AddEnvironmentVariables().AddCommandLine(args);
}
var connectionString = builder.Configuration["ConnectionStrings:WorkerDatabase"]
    ?? throw new InvalidOperationException("ConnectionStrings:WorkerDatabase must name the dedicated worker database role.");
var connection = new NpgsqlConnectionStringBuilder(connectionString);
if (!builder.Environment.IsEnvironment("Testing") && connection.Password == "SET_LOCALLY")
    throw new InvalidOperationException("Set ConnectionStrings:WorkerDatabase with the dedicated worker password in appsettings.Local.json or ConnectionStrings__WorkerDatabase. No analysis worker has started.");
if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing") && connection.SslMode != SslMode.VerifyFull)
    throw new InvalidOperationException("Production PostgreSQL connections must use SSL Mode=VerifyFull.");
if (connection.MaxPoolSize > 10) connection.MaxPoolSize = 10;
connection.Timeout = 10;
connection.CommandTimeout = 30;
connection.IncludeErrorDetail = false;
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connection.ConnectionString));
builder.Services.AddMedia(builder.Configuration);
builder.Services.AddNotificationPublishing(builder.Configuration);
builder.Services.AddVideoAnalysis(builder.Configuration);
builder.Services.AddSingleton<AnalysisWorkerRunner>();
builder.Services.AddHostedService<Worker>();
var host = builder.Build();
await using (var command = host.Services.GetRequiredService<NpgsqlDataSource>().CreateCommand("""
    SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT has_database_privilege(current_database(), 'CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('public','media','video_analysis','notifications') AND has_schema_privilege(n.oid, 'CREATE'))
      AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('accounts','access','training','exercise_catalog') AND c.relkind IN ('r','p') AND has_table_privilege(c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
    FROM pg_roles WHERE rolname=current_user
    """))
{
    if (await command.ExecuteScalarAsync() is not true)
        throw new InvalidOperationException("Worker role must have no elevated, DDL or unrelated module privileges.");
}
await host.RunAsync();

internal sealed class Worker(IServiceScopeFactory scopes, AnalysisWorkerRunner runner, IOptions<AnalysisOptions> options, ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var cleanupAt = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (DateTimeOffset.UtcNow >= cleanupAt)
                {
                    cleanupAt = DateTimeOffset.UtcNow.AddMinutes(1);
                    try
                    {
                        await using var scope = scopes.CreateAsyncScope();
                        var deleted = await scope.ServiceProvider.GetRequiredService<MediaLibrary>().CleanupAsync(stoppingToken);
                        if (deleted > 0)
                            logger.LogInformation("Removed {Count} expired media objects", deleted);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
                    catch (Exception error)
                    {
                        logger.LogError("Media cleanup failed with {ErrorType}; analysis claiming will continue", error.GetType().Name);
                    }
                }
                if (await runner.RunOnceAsync(stoppingToken))
                    continue;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError("Worker iteration failed with {ErrorType}; durable leases remain recoverable", error.GetType().Name); }
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(options.Value.PollSeconds), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
