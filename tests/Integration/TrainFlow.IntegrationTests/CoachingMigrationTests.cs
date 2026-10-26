using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class CoachingMigrationTests
{
    [PrivilegeDatabaseFact]
    public async Task Upgrade_preserves_legacy_coach_workspace_plan_grants_and_history()
    {
        var source = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var name = "trainflow_upgrade_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(source);
        await using (var create = admin.CreateCommand($"CREATE DATABASE {name}"))
            await create.ExecuteNonQueryAsync();
        try
        {
            var connection = new NpgsqlConnectionStringBuilder(source) { Database = name };
            await using var dbAdmin = NpgsqlDataSource.Create(connection.ConnectionString);
            var root = new DirectoryInfo(AppContext.BaseDirectory);
            while (root != null && !File.Exists(Path.Combine(root.FullName, "TrainFlow.slnx")))
                root = root.Parent;
            await using (var bootstrap = dbAdmin.CreateCommand(await File.ReadAllTextAsync(Path.Combine(root!.FullName, "infra/bootstrap-roles.sql"))))
                await bootstrap.ExecuteNonQueryAsync();
            connection.Options = "-c role=trainflow_migrator";
            await using var migration = NpgsqlDataSource.Create(connection.ConnectionString);
            await using var accounts = new AccountsDbContext(Options<AccountsDbContext>(migration, "accounts"));
            await using var access = new AccessDbContext(Options<AccessDbContext>(migration, "access"));
            await using var training = new TrainingDbContext(Options<TrainingDbContext>(migration, "training"));
            await accounts.GetService<IMigrator>().MigrateAsync("20261005125329_GuardRuntimeRoleAssignment");
            await access.GetService<IMigrator>().MigrateAsync("20261005125044_InitialAccess");
            await training.Database.MigrateAsync();
            var user = Guid.NewGuid();
            var workspace = Guid.NewGuid();
            var plan = Guid.NewGuid();
            await accounts.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO accounts.profiles ("Id","DisplayName","Locale","TimeZone","Onboarded","Active","Version")
                VALUES ({user},'Legacy Coach','en','UTC',true,true,7);
                INSERT INTO accounts.workspaces ("Id","OwnerId") VALUES ({workspace},{user});
                INSERT INTO accounts.user_roles ("UserId","Role") VALUES ({user},'Coach');
                INSERT INTO training.plans ("Id","OwnerId","WorkspaceId","Name","Description","Kind","Archived","Version","CreatedAt","UpdatedAt","Draft")
                VALUES ({plan},{user},{workspace},'Legacy Plan','','Program',false,3,now(),now(),jsonb_build_object('schemaVersion',1,'blocks',jsonb_build_array()));
                INSERT INTO access.configurations ("Id","Version","GrantedFeatures") VALUES ('v1-default',5,ARRAY['training.programs.read']);
                GRANT SELECT, INSERT, UPDATE ON accounts.profiles TO trainflow_api;
                """);
            await accounts.Database.MigrateAsync();
            await access.Database.MigrateAsync();
            await using var coaching = new CoachingDbContext(Options<CoachingDbContext>(migration, "coaching"));
            await coaching.Database.MigrateAsync();
            var profile = await accounts.Profiles.SingleAsync(x => x.Id == user);
            Assert.Equal("Legacy Coach", profile.DisplayName);
            Assert.Equal(7, profile.Version);
            Assert.Null(profile.Phone);
            Assert.False(profile.PhoneVisibleToCoach);
            Assert.Equal(workspace, (await accounts.Workspaces.SingleAsync(x => x.OwnerId == user)).Id);
            Assert.Equal("Coach", (await accounts.Roles.SingleAsync(x => x.UserId == user)).Role);
            Assert.Equal("Legacy Plan", (await training.Plans.SingleAsync(x => x.Id == plan)).Name);
            var config = await access.Configurations.SingleAsync(x => x.Id == "v1-default");
            Assert.Equal(13, config.Version);
            Assert.Equal(60, config.GrantedFeatures.Length);
            Assert.Contains("video.analysis.local", config.GrantedFeatures);
            Assert.Contains("organization.workspace.manage", config.GrantedFeatures);
            Assert.Contains("integrations.mcp.connect", config.GrantedFeatures);
            Assert.Contains("integrations.mcp.send-approved-message", config.GrantedFeatures);
            Assert.Contains("analytics.view", config.GrantedFeatures);
            Assert.Contains("training.programs.read", config.GrantedFeatures);
            Assert.Contains("coaching.relationships.read-own", config.GrantedFeatures);
            Assert.Contains("billing.pay-own", config.GrantedFeatures);
            Assert.Contains("checkins.respond-own", config.GrantedFeatures);
            Assert.Contains("messaging.direct", config.GrantedFeatures);
            Assert.Contains("messaging.voice", config.GrantedFeatures);
            Assert.Contains("training.generator.use", config.GrantedFeatures);
            Assert.Contains("training.assignments.manage", config.GrantedFeatures);
            Assert.Contains("training.executions.log-own", config.GrantedFeatures);
            Assert.Contains("training.executions.review", config.GrantedFeatures);
            Assert.Contains("training.progress.view-own", config.GrantedFeatures);
            Assert.Contains("training.progress.view-clients", config.GrantedFeatures);
            Assert.Contains("coaching.documentation.manage", config.GrantedFeatures);
            Assert.Contains("coaching.documentation.view-shared", config.GrantedFeatures);
            Assert.Contains("20261005125329_GuardRuntimeRoleAssignment", await accounts.Database.GetAppliedMigrationsAsync());
            Assert.Contains("20261006210202_ClientAccounts", await accounts.Database.GetAppliedMigrationsAsync());
            await using var grant = dbAdmin.CreateCommand("SELECT has_table_privilege('trainflow_api','accounts.profiles','SELECT,INSERT,UPDATE')");
            Assert.Equal(true, await grant.ExecuteScalarAsync());
            Assert.Empty(await coaching.Relationships.ToArrayAsync());
        }
        finally
        {
            await using var drop = admin.CreateCommand($"DROP DATABASE {name}");
            await drop.ExecuteNonQueryAsync();
        }
    }
    private static DbContextOptions<T> Options<T>(NpgsqlDataSource source, string schema) where T : DbContext =>
        new DbContextOptionsBuilder<T>().UseNpgsql(source, x => x.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options;
}
