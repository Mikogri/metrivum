using System.Net.Http.Json;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Training.Delivery;
using Metrivum.Training.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed partial class McpApprovalTests
{
    [CatalogPostgresTheory]
    [InlineData("account")]
    [InlineData("role")]
    [InlineData("integrations.mcp.assign-programs")]
    [InlineData("training.assignments.manage")]
    public async Task Authorization_changed_while_waiting_for_execution_lock_cannot_assign(
        string change
    )
    {
        using var factory = new ApiFactory(Database);
        var fixture = await AssignmentFixture(factory);
        var action = await AsTools(
            factory,
            fixture.Coach,
            "assignment-ai",
            t => t.PrepareProgramAssignment(fixture.Request, Guid.NewGuid(), default)
        );
        await As(
            factory,
            fixture.Coach,
            null,
            s => s.DecideActionAsync(action.Id, new(action.Version), true, default)
        );
        await using var blocker = new NpgsqlConnection(Database);
        await blocker.OpenAsync();
        await using var block = await blocker.BeginTransactionAsync();
        await using (
            var acquire = new NpgsqlCommand(
                "SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))",
                blocker,
                block
            )
        )
        {
            acquire.Parameters.AddWithValue(
                "key",
                "integration:" + fixture.Coach + ":assignment-ai"
            );
            await acquire.ExecuteNonQueryAsync();
        }
        var execution = AsTools(
            factory,
            fixture.Coach,
            "assignment-ai",
            t => t.AssignApprovedProgram(action.Id, default)
        );
        try
        {
            await using var control = new NpgsqlConnection(Database);
            await control.OpenAsync();
            await WaitFor(async () =>
            {
                await using var waiters = new NpgsqlCommand(
                    "SELECT EXISTS (SELECT FROM pg_locks waiting JOIN pg_locks held USING (locktype, classid, objid, objsubid) WHERE held.pid=@pid AND held.granted AND NOT waiting.granted)",
                    control
                );
                waiters.Parameters.AddWithValue("pid", blocker.ProcessID);
                return (bool)(await waiters.ExecuteScalarAsync())!;
            });
            using var scope = factory.Services.CreateScope();
            var accounts = scope.ServiceProvider.GetRequiredService<AccountsDbContext>();
            if (change == "role")
                await accounts
                    .Roles.Where(x => x.UserId == fixture.Coach && x.Role == "Coach")
                    .ExecuteDeleteAsync();
            else if (change == "account")
                await accounts
                    .Profiles.Where(x => x.Id == fixture.Coach)
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.Active, false));
            else
            {
                var admin = await User(factory, "Coach");
                accounts.Roles.Add(new UserRole { UserId = admin.Id, Role = "AccessAdmin" });
                await accounts.SaveChangesAsync();
                await Ok(
                    admin.Http.PutAsJsonAsync(
                        $"/api/v1/admin/access/users/{fixture.Coach}/features/{change}",
                        new { expectedVersion = 0, granted = false }
                    )
                );
            }
        }
        finally
        {
            await block.RollbackAsync();
        }
        var expected = change switch
        {
            "role" => "ONBOARDING_REQUIRED",
            "account" => "ACCOUNT_DISABLED",
            _ => "FEATURE_UNAVAILABLE",
        };
        Assert.Equal(expected, (await Assert.ThrowsAsync<ApiException>(() => execution)).Code);
        using var verify = factory.Services.CreateScope();
        Assert.False(
            await verify
                .ServiceProvider.GetRequiredService<TrainingDbContext>()
                .Set<ProgramAssignment>()
                .AnyAsync(x => x.RelationshipId == fixture.Request.RelationshipId)
        );
    }

    [CatalogPostgresFact]
    public async Task Relationship_suspension_cannot_commit_between_assignment_authorization_and_insert()
    {
        using var factory = new ApiFactory(Database);
        var fixture = await AssignmentFixture(factory);
        var action = await AsTools(
            factory,
            fixture.Coach,
            "assignment-ai",
            t => t.PrepareProgramAssignment(fixture.Request, Guid.NewGuid(), default)
        );
        await As(
            factory,
            fixture.Coach,
            null,
            s => s.DecideActionAsync(action.Id, new(action.Version), true, default)
        );
        var relationship = await Ok(
            fixture.Http.GetAsync(
                $"/api/v1/coaching/relationships/{fixture.Request.RelationshipId}"
            )
        );
        var name = "redteam_assignment_" + Guid.NewGuid().ToString("N");
        var lockId = Random.Shared.Next(1, int.MaxValue);
        await using var control = new NpgsqlConnection(Database);
        await control.OpenAsync();
        // A real PostgreSQL trigger pauses the actual insert after all application authorization reads.
        // It affects only this fixture and is removed even when the regression assertion fails.
        await using (
            var setup = new NpgsqlCommand(
                $$"""
                CREATE FUNCTION training.{{name}}() RETURNS trigger LANGUAGE plpgsql AS $body$
                BEGIN
                    IF NEW."RelationshipId" = '{{fixture.Request.RelationshipId}}'::uuid THEN
                        PERFORM pg_advisory_xact_lock(742131, {{lockId}});
                    END IF;
                    RETURN NEW;
                END $body$;
                CREATE TRIGGER {{name}} BEFORE INSERT ON training.assignments
                    FOR EACH ROW EXECUTE FUNCTION training.{{name}}();
                """,
                control
            )
        )
            await setup.ExecuteNonQueryAsync();
        await using var blocker = new NpgsqlConnection(Database);
        await blocker.OpenAsync();
        await using var block = await blocker.BeginTransactionAsync();
        await using (
            var acquire = new NpgsqlCommand(
                $"SELECT pg_advisory_xact_lock(742131, {lockId})",
                blocker,
                block
            )
        )
            await acquire.ExecuteNonQueryAsync();
        Task? suspension = null;
        var execution = AsTools(
            factory,
            fixture.Coach,
            "assignment-ai",
            t => t.AssignApprovedProgram(action.Id, default)
        );
        try
        {
            var assignmentPid = 0;
            await WaitFor(async () =>
            {
                await using var waiters = new NpgsqlCommand(
                    $"SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=742131 AND objid={lockId} AND NOT granted LIMIT 1",
                    control
                );
                assignmentPid = (int?)await waiters.ExecuteScalarAsync() ?? 0;
                return assignmentPid != 0;
            });
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"/api/v1/coaching/relationships/{fixture.Request.RelationshipId}/suspend"
            )
            {
                Content = JsonContent.Create(
                    new { internalReason = "Concurrent suspension at assignment insert" }
                ),
            };
            request.Headers.TryAddWithoutValidation(
                "If-Match",
                $"\"{relationship.GetProperty("version").GetInt64()}\""
            );
            suspension = Ok(fixture.Http.SendAsync(request));
            await WaitFor(async () =>
            {
                if (suspension.IsCompleted)
                    return true;
                await using var waiting = new NpgsqlCommand(
                    "SELECT EXISTS (SELECT FROM pg_stat_activity WHERE datname=current_database() AND @pid=ANY(pg_blocking_pids(pid)) AND query LIKE '%UPDATE coaching.%')",
                    control
                );
                waiting.Parameters.AddWithValue("pid", assignmentPid);
                return (bool)(await waiting.ExecuteScalarAsync())!;
            });
            Assert.False(
                suspension.IsCompleted,
                "Suspension committed while a previously authorized assignment insert was still blocked."
            );
        }
        finally
        {
            await block.RollbackAsync();
            try
            {
                await execution.WaitAsync(TimeSpan.FromSeconds(20));
                if (suspension is not null)
                    await suspension.WaitAsync(TimeSpan.FromSeconds(20));
            }
            finally
            {
                await using var cleanup = new NpgsqlCommand(
                    $"DROP TRIGGER IF EXISTS {name} ON training.assignments; DROP FUNCTION IF EXISTS training.{name}()",
                    control
                );
                await cleanup.ExecuteNonQueryAsync();
            }
        }
        using var scope = factory.Services.CreateScope();
        Assert.Single(
            await scope
                .ServiceProvider.GetRequiredService<TrainingDbContext>()
                .Set<ProgramAssignment>()
                .Where(x => x.RelationshipId == fixture.Request.RelationshipId)
                .ToArrayAsync()
        );
        Assert.Equal(
            RelationshipStatus.Suspended,
            (
                await scope
                    .ServiceProvider.GetRequiredService<CoachingDbContext>()
                    .Relationships.SingleAsync(x => x.Id == fixture.Request.RelationshipId)
            ).Status
        );
    }

    private static async Task WaitFor(Func<Task<bool>> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (!await condition())
            await Task.Delay(25, timeout.Token);
    }
}
