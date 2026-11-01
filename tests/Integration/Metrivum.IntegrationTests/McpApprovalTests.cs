using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Domain;
using Metrivum.Integrations.Features;
using Metrivum.Integrations.Infrastructure;
using Metrivum.Messaging.Infrastructure;
using Metrivum.Integrations.Tools;
using Metrivum.Training.Contracts;
using Metrivum.Training.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class McpApprovalTests
{
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;

    [CatalogPostgresFact]
    public async Task Real_tools_enforce_read_only_grants_foreign_program_ownership_and_stale_draft_revision()
    {
        using var factory = new ApiFactory(Database);
        var owner = await User(factory, "Coach");
        var stranger = await User(factory, "Coach");
        await Connect(factory, owner.Id, "read-only-programs", [IntegrationGrants.ReadTraining]);
        await Connect(factory, owner.Id, "program-editor", [IntegrationGrants.ReadTraining, IntegrationGrants.WriteTrainingDrafts]);
        await Connect(factory, stranger.Id, "foreign-programs", [IntegrationGrants.ReadTraining, IntegrationGrants.WriteTrainingDrafts]);
        var input = new McpProgramDraft("Private MCP program", "Original", null, new(1, []));
        var denied = await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, owner.Id, "read-only-programs",
            tools => tools.CreateProgramDraft(input, Guid.NewGuid(), default)));
        Assert.Equal("INTEGRATION_PERMISSION_REQUIRED", denied.Code);
        using (var verify = factory.Services.CreateScope())
            Assert.False(await verify.ServiceProvider.GetRequiredService<TrainingDbContext>().Plans.AnyAsync(x => x.OwnerId == owner.Id));
        var key = Guid.NewGuid();
        var draft = await AsTools(factory, owner.Id, "program-editor", tools => tools.CreateProgramDraft(input, key, default));
        Assert.Equal(draft.Id, (await AsTools(factory, owner.Id, "program-editor", tools => tools.CreateProgramDraft(input, key, default))).Id);
        Assert.Equal(draft.Id, (await AsTools(factory, owner.Id, "read-only-programs", tools => tools.GetProgram(draft.Id, default))).Id);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, stranger.Id, "foreign-programs",
            tools => tools.GetProgram(draft.Id, default)))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, stranger.Id, "foreign-programs",
            tools => tools.ApplyProgramDraftChanges(draft.Id, draft.Revision, input with { Name = "Foreign overwrite" }, Guid.NewGuid(), default)))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, stranger.Id, "foreign-programs",
            tools => tools.ValidateProgram(input.Document, draft.Id)))).Status);
        Assert.Equal("INTEGRATION_PERMISSION_REQUIRED", (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, owner.Id, "read-only-programs",
            tools => tools.ApplyProgramDraftChanges(draft.Id, draft.Revision, input, Guid.NewGuid(), default)))).Code);
        Assert.Equal("VALIDATION_FAILED", (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, owner.Id, "read-only-programs",
            tools => tools.ListPrograms(pageSize: 51)))).Code);
        var changed = await AsTools(factory, owner.Id, "program-editor", tools => tools.ApplyProgramDraftChanges(draft.Id, draft.Revision,
            input with { Description = "Reviewed private draft" }, Guid.NewGuid(), default));
        Assert.Equal(draft.Revision + 1, changed.Revision);
        Assert.Equal("VERSION_CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => AsTools(factory, owner.Id, "program-editor",
            tools => tools.ApplyProgramDraftChanges(draft.Id, draft.Revision, input, Guid.NewGuid(), default)))).Code);
        using (var verify = factory.Services.CreateScope())
            Assert.False(await verify.ServiceProvider.GetRequiredService<TrainingDbContext>().Revisions.AnyAsync(x => x.PlanId == draft.Id));
    }

    [CatalogPostgresFact]
    public async Task Prepare_requires_human_approval_and_send_retry_creates_one_message()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var conversation = await Conversation(coach.Http, client.Id);
        var connection = await Connect(factory, coach.Id, "assistant-a", [IntegrationGrants.PrepareMessages, IntegrationGrants.SendApprovedMessages]);
        var key = Guid.NewGuid();
        var prepared = await As(factory, coach.Id, "assistant-a", service => service.PrepareMessageAsync(conversation, "Exact reviewed text", key, default));
        Assert.Equal("Pending", prepared.Status);
        Assert.Equal(client.Id, Assert.Single(prepared.Recipients).UserId);
        Assert.Equal(prepared.Id, (await As(factory, coach.Id, "assistant-a", service => service.PrepareMessageAsync(conversation, "Exact reviewed text", key, default))).Id);
        using (var scope = factory.Services.CreateScope())
            Assert.False(await scope.ServiceProvider.GetRequiredService<MessagingDbContext>().Messages.AnyAsync(x => x.ConversationId == conversation));
        var denied = await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "assistant-a", service => service.SendApprovedMessageAsync(prepared.Id, default)));
        Assert.Equal("APPROVAL_REQUIRED", denied.Code);
        Assert.Equal("HUMAN_SESSION_REQUIRED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "assistant-a",
            service => service.DecideActionAsync(prepared.Id, new(prepared.Version), true, default)))).Code);
        await Assert.ThrowsAsync<ApiException>(() => As(factory, client.Id, null, service => service.DecideActionAsync(prepared.Id, new(prepared.Version), true, default)));
        var stranger = await User(factory, "Coach");
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => As(factory, stranger.Id, null, service => service.ActionAsync(prepared.Id, default)))).Status);
        var approved = await As(factory, coach.Id, null, service => service.DecideActionAsync(prepared.Id, new(prepared.Version), true, default));
        Assert.Equal("Approved", approved.Status);
        var sends = await Task.WhenAll(As(factory, coach.Id, "assistant-a", service => service.SendApprovedMessageAsync(prepared.Id, default)),
            As(factory, coach.Id, "assistant-a", service => service.SendApprovedMessageAsync(prepared.Id, default)));
        Assert.Equal(sends[0].MessageId, sends[1].MessageId);
        using (var scope = factory.Services.CreateScope())
        {
            var messages = await scope.ServiceProvider.GetRequiredService<MessagingDbContext>().Messages.Where(x => x.ConversationId == conversation).ToArrayAsync();
            Assert.Equal("Exact reviewed text", Assert.Single(messages).Body);
            Assert.Equal(coach.Id, messages[0].SenderUserId);
        }
        Assert.Equal(connection.Id, prepared.ConnectionId);
    }

    [CatalogPostgresFact]
    public async Task Clients_foreign_client_identity_and_read_only_grants_cannot_write_or_approve()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var client = await User(factory, "Client");
        var conversation = await Conversation(coach.Http, client.Id);
        await Connect(factory, coach.Id, "read-only", [IntegrationGrants.ReadMessages]);
        await Connect(factory, client.Id, "client-app", IntegrationGrants.All);
        var denied = await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "read-only", service => service.PrepareMessageAsync(conversation, "No grant", Guid.NewGuid(), default)));
        Assert.Equal("INTEGRATION_PERMISSION_REQUIRED", denied.Code);
        denied = await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "different-app", service => service.PrepareMessageAsync(conversation, "Wrong client", Guid.NewGuid(), default)));
        Assert.Equal("INTEGRATION_PERMISSION_REQUIRED", denied.Code);
        await Assert.ThrowsAsync<ApiException>(() => As(factory, client.Id, "client-app", service => service.PrepareMessageAsync(conversation, "Client cannot act as coach", Guid.NewGuid(), default)));
        Assert.Equal("HUMAN_SESSION_REQUIRED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "read-only", service => service.ConnectionsAsync(default)))).Code);
    }

    [CatalogPostgresFact]
    public async Task Changed_membership_block_and_revocation_make_approved_actions_fail_safely()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var recipient = await User(factory, "Client");
        var conversation = await Conversation(coach.Http, recipient.Id);
        var connection = await Connect(factory, coach.Id, "approved-app", [IntegrationGrants.PrepareMessages, IntegrationGrants.SendApprovedMessages]);
        var action = await As(factory, coach.Id, "approved-app", service => service.PrepareMessageAsync(conversation, "Reviewed before block", Guid.NewGuid(), default));
        await As(factory, coach.Id, null, service => service.DecideActionAsync(action.Id, new(action.Version), true, default));
        Assert.Equal(HttpStatusCode.NoContent, (await recipient.Http.PostAsync("/api/v1/me/blocked-users/" + coach.Id, null)).StatusCode);
        Assert.Equal("USER_BLOCKED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "approved-app", service => service.SendApprovedMessageAsync(action.Id, default)))).Code);
        await recipient.Http.DeleteAsync("/api/v1/me/blocked-users/" + coach.Id);
        await As(factory, coach.Id, null, service => service.RevokeAsync(connection.Id, default));
        Assert.Equal("INTEGRATION_PERMISSION_REQUIRED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "approved-app", service => service.SendApprovedMessageAsync(action.Id, default)))).Code);
        using var scope = factory.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<MessagingDbContext>().Messages.AnyAsync(x => x.ConversationId == conversation));
    }

    [CatalogPostgresFact]
    public async Task Group_recipient_changes_after_prepare_cannot_be_silently_approved()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var recipient = await User(factory, "Client");
        var another = await User(factory, "Client");
        var conversation = (await Ok(coach.Http.PostAsJsonAsync("/api/v1/messaging/conversations/group", new { title = "Frozen group", userIds = new[] { recipient.Id } }))).GetProperty("id").GetGuid();
        await Connect(factory, coach.Id, "group-app", [IntegrationGrants.PrepareMessages, IntegrationGrants.SendApprovedMessages]);
        var action = await As(factory, coach.Id, "group-app", service => service.PrepareMessageAsync(conversation, "One recipient", Guid.NewGuid(), default));
        Assert.Equal(HttpStatusCode.NoContent, (await coach.Http.PostAsJsonAsync($"/api/v1/messaging/conversations/{conversation}/members", new { userId = another.Id })).StatusCode);
        Assert.Equal("STALE_REVISION", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, null, service => service.DecideActionAsync(action.Id, new(action.Version), true, default)))).Code);
    }

    [CatalogPostgresFact]
    public async Task Grant_changes_expiration_and_old_issued_tokens_cannot_execute_frozen_actions()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        var recipient = await User(factory, "Client");
        var conversation = await Conversation(coach.Http, recipient.Id);
        var connection = await Connect(factory, coach.Id, "revision-app", [IntegrationGrants.PrepareMessages, IntegrationGrants.SendApprovedMessages]);
        var action = await As(factory, coach.Id, "revision-app", service => service.PrepareMessageAsync(conversation, "Frozen revision", Guid.NewGuid(), default));
        await As(factory, coach.Id, null, service => service.UpdateGrantsAsync(connection.Id, new([IntegrationGrants.PrepareMessages, IntegrationGrants.SendApprovedMessages], connection.Version), default));
        Assert.Equal("INTEGRATION_REVOKED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, null,
            service => service.DecideActionAsync(action.Id, new(action.Version), true, default)))).Code);
        action = await As(factory, coach.Id, "revision-app", service => service.PrepareMessageAsync(conversation, "Expired review", Guid.NewGuid(), default));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>();
            await db.PendingActions.Where(x => x.Id == action.Id).ExecuteUpdateAsync(set => set
                .SetProperty(x => x.CreatedAt, DateTimeOffset.UtcNow.AddHours(-2)).SetProperty(x => x.ExpiresAt, DateTimeOffset.UtcNow.AddHours(-1)));
        }
        Assert.Equal("ACTION_EXPIRED", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, null,
            service => service.DecideActionAsync(action.Id, new(action.Version), true, default)))).Code);
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>().Connections.Where(x => x.Id == connection.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.TokenNotBefore, DateTimeOffset.UtcNow.AddHours(1)));
        Assert.Equal("INTEGRATION_TOKEN_STALE", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "revision-app",
            service => service.PrepareMessageAsync(conversation, "Old issued token", Guid.NewGuid(), default)))).Code);
    }

    [CatalogPostgresFact]
    public async Task Durable_command_receipts_deduplicate_parallel_retries_and_rollback_partial_work()
    {
        using var factory = new ApiFactory(Database);
        var coach = await User(factory, "Coach");
        await Connect(factory, coach.Id, "draft-app", [IntegrationGrants.WriteTrainingDrafts]);
        var key = Guid.NewGuid();
        var calls = 0;
        Task<Guid> Run() => As(factory, coach.Id, "draft-app", service => service.ExecuteCommandAsync("create_program_draft", key, new { title = "Frozen draft" },
            token => { Interlocked.Increment(ref calls); return Task.FromResult(Guid.NewGuid()); }, default));
        var results = await Task.WhenAll(Run(), Run());
        Assert.Equal(results[0], results[1]);
        Assert.Equal(1, calls);
        Assert.Equal("CONFLICT", (await Assert.ThrowsAsync<ApiException>(() => As(factory, coach.Id, "draft-app", service => service.ExecuteCommandAsync("create_program_draft", key,
            new { title = "Different draft" }, token => Task.FromResult(Guid.NewGuid()), default)))).Code);
        var failedKey = Guid.NewGuid();
        await Assert.ThrowsAsync<InvalidOperationException>(() => As(factory, coach.Id, "draft-app", service => service.ExecuteCommandAsync<Guid>("create_program_draft", failedKey,
            new { title = "Fail" }, token => throw new InvalidOperationException("Simulated mutation failure"), default)));
        using var scope = factory.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>().CommandReceipts.AnyAsync(x => x.IdempotencyKey == failedKey));
    }

    private static async Task<T> As<T>(ApiFactory factory, Guid user, string? clientId, Func<IntegrationService, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        var context = new DefaultHttpContext();
        var claims = new List<Claim> { new("sub", user.ToString()), new("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString()), new("session_id", Guid.NewGuid().ToString()) };
        if (clientId != null) claims.Add(new("client_id", clientId));
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestBearer"));
        scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
        return await action(scope.ServiceProvider.GetRequiredService<IntegrationService>());
    }
    private static async Task<T> AsTools<T>(ApiFactory factory, Guid user, string clientId, Func<MetrivumTools, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        var context = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("sub", user.ToString()), new Claim("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()), new Claim("client_id", clientId)], "TestBearer")) };
        scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
        return await action(ActivatorUtilities.CreateInstance<MetrivumTools>(scope.ServiceProvider));
    }
    private static async Task<IntegrationConnection> Connect(ApiFactory factory, Guid user, string clientId, string[] grants)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IntegrationsDbContext>();
        var row = new IntegrationConnection { UserId = user, ClientId = clientId, ClientName = "Fixture " + clientId, Grants = grants, CreatedAt = DateTimeOffset.UtcNow };
        db.Connections.Add(row);
        await db.SaveChangesAsync();
        return row;
    }
    private static async Task<(Guid Id, HttpClient Http)> User(ApiFactory factory, string role)
    {
        var id = Guid.NewGuid();
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(id));
        await Ok(http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = $"i{id:N}"[..30], displayName = "Integration " + role, birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role }));
        if (role == "Coach")
            await TestPlans.ActivateProAsync(http);
        return (id, http);
    }
    private static async Task<Guid> Conversation(HttpClient http, Guid recipient) =>
        (await Ok(http.PostAsJsonAsync("/api/v1/messaging/conversations/direct", new { userId = recipient }))).GetProperty("id").GetGuid();
    private static async Task<JsonElement> Ok(Task<HttpResponseMessage> request)
    {
        using var response = await request;
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
