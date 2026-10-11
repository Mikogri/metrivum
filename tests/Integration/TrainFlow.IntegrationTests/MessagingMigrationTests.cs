using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TrainFlow.Messaging.Domain;
using TrainFlow.Messaging.Features;
using TrainFlow.Messaging.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class MessagingMigrationTests
{
    [PrivilegeDatabaseFact]
    public async Task Upgrade_moves_pending_requests_into_history_without_granting_consent()
    {
        var source = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        var name = "trainflow_messaging_test_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(source);
        await using (var create = admin.CreateCommand($"CREATE DATABASE {name}")) await create.ExecuteNonQueryAsync();
        try
        {
            var connection = new NpgsqlConnectionStringBuilder(source) { Database = name };
            await using var db = new MessagingDbContext(new DbContextOptionsBuilder<MessagingDbContext>().UseNpgsql(connection.ConnectionString, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "messaging")).Options);
            await db.GetService<IMigrator>().MigrateAsync("20261008173117_MessagingReadIndexes");
            var pair = MessagingRules.Pair(Guid.NewGuid(), Guid.NewGuid());
            var id = Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO messaging."Requests" ("Id","SenderUserId","RecipientUserId","PairFirst","PairSecond","Body","State","CreatedAt","UpdatedAt")
                VALUES ({id},{pair.First},{pair.Second},{pair.First},{pair.Second},'Legacy hello','Pending',now(),now());
                """);
            await db.Database.MigrateAsync();
            await db.Database.MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            var request = await db.Requests.SingleAsync();
            Assert.Equal(RequestState.Pending, request.State);
            Assert.NotNull(request.ConversationId);
            var intro = await db.Messages.SingleAsync();
            Assert.Equal(intro.Id, request.IntroductionMessageId);
            Assert.Equal("Legacy hello", intro.Body);
            Assert.Equal(request.ConversationId, intro.ConversationId);
            Assert.Equal(2, await db.Members.CountAsync());
            Assert.Empty(await db.Preferences.ToArrayAsync());
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await using var drop = admin.CreateCommand($"DROP DATABASE {name} WITH (FORCE)");
            await drop.ExecuteNonQueryAsync();
        }
    }
}
