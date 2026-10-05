using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.Api.Security;
using TrainFlow.ExerciseCatalog.Infrastructure;
using TrainFlow.Media.Infrastructure;
using TrainFlow.Training.Infrastructure;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class DatabasePrivilegeTests
{
    [PrivilegeDatabaseFact]
    public async Task Clean_migrations_run_as_migrator_and_runtime_cannot_change_schema_roles_or_revisions()
    {
        var source = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var name = "trainflow_privileges_" + Guid.NewGuid().ToString("N");
        await using var administrator = NpgsqlDataSource.Create(source);
        await using (var create = administrator.CreateCommand($"CREATE DATABASE {name}"))
            await create.ExecuteNonQueryAsync();
        var connection = new NpgsqlConnectionStringBuilder(source) { Database = name };
        try
        {
            await using var databaseAdmin = NpgsqlDataSource.Create(connection.ConnectionString);
            var root = FindRoot();
            await using (var bootstrap = databaseAdmin.CreateCommand(await File.ReadAllTextAsync(Path.Combine(root, "infra", "bootstrap-roles.sql"))))
                await bootstrap.ExecuteNonQueryAsync();
            connection.Options = "-c role=trainflow_migrator";
            await using var migration = NpgsqlDataSource.Create(connection.ConnectionString);
            await using (var accounts = new AccountsDbContext(Options<AccountsDbContext>(migration, "accounts")))
                await accounts.Database.MigrateAsync();
            await using (var access = new AccessDbContext(Options<AccessDbContext>(migration, "access")))
                await access.Database.MigrateAsync();
            await using (var catalog = new ExerciseCatalogDbContext(Options<ExerciseCatalogDbContext>(migration, "exercise_catalog")))
                await catalog.Database.MigrateAsync();
            await using (var training = new TrainingDbContext(Options<TrainingDbContext>(migration, "training")))
                await training.Database.MigrateAsync();
            await using (var media = new MediaDbContext(Options<MediaDbContext>(migration, "media")))
                await media.Database.MigrateAsync();
            await using (var analysis = new VideoAnalysisDbContext(Options<VideoAnalysisDbContext>(migration, "video_analysis")))
                await analysis.Database.MigrateAsync();
            // Runtime grants must restore schema access even when bootstrap grants are missing.
            await using (var revoke = migration.CreateCommand("REVOKE USAGE ON SCHEMA accounts, access, exercise_catalog, training, media, video_analysis FROM trainflow_api; REVOKE USAGE ON SCHEMA media, video_analysis FROM trainflow_worker;"))
                await revoke.ExecuteNonQueryAsync();
            await using (var grants = migration.CreateCommand(await File.ReadAllTextAsync(Path.Combine(root, "infra", "runtime-grants.sql"))))
                await grants.ExecuteNonQueryAsync();
            connection.Options = "-c role=trainflow_api";
            await using var runtime = NpgsqlDataSource.Create(connection.ConnectionString);
            await using (var managedFixture = databaseAdmin.CreateCommand("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid); REVOKE ALL ON SCHEMA auth FROM PUBLIC;"))
                await managedFixture.ExecuteNonQueryAsync();
            await RuntimeDatabaseGuard.ValidateAsync(runtime, default);
            await Assert.ThrowsAsync<InvalidOperationException>(() => RuntimeDatabaseGuard.ValidateAsync(databaseAdmin, default));
            using var factory = new ApiFactory(connection.ConnectionString);
            using var client = factory.CreateClient();
            var userId = Guid.NewGuid();
            client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(userId));
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/v1/me/onboarding", new
            {
                username = "coach_" + Guid.NewGuid().ToString("N")[..15],
                displayName = "Coach",
                birthDate = "1990-01-01",
                acceptedTerms = true,
                locale = "en",
                timeZone = "UTC"
            })).StatusCode);
            await Denied(runtime, "CREATE TABLE training.forbidden (id int)");
            await Denied(runtime, "ALTER TABLE training.plans ADD COLUMN forbidden int");
            await Denied(runtime, "UPDATE training.revisions SET \"Number\" = 99");
            await Denied(runtime, "UPDATE access.audit SET \"Operation\" = 'tampered'");
            await Denied(runtime, $"INSERT INTO accounts.user_roles (\"UserId\",\"Role\") VALUES ('{userId}', 'AccessAdmin')");
            await Denied(runtime, "SELECT * FROM accounts.\"__EFMigrationsHistory\"");
            await Denied(runtime, "SELECT * FROM auth.users");
            connection.Options = "-c role=trainflow_worker";
            await using var worker = NpgsqlDataSource.Create(connection.ConnectionString);
            await Denied(worker, "SELECT * FROM accounts.profiles");
            await Denied(worker, "SELECT * FROM training.plans");
            await using var allowed = worker.CreateCommand("SELECT count(*) FROM video_analysis.jobs");
            Assert.Equal(0L, await allowed.ExecuteScalarAsync());
        }
        finally
        {
            // Every datasource above is disposed before dropping this uniquely named test database.
            await using var drop = administrator.CreateCommand($"DROP DATABASE {name} WITH (FORCE)");
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static DbContextOptions<T> Options<T>(NpgsqlDataSource source, string schema) where T : DbContext =>
        new DbContextOptionsBuilder<T>().UseNpgsql(source, o => o.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options;

    private static async Task Denied(NpgsqlDataSource source, string sql)
    {
        await using var command = source.CreateCommand(sql);
        var error = await Assert.ThrowsAsync<PostgresException>(async () => await command.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, error.SqlState);
    }

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "TrainFlow.slnx")))
            directory = directory.Parent;
        return directory?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }
}

public sealed class PrivilegeDatabaseFactAttribute : FactAttribute
{
    public PrivilegeDatabaseFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")))
            Skip = "Set TRAINFLOW_TEST_DATABASE to an isolated PostgreSQL administrator connection for role/migration tests.";
    }
}
