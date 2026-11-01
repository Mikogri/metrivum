using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Domain;
using Metrivum.Integrations.Infrastructure;
using Metrivum.Messaging.Contracts;

namespace Metrivum.Integrations.Features;

public sealed class IntegrationService(IntegrationsDbContext db, IAccountContext accounts, IFeatureAccessService features,
    IntegrationAccess access, ModuleTransaction tx, IMcpMessageOperations messaging, SupabaseOAuthConsent oauth,
    TimeProvider clock, IHttpContextAccessor http, IConfiguration configuration)
{
    public async Task<ConnectionDto[]> ConnectionsAsync(CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        return (await db.Connections.AsNoTracking().Where(x => x.UserId == accounts.UserId).OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync(ct)).Select(ConnectionDto).ToArray();
    }
    public async Task<ConnectionDto> ConnectionAsync(Guid id, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        return ConnectionDto(await OwnConnection(id, ct));
    }
    public async Task<ConnectionDto> UpdateGrantsAsync(Guid id, GrantUpdate request, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        var grants = IntegrationGrants.Validate(request.Grants);
        foreach (var grant in grants) await features.RequireAsync(IntegrationGrants.Feature(grant), ct);
        return await tx.RunAsync(async token =>
        {
            var connection = await LockedOwnConnection(id, token);
            Version(connection.Version, request.ExpectedVersion);
            if (connection.RevokedAt != null) throw ApiException.Conflict("Reconnect through OAuth to grant permissions again.");
            connection.Grants = grants;
            connection.Version++;
            await db.SaveChangesAsync(token);
            return ConnectionDto(connection);
        }, ct);
    }
    public async Task<ConnectionDto> RevokeAsync(Guid id, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        var result = await tx.RunAsync(async token =>
        {
            var connection = await LockedOwnConnection(id, token);
            if (connection.RevokedAt == null)
            {
                connection.RevokedAt = clock.GetUtcNow();
                connection.Grants = [];
                connection.Version++;
                await db.SaveChangesAsync(token);
            }
            return ConnectionDto(connection);
        }, ct);
        await oauth.TryRevokeAsync(result.ClientId, ct);
        return result;
    }
    public async Task<ConsentDetails> ConsentAsync(string authorizationId, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        return await oauth.DetailsAsync(authorizationId, ct);
    }
    public async Task<ConsentResult> AcceptConsentAsync(string authorizationId, ConsentRequest request, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        var grants = IntegrationGrants.Validate(request.Grants);
        if (grants.Length == 0) throw ApiException.Invalid("Select at least one Metrivum permission, or deny this request.");
        foreach (var grant in grants) await features.RequireAsync(IntegrationGrants.Feature(grant), ct);
        var details = await oauth.DetailsAsync(authorizationId, ct);
        return await tx.RunAsync(async token =>
        {
            await access.LockAsync(accounts.UserId, details.ClientId, token);
            var connection = await db.Connections.SingleOrDefaultAsync(x => x.UserId == accounts.UserId && x.ClientId == details.ClientId, token);
            if (connection == null)
                db.Connections.Add(connection = new() { UserId = accounts.UserId, ClientId = details.ClientId, CreatedAt = clock.GetUtcNow() });
            connection.ClientName = details.ClientName;
            connection.AuthorizationId = authorizationId;
            connection.Grants = grants;
            connection.RevokedAt = null;
            connection.TokenNotBefore = DateTimeOffset.FromUnixTimeSeconds(clock.GetUtcNow().ToUnixTimeSeconds());
            connection.Version++;
            // Uncommitted consent cannot authorize MCP; a failed provider approval rolls back the grant.
            await db.SaveChangesAsync(token);
            var redirect = await oauth.DecideAsync(authorizationId, "approve", details.RedirectUri, token);
            return new ConsentResult(redirect, ConnectionDto(connection));
        }, ct);
    }
    public async Task<RedirectResult> DenyConsentAsync(string authorizationId, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        var details = await oauth.DetailsAsync(authorizationId, ct);
        return new(await oauth.DecideAsync(authorizationId, "deny", details.RedirectUri, ct));
    }

    public async Task<PendingActionDto> PrepareMessageAsync(Guid conversationId, string body, Guid idempotencyKey, CancellationToken ct)
    {
        if (idempotencyKey == Guid.Empty) throw ApiException.Invalid("A UUID idempotency key is required.");
        Text(body, 8000, true);
        return await tx.RunAsync(async token =>
        {
            await access.LockAsync(accounts.UserId, access.ClientId, token);
            var connection = await access.RequireAsync(IntegrationGrants.PrepareMessages, token);
            var existing = await db.PendingActions.SingleOrDefaultAsync(x => x.ConnectionId == connection.Id && x.IdempotencyKey == idempotencyKey, token);
            if (existing != null)
            {
                var prior = Payload(existing);
                if (prior.ConversationId != conversationId || prior.Body != body) throw ApiException.Conflict("Idempotency key was used for different message content.");
                return ActionDto(existing, connection.ClientName);
            }
            var preview = await messaging.PreviewAsync(conversationId, token);
            var json = JsonSerializer.Serialize(new MessagePayload(conversationId, preview.ConversationTitle, preview.Recipients, body, preview.ContextHash));
            var now = clock.GetUtcNow();
            var action = new PendingAction
            {
                ConnectionId = connection.Id, UserId = accounts.UserId, PayloadJson = json, PayloadHash = Hash(json), TargetId = conversationId,
                ExpectedRevision = preview.ExpectedRevision, ConnectionVersion = connection.Version, IdempotencyKey = idempotencyKey,
                CreatedAt = now, ExpiresAt = now.AddMinutes(30), CorrelationId = (http.HttpContext?.TraceIdentifier ?? "")[..Math.Min(http.HttpContext?.TraceIdentifier.Length ?? 0, 200)]
            };
            db.PendingActions.Add(action);
            await db.SaveChangesAsync(token);
            return ActionDto(action, connection.ClientName);
        }, ct);
    }
    public async Task<PendingActionDto[]> ActionsAsync(string? status, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        if (status is not null && status is not ("Pending" or "Approved" or "Executed" or "Rejected" or "Expired"))
            throw ApiException.Invalid("Invalid action status.");
        var query = from action in db.PendingActions.AsNoTracking()
                    join connection in db.Connections.AsNoTracking() on action.ConnectionId equals connection.Id
                    where action.UserId == accounts.UserId
                    select new { Action = action, connection.ClientName };
        var now = clock.GetUtcNow();
        if (status == "Expired") query = query.Where(x => x.Action.Status == "Expired" || ((x.Action.Status == "Pending" || x.Action.Status == "Approved") && x.Action.ExpiresAt <= now));
        else if (status is not null) query = query.Where(x => x.Action.Status == status && (status != "Pending" && status != "Approved" || x.Action.ExpiresAt > now));
        return (await query.OrderByDescending(x => x.Action.CreatedAt).Take(100).ToArrayAsync(ct)).Select(x => ActionDto(x.Action, x.ClientName)).ToArray();
    }
    public async Task<PendingActionDto> ActionAsync(Guid id, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        var action = await OwnAction(id, ct);
        return ActionDto(action, (await OwnConnection(action.ConnectionId, ct)).ClientName);
    }
    public async Task<PendingActionDto> DecideActionAsync(Guid id, ActionDecision request, bool approve, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        return await tx.RunAsync(async token =>
        {
            var action = await OwnAction(id, token);
            var connection = await LockedOwnConnection(action.ConnectionId, token);
            await db.Entry(action).ReloadAsync(token);
            Version(action.Version, request.ExpectedVersion);
            if (approve ? action.Status != "Pending" : action.Status is not ("Pending" or "Approved"))
                throw ApiException.Conflict("Only pending actions can be approved; pending or approved actions can be rejected.");
            if (approve)
            {
                ValidAction(action, connection);
                if (!connection.Grants.Contains(IntegrationGrants.SendApprovedMessages))
                    throw new ApiException(403, "INTEGRATION_PERMISSION_REQUIRED", "This assistant has no approved-send permission.");
                await features.RequireAsync(IntegrationGrants.Feature(IntegrationGrants.SendApprovedMessages), token);
                var payload = Payload(action);
                var preview = await messaging.PreviewAsync(payload.ConversationId, token);
                if (preview.ContextHash != payload.ContextHash) throw new ApiException(409, "STALE_REVISION", "Conversation state changed. Prepare and review a new action.");
                action.ApprovedAt = clock.GetUtcNow();
                action.ApprovedBy = accounts.UserId;
            }
            action.Status = approve ? "Approved" : "Rejected";
            action.Version++;
            await db.SaveChangesAsync(token);
            return ActionDto(action, connection.ClientName);
        }, ct);
    }
    public async Task<SendApprovedResult> SendApprovedMessageAsync(Guid actionId, CancellationToken ct)
    {
        return await tx.RunAsync(async token =>
        {
            await access.LockAsync(accounts.UserId, access.ClientId, token);
            var connection = await access.RequireAsync(IntegrationGrants.SendApprovedMessages, token);
            var action = await db.PendingActions.SingleOrDefaultAsync(x => x.Id == actionId && x.UserId == accounts.UserId && x.ConnectionId == connection.Id, token) ?? throw ApiException.NotFound();
            if (action.Status == "Executed") return new SendApprovedResult(action.Id, action.MessageId!.Value, action.TargetId, action.Status);
            ValidAction(action, connection);
            if (action.Status != "Approved" || action.ApprovedBy != accounts.UserId || action.ApprovedAt == null)
                throw new ApiException(409, "APPROVAL_REQUIRED", "Review and approve this exact action in Metrivum first.");
            var payload = Payload(action);
            var messageId = await messaging.SendAsync(payload.ConversationId, payload.Body, payload.ContextHash, "mcp-action:" + action.Id, token);
            action.Status = "Executed";
            action.ExecutedAt = clock.GetUtcNow();
            action.MessageId = messageId;
            action.Version++;
            await db.SaveChangesAsync(token);
            return new SendApprovedResult(action.Id, messageId, payload.ConversationId, action.Status);
        }, ct);
    }

    public async Task<T> ExecuteCommandAsync<T>(string tool, Guid idempotencyKey, object payload, Func<CancellationToken, Task<T>> mutation, CancellationToken ct)
    {
        var grant = tool switch
        {
            "create_program_draft" or "apply_program_draft_changes" => IntegrationGrants.WriteTrainingDrafts,
            "create_checkin_form_draft" => IntegrationGrants.ManageCheckins,
            _ => throw ApiException.Invalid("Unsupported draft operation.")
        };
        if (idempotencyKey == Guid.Empty) throw ApiException.Invalid("A UUID idempotency key is required.");
        var hash = Hash(JsonSerializer.Serialize(payload));
        return await tx.RunAsync(async token =>
        {
            await access.LockAsync(accounts.UserId, access.ClientId, token);
            var connection = await access.RequireAsync(grant, token);
            var receipt = await db.CommandReceipts.SingleOrDefaultAsync(x => x.ConnectionId == connection.Id && x.Tool == tool && x.IdempotencyKey == idempotencyKey, token);
            if (receipt != null)
            {
                if (receipt.PayloadHash != hash) throw ApiException.Conflict("Idempotency key was used for different draft content.");
                return JsonSerializer.Deserialize<T>(receipt.ResultJson)!;
            }
            var result = await mutation(token);
            db.CommandReceipts.Add(new() { ConnectionId = connection.Id, Tool = tool, IdempotencyKey = idempotencyKey, PayloadHash = hash,
                ResultJson = JsonSerializer.Serialize(result), CreatedAt = clock.GetUtcNow() });
            await db.SaveChangesAsync(token);
            return result;
        }, ct);
    }
    public async Task<PreferencesDto> ProgrammingPreferencesAsync(CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        return await Preferences(ct);
    }
    public async Task<PreferencesDto> ReadProgrammingPreferencesAsync(CancellationToken ct)
    {
        await access.RequireAsync(IntegrationGrants.ReadTraining, ct);
        var preferences = await Preferences(ct);
        return preferences.ShareWithIntegrations ? preferences : new("", false, preferences.Version);
    }
    public async Task<PreferencesDto> SaveProgrammingPreferencesAsync(PreferencesUpdate request, CancellationToken ct)
    {
        await access.RequireOwnerSessionAsync(ct);
        Text(request.Note, 8000);
        return await tx.RunAsync(async token =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"integration-preferences:" + accounts.UserId}, 0))", token);
            var row = await db.ProgrammingPreferences.SingleOrDefaultAsync(x => x.UserId == accounts.UserId, token);
            Version(row?.Version ?? 0, request.ExpectedVersion);
            if (row == null) db.ProgrammingPreferences.Add(row = new() { UserId = accounts.UserId, Version = 0 });
            row.Note = request.Note;
            row.ShareWithIntegrations = request.ShareWithIntegrations;
            row.Version++;
            await db.SaveChangesAsync(token);
            return new PreferencesDto(row.Note, row.ShareWithIntegrations, row.Version);
        }, ct);
    }
    private async Task<PreferencesDto> Preferences(CancellationToken ct)
    {
        var row = await db.ProgrammingPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == accounts.UserId, ct);
        return new(row?.Note ?? "", row?.ShareWithIntegrations ?? false, row?.Version ?? 0);
    }
    private async Task<IntegrationConnection> OwnConnection(Guid id, CancellationToken ct) =>
        await db.Connections.SingleOrDefaultAsync(x => x.Id == id && x.UserId == accounts.UserId, ct) ?? throw ApiException.NotFound();
    private async Task<IntegrationConnection> LockedOwnConnection(Guid id, CancellationToken ct)
    {
        var connection = await OwnConnection(id, ct);
        await access.LockAsync(accounts.UserId, connection.ClientId, ct);
        await db.Entry(connection).ReloadAsync(ct);
        return connection;
    }
    private async Task<PendingAction> OwnAction(Guid id, CancellationToken ct) => await db.PendingActions.SingleOrDefaultAsync(x => x.Id == id && x.UserId == accounts.UserId, ct) ?? throw ApiException.NotFound();
    private void ValidAction(PendingAction action, IntegrationConnection connection)
    {
        if (connection.RevokedAt != null || connection.Version != action.ConnectionVersion)
            throw new ApiException(403, "INTEGRATION_REVOKED", "The connection or its permissions changed. Prepare a new action.");
        if (action.ExpiresAt <= clock.GetUtcNow()) throw new ApiException(409, "ACTION_EXPIRED", "This action expired. Prepare and review a new action.");
        if (Hash(JsonSerializer.Serialize(Payload(action))) != action.PayloadHash)
            throw ApiException.Conflict("The immutable action payload failed verification.");
    }
    private PendingActionDto ActionDto(PendingAction action, string name)
    {
        var payload = Payload(action);
        var status = action.Status is "Pending" or "Approved" && action.ExpiresAt <= clock.GetUtcNow() ? "Expired" : action.Status;
        return new(action.Id, action.ConnectionId, name, action.Type, status, payload.ConversationId, payload.ConversationTitle,
            payload.Recipients, payload.Body, action.PayloadHash, action.CreatedAt, action.ExpiresAt, action.ApprovedAt,
            action.ExecutedAt, action.MessageId, action.Version, ReviewUrl(action.Id));
    }
    private string ReviewUrl(Guid actionId)
    {
        var path = "/app/integrations/actions/" + actionId;
        var webUrl = configuration["Mcp:WebUrl"];
        return string.IsNullOrWhiteSpace(webUrl) ? path : webUrl.TrimEnd('/') + path;
    }
    private static MessagePayload Payload(PendingAction action) => JsonSerializer.Deserialize<MessagePayload>(action.PayloadJson) ?? throw ApiException.Conflict("Invalid action payload.");
    private static ConnectionDto ConnectionDto(IntegrationConnection x) => new(x.Id, x.ClientId, x.ClientName, x.Grants, x.CreatedAt, x.LastUsedAt, x.RevokedAt, x.Version);
    private static string Hash(string input) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input)));
    private static void Version(long actual, long expected)
    {
        if (actual != expected) throw new ApiException(409, "STALE_REVISION", "The record changed. Refresh before retrying.");
    }
    private static void Text(string? text, int max, bool required = false)
    {
        if ((required && string.IsNullOrWhiteSpace(text)) || text is null || text.Length > max || text.Any(x => char.IsControl(x) && x != '\n' && x != '\r' && x != '\t'))
            throw ApiException.Invalid($"Text must contain at most {max} characters.");
    }
}
