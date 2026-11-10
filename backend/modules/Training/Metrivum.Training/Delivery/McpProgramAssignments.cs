using System.Security.Cryptography;
using System.Text;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Contracts;
using Metrivum.Training.Domain;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Training.Delivery;

/// <summary>Manages assignments, frozen workout prescriptions, executions and progress in the Training database.</summary>
public sealed partial class TrainingDeliveryService
{
    public Task<McpProgramAssignmentPreview> PreviewMcpAssignmentAsync(
        McpProgramAssignmentRequest request,
        CancellationToken ct
    ) => MutateAsync(() => AssignmentPreview(request, ct), ct);

    public Task<McpAssignedProgram> AssignMcpAsync(
        McpProgramAssignmentRequest request,
        string contextHash,
        string key,
        CancellationToken ct
    ) =>
        MutateAsync(
            async () =>
            {
                // Keep the ordinary assignment locks until the normal domain write commits, so another tab
                // or connection cannot add an assignment between the approved-state check and execution.
                var preview = await AssignmentPreview(request, ct);
                if (!string.Equals(preview.ContextHash, contextHash, StringComparison.Ordinal))
                    throw new ApiException(
                        409,
                        "STALE_REVISION",
                        "Client assignments changed. Prepare and review a new action."
                    );
                var batch = await AssignAsync(
                    request.ProgramId,
                    AssignmentRequest(request),
                    key,
                    ct
                );
                var assignment = batch.Assignments.Single();
                return new McpAssignedProgram(
                    assignment.Id,
                    assignment.RelationshipId,
                    assignment.ProgramId,
                    assignment.EffectiveRevisionId,
                    assignment.StartDate,
                    assignment.Status.ToString()
                );
            },
            ct
        );

    private async Task<McpProgramAssignmentPreview> AssignmentPreview(
        McpProgramAssignmentRequest request,
        CancellationToken ct
    )
    {
        if (
            request is null
            || request.ProgramId == Guid.Empty
            || request.RelationshipId == Guid.Empty
            || request.RevisionId == Guid.Empty
        )
            throw ApiException.Invalid(
                "Select a program, published revision and one active coaching relationship."
            );
        var coach = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.assignments.manage", ct);
        var team = teams == null ? null : await teams.GetForUserAsync(coach.UserId, ct);
        if (team != null)
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team.TeamId}, 0))",
                ct
            );
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({coach.WorkspaceId.ToString()}, 7105))",
            ct
        );
        await LockAsync(coach.UserId, ct);
        var input = AssignmentRequest(request);
        var recipients = await PreviewAsync(request.ProgramId, input, ct);
        var recipient = recipients.Single();
        var revision = await PublishedAsync(request.ProgramId, request.RevisionId, coach, ct);
        // Status/refresh writes use per-assignment locks. Acquire these before taking the fingerprint.
        var ids = await Assignments
            .Where(x =>
                x.RelationshipId == request.RelationshipId
                && (x.Status == AssignmentStatus.Active || x.Status == AssignmentStatus.Paused)
            )
            .OrderBy(x => x.Id)
            .Select(x => x.Id)
            .Take(101)
            .ToArrayAsync(ct);
        if (ids.Length > 100)
            throw ApiException.Invalid(
                "Review this client's assignments in Metrivum before preparing another assignment."
            );
        foreach (var id in ids)
            await LockAsync(id, ct);
        var current = await Assignments
            .AsNoTracking()
            .Where(x =>
                x.RelationshipId == request.RelationshipId
                && (x.Status == AssignmentStatus.Active || x.Status == AssignmentStatus.Paused)
            )
            .OrderBy(x => x.Id)
            .Select(x => new McpAssignmentState(
                x.Id,
                x.ProgramName,
                x.EffectiveRevisionId,
                x.Status.ToString(),
                x.Version
            ))
            .ToArrayAsync(ct);
        const string effect =
            "Adds one active assignment and scheduled workouts. Existing assignments and workout history remain unchanged; this does not cancel or replace them.";
        var context = Convert.ToHexString(
            SHA256.HashData(
                Encoding.UTF8.GetBytes(
                    TrainingJson.Serialize(
                        new
                        {
                            request,
                            recipient.ClientId,
                            recipient.DisplayName,
                            ProgramName = revision.Snapshot.Name,
                            revision.Number,
                            CurrentAssignments = current,
                            effect,
                        }
                    )
                )
            )
        );
        return new(
            request,
            recipient.ClientId,
            recipient.DisplayName,
            revision.Snapshot.Name,
            revision.Number,
            current,
            effect,
            context
        );
    }

    private static AssignProgramRequest AssignmentRequest(McpProgramAssignmentRequest request) =>
        new(request.RevisionId, [request.RelationshipId], [], request.StartDate, request.TimeZone);
}
