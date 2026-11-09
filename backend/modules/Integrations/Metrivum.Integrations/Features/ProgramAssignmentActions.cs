using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Integrations.Domain;
using Metrivum.Training.Contracts;

namespace Metrivum.Integrations.Features;

/// <summary>Manages AI consent, pending actions and command receipts, coordinating approved writes through owning-module contracts.</summary>
public sealed partial class IntegrationService
{
    public async Task<PendingActionDto> PrepareAssignmentAsync(McpProgramAssignmentRequest request, Guid idempotencyKey, CancellationToken ct)
    {
        if (idempotencyKey == Guid.Empty) throw ApiException.Invalid("A UUID idempotency key is required.");
        return await tx.RunAsync(async token =>
        {
            await access.LockAsync(accounts.UserId, access.ClientId, token);
            var connection = await access.RequireAsync(IntegrationGrants.AssignPrograms, token);
            var existing = await db.PendingActions.SingleOrDefaultAsync(x => x.ConnectionId == connection.Id && x.IdempotencyKey == idempotencyKey, token);
            if (existing != null)
            {
                RequireType(existing, "AssignProgram");
                if (AssignmentPayload(existing).Request != request)
                    throw ApiException.Conflict("Idempotency key was used for different assignment content.");
                return ActionDto(existing, connection.ClientName);
            }
            var preview = await training.PreviewAssignmentAsync(request, token);
            var json = JsonSerializer.Serialize(preview);
            var now = clock.GetUtcNow();
            var action = new PendingAction
            {
                Type = "AssignProgram", ConnectionId = connection.Id, UserId = accounts.UserId, PayloadJson = json,
                PayloadHash = Hash(json), TargetId = request.RelationshipId, ConnectionVersion = connection.Version,
                IdempotencyKey = idempotencyKey, CreatedAt = now, ExpiresAt = now.AddMinutes(30),
                CorrelationId = (http.HttpContext?.TraceIdentifier ?? "")[..Math.Min(http.HttpContext?.TraceIdentifier.Length ?? 0, 200)]
            };
            db.PendingActions.Add(action);
            await db.SaveChangesAsync(token);
            return ActionDto(action, connection.ClientName);
        }, ct);
    }

    public Task<AssignApprovedResult> AssignApprovedProgramAsync(Guid actionId, CancellationToken ct) => tx.RunAsync(async token =>
    {
        await access.LockAsync(accounts.UserId, access.ClientId, token);
        var connection = await access.RequireAsync(IntegrationGrants.AssignPrograms, token);
        var action = await db.PendingActions.SingleOrDefaultAsync(x => x.Id == actionId && x.UserId == accounts.UserId && x.ConnectionId == connection.Id, token)
            ?? throw ApiException.NotFound();
        RequireType(action, "AssignProgram");
        if (action.Status == "Executed")
            return new AssignApprovedResult(action.Id, action.AssignmentId!.Value, action.TargetId, action.Status);
        ValidAction(action, connection);
        if (action.Status != "Approved" || action.ApprovedBy != accounts.UserId || action.ApprovedAt == null)
            throw new ApiException(409, "APPROVAL_REQUIRED", "Review and approve this exact assignment in Metrivum first.");
        var payload = AssignmentPayload(action);
        var result = await training.AssignAsync(payload.Request, payload.ContextHash, "mcp-action:" + action.Id, token);
        action.Status = "Executed";
        action.ExecutedAt = clock.GetUtcNow();
        action.AssignmentId = result.AssignmentId;
        action.Version++;
        await db.SaveChangesAsync(token);
        return new AssignApprovedResult(action.Id, result.AssignmentId, result.RelationshipId, action.Status);
    }, ct);

    private async Task CheckAssignmentAsync(PendingAction action, CancellationToken ct)
    {
        var payload = AssignmentPayload(action);
        var preview = await training.PreviewAssignmentAsync(payload.Request, ct);
        if (preview.ContextHash != payload.ContextHash)
            throw new ApiException(409, "STALE_REVISION", "Client or program state changed. Prepare and review a new action.");
    }
}
