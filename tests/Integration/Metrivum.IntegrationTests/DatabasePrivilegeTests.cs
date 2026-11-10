using System.Net;
using System.Net.Http.Json;
using Metrivum.Access.Infrastructure;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Api.Security;
using Metrivum.Billing.Infrastructure;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Coaching.Infrastructure;
using Metrivum.ExerciseCatalog.Infrastructure;
using Metrivum.Forms.Infrastructure;
using Metrivum.Media.Infrastructure;
using Metrivum.Messaging.Infrastructure;
using Metrivum.Notifications;
using Metrivum.Offers.Infrastructure;
using Metrivum.Training.Infrastructure;
using Metrivum.VideoAnalysis.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Metrivum.IntegrationTests;

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
            await using (
                var bootstrap = databaseAdmin.CreateCommand(
                    await File.ReadAllTextAsync(Path.Combine(root, "infra", "bootstrap-roles.sql"))
                )
            )
                await bootstrap.ExecuteNonQueryAsync();
            connection.Options = "-c role=trainflow_migrator";
            await using var migration = NpgsqlDataSource.Create(connection.ConnectionString);
            await using (
                var notifications = new NotificationsDbContext(
                    Options<NotificationsDbContext>(migration, "notifications")
                )
            )
                await notifications.Database.MigrateAsync();
            await using (
                var accounts = new AccountsDbContext(
                    Options<AccountsDbContext>(migration, "accounts")
                )
            )
                await accounts.Database.MigrateAsync();
            await using (
                var access = new AccessDbContext(Options<AccessDbContext>(migration, "access"))
            )
                await access.Database.MigrateAsync();
            await using (
                var catalog = new ExerciseCatalogDbContext(
                    Options<ExerciseCatalogDbContext>(migration, "exercise_catalog")
                )
            )
                await catalog.Database.MigrateAsync();
            await using (
                var training = new TrainingDbContext(
                    Options<TrainingDbContext>(migration, "training")
                )
            )
                await training.Database.MigrateAsync();
            await using (
                var media = new MediaDbContext(Options<MediaDbContext>(migration, "media"))
            )
                await media.Database.MigrateAsync();
            await using (
                var analysis = new VideoAnalysisDbContext(
                    Options<VideoAnalysisDbContext>(migration, "video_analysis")
                )
            )
                await analysis.Database.MigrateAsync();
            await using (
                var coaching = new CoachingDbContext(
                    Options<CoachingDbContext>(migration, "coaching")
                )
            )
                await coaching.Database.MigrateAsync();
            await using (
                var forms = new FormsDbContext(Options<FormsDbContext>(migration, "forms"))
            )
                await forms.Database.MigrateAsync();
            await using (
                var offers = new OffersDbContext(Options<OffersDbContext>(migration, "offers"))
            )
                await offers.Database.MigrateAsync();
            await using (
                var billing = new BillingDbContext(Options<BillingDbContext>(migration, "billing"))
            )
                await billing.Database.MigrateAsync();
            await using (
                var checkins = new CheckInsDbContext(
                    Options<CheckInsDbContext>(migration, "checkins")
                )
            )
                await checkins.Database.MigrateAsync();
            await using (
                var triggerPolicy = migration.CreateCommand(
                    """
                    SELECT proconfig @> ARRAY['search_path=pg_catalog'] AND NOT prosecdef
                    FROM pg_proc WHERE oid = 'checkins.protect_assignment_source()'::regprocedure
                    """
                )
            )
                Assert.Equal(true, await triggerPolicy.ExecuteScalarAsync());
            await using (
                var messaging = new MessagingDbContext(
                    Options<MessagingDbContext>(migration, "messaging")
                )
            )
                await messaging.Database.MigrateAsync();
            // Runtime grants must restore schema access even when bootstrap grants are missing.
            await using (
                var revoke = migration.CreateCommand(
                    "REVOKE USAGE ON SCHEMA accounts, access, exercise_catalog, training, media, video_analysis FROM trainflow_api; REVOKE USAGE ON SCHEMA media, video_analysis FROM trainflow_worker;"
                )
            )
                await revoke.ExecuteNonQueryAsync();
            await using (
                var grants = migration.CreateCommand(
                    await File.ReadAllTextAsync(Path.Combine(root, "infra", "runtime-grants.sql"))
                )
            )
                await grants.ExecuteNonQueryAsync();
            connection.Options = "-c role=trainflow_api";
            await using var runtime = NpgsqlDataSource.Create(connection.ConnectionString);
            await using (
                var managedFixture = databaseAdmin.CreateCommand(
                    "CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid); REVOKE ALL ON SCHEMA auth FROM PUBLIC;"
                )
            )
                await managedFixture.ExecuteNonQueryAsync();
            await RuntimeDatabaseGuard.ValidateAsync(runtime, default);
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                RuntimeDatabaseGuard.ValidateAsync(databaseAdmin, default)
            );
            using var factory = new ApiFactory(connection.ConnectionString);
            using var client = factory.CreateClient();
            var userId = Guid.NewGuid();
            client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(userId));
            Assert.Equal(
                HttpStatusCode.OK,
                (
                    await client.PutAsJsonAsync(
                        "/api/v1/me/onboarding",
                        new
                        {
                            username = "coach_" + Guid.NewGuid().ToString("N")[..15],
                            displayName = "Coach",
                            birthDate = "1990-01-01",
                            acceptedTerms = true,
                            locale = "en",
                            timeZone = "UTC",
                        }
                    )
                ).StatusCode
            );
            await Denied(runtime, "CREATE TABLE training.forbidden (id int)");
            Assert.Equal(
                HttpStatusCode.OK,
                (await client.PostAsync("/api/v1/me/roles/client", null)).StatusCode
            );
            Assert.Equal(
                HttpStatusCode.OK,
                (await client.PostAsync("/api/v1/me/roles/client", null)).StatusCode
            );
            await Denied(runtime, "ALTER TABLE training.plans ADD COLUMN forbidden int");
            await Denied(runtime, "UPDATE training.revisions SET \"Number\" = 99");
            await Denied(runtime, "UPDATE access.audit SET \"Operation\" = 'tampered'");
            await Denied(
                runtime,
                $"INSERT INTO accounts.user_roles (\"UserId\",\"Role\") VALUES ('{userId}', 'AccessAdmin')"
            );
            await Denied(
                runtime,
                $"INSERT INTO accounts.user_roles (\"UserId\",\"Role\") VALUES ('{userId}', 'ExerciseEditor')"
            );
            await Denied(runtime, "SELECT * FROM accounts.\"__EFMigrationsHistory\"");
            await Denied(runtime, "SELECT * FROM auth.users");
            await Denied(runtime, "CREATE TABLE coaching.forbidden (id int)");
            await Denied(
                runtime,
                "UPDATE coaching.\"StatusChanges\" SET \"InternalReason\" = 'tampered'"
            );
            await Denied(
                runtime,
                "UPDATE coaching.\"Specializations\" SET \"Name\"='tampered' WHERE false"
            );
            await Denied(
                runtime,
                "UPDATE coaching.\"CoachSpecializationChanges\" SET \"Version\"=0 WHERE false"
            );
            await Denied(runtime, "SELECT * FROM coaching.\"__EFMigrationsHistory\"");
            foreach (var schema in new[] { "forms", "offers", "billing", "checkins" })
            {
                await Denied(runtime, $"CREATE TABLE {schema}.forbidden (id int)");
                await Denied(runtime, $"SELECT * FROM {schema}.\"__EFMigrationsHistory\"");
            }
            await Denied(runtime, "UPDATE forms.versions SET \"Number\" = 99");
            await Denied(runtime, "DELETE FROM forms.submissions");
            await Denied(runtime, "UPDATE offers.revisions SET \"Number\" = 99");
            await Denied(runtime, "DELETE FROM offers.revision_billing_options");
            await Denied(runtime, "UPDATE billing.orders SET \"Amount\" = 0");
            await Denied(runtime, "DELETE FROM billing.payments");
            await Denied(runtime, "UPDATE billing.transactions SET \"Amount\" = 0");
            await using (
                var tombstone = runtime.CreateCommand(
                    "UPDATE messaging.\"Messages\" SET \"DeletedAt\"=now(), \"Body\"=NULL, \"ReplyToMessageId\"=NULL WHERE false"
                )
            )
                Assert.Equal(0, await tombstone.ExecuteNonQueryAsync());
            await Denied(runtime, "UPDATE messaging.\"Messages\" SET \"Sequence\"=1 WHERE false");
            await Denied(runtime, "DELETE FROM messaging.\"Messages\" WHERE false");
            await using (
                var team = runtime.CreateCommand(
                    """
                    BEGIN;
                    DO $$ DECLARE team_id uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); price_id uuid:=gen_random_uuid(); BEGIN
                        INSERT INTO billing.plan_prices ("Id","PlanId","Version","Amount","Currency","TermsVersion","CreatedAt")
                        VALUES (price_id,'Team','runtime-'||price_id,20,'USD','runtime',now());
                        INSERT INTO billing.teams ("Id","OwnerId","Name","CreatedAt","Status","Description","Version")
                        VALUES (team_id,owner_id,'Runtime test',now(),'Active','',1);
                        INSERT INTO billing.team_platform_subscriptions ("TeamId","AcceptedPriceId","PurchasedSeats","PeriodStart","PeriodEnd","AutoRenew","Status","Version")
                        VALUES (team_id,price_id,1,now(),now()+interval '1 month',false,'Active',1);
                        INSERT INTO billing.team_memberships ("TeamId","UserId","JoinedAt","Role","Status")
                        VALUES (team_id,owner_id,now(),'Owner','Active');
                        IF NOT EXISTS (SELECT FROM billing.teams WHERE "Id"=team_id) THEN RAISE EXCEPTION 'Runtime Team read failed'; END IF;
                    END $$;
                    SET CONSTRAINTS ALL IMMEDIATE;
                    ROLLBACK;
                    """
                )
            )
                await team.ExecuteNonQueryAsync();
            await Denied(runtime, "UPDATE billing.proration_credits SET \"Amount\"=0 WHERE false");
            await Denied(
                runtime,
                "UPDATE coaching.\"TeamTransferChanges\" SET \"Status\"='Accepted' WHERE false"
            );
            await Denied(runtime, "DELETE FROM billing.teams WHERE false");
            connection.Options = "-c role=trainflow_worker";
            await using var worker = NpgsqlDataSource.Create(connection.ConnectionString);
            await Denied(worker, "SELECT * FROM accounts.profiles");
            await Denied(worker, "SELECT * FROM training.plans");
            await Denied(worker, "SELECT * FROM coaching.\"Relationships\"");
            await Denied(worker, "SELECT * FROM coaching.\"CoachSpecializations\"");
            await Denied(worker, "SELECT * FROM forms.submissions");
            await Denied(worker, "SELECT * FROM billing.payments");
            await Denied(worker, "SELECT * FROM billing.team_platform_subscriptions");
            await Denied(worker, "SELECT \"PaymentMethodId\" FROM billing.platform_subscriptions");
            await Denied(worker, "DELETE FROM access.usage_reservations");
            await using (
                var entitlement = worker.CreateCommand(
                    "SELECT \"OwnerId\", \"PlanId\", \"Status\", \"PeriodStart\", \"PeriodEnd\" FROM billing.platform_subscriptions LIMIT 1"
                )
            )
                await entitlement.ExecuteScalarAsync();
            await using (
                var holds = worker.CreateCommand("SELECT count(*) FROM access.usage_reservations")
            )
                await holds.ExecuteScalarAsync();
            await Denied(worker, "SELECT * FROM coaching.\"TeamClientCases\"");
            await Denied(worker, "SELECT * FROM checkins.\"Requests\"");
            await using var allowed = worker.CreateCommand(
                "SELECT count(*) FROM video_analysis.jobs"
            );
            Assert.Equal(0L, await allowed.ExecuteScalarAsync());
        }
        finally
        {
            // Every datasource above is disposed before dropping this uniquely named test database.
            await using var drop = administrator.CreateCommand($"DROP DATABASE {name}");
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static DbContextOptions<T> Options<T>(NpgsqlDataSource source, string schema)
        where T : DbContext =>
        new DbContextOptionsBuilder<T>()
            .UseNpgsql(source, o => o.MigrationsHistoryTable("__EFMigrationsHistory", schema))
            .Options;

    private static async Task Denied(NpgsqlDataSource source, string sql)
    {
        await using var command = source.CreateCommand(sql);
        var error = await Assert.ThrowsAsync<PostgresException>(async () =>
            await command.ExecuteNonQueryAsync()
        );
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, error.SqlState);
    }

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Metrivum.slnx")))
            directory = directory.Parent;
        return directory?.FullName
            ?? throw new InvalidOperationException("Repository root not found.");
    }
}

public sealed class PrivilegeDatabaseFactAttribute : FactAttribute
{
    public PrivilegeDatabaseFactAttribute()
    {
        if (
            string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"))
        )
            Skip =
                "Set TRAINFLOW_TEST_DATABASE to an isolated PostgreSQL administrator connection for role/migration tests.";
    }
}
