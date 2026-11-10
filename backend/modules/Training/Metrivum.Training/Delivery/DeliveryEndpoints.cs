using Metrivum.BuildingBlocks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Metrivum.Training.Delivery;

/// <summary>Maps the Training delivery HTTP endpoints and delegates authorized reads and writes to delivery services.</summary>
public static class DeliveryEndpoints
{
    public static void MapTrainingDelivery(this RouteGroupBuilder group)
    {
        group.MapGet(
            "/assignments/{id:guid}/formula-snapshot",
            (Guid id, TrainingDeliveryService s, CancellationToken ct) =>
                s.FormulaSnapshotAsync(id, false, ct)
        );
        group.MapPost(
            "/assignments/{id:guid}/formula-snapshot/preview",
            (Guid id, TrainingDeliveryService s, CancellationToken ct) =>
                s.FormulaSnapshotAsync(id, true, ct)
        );
        group.MapPost(
            "/assignments/{id:guid}/formula-snapshot/refresh",
            (
                Guid id,
                RefreshFormulaSnapshotRequest request,
                HttpContext h,
                TrainingDeliveryService s,
                CancellationToken ct
            ) => s.RefreshFormulaSnapshotAsync(id, request, Version(h), ct)
        );
        group.MapGet(
            "/activity-options",
            (
                Guid relationshipId,
                Guid? programId,
                TrainingDeliveryService s,
                CancellationToken ct
            ) => s.ActivityOptionsAsync(relationshipId, programId, ct)
        );
        group
            .MapGet(
                "/analysis-set-options",
                (
                    Guid? relationshipId,
                    int? days,
                    bool? includeSets,
                    Guid? executionId,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) =>
                    s.AnalysisSetOptionsAsync(
                        relationshipId,
                        days ?? 60,
                        ct,
                        includeSets ?? true,
                        executionId
                    )
            )
            .Produces<AnalysisSetOptionsDto>();
        group.MapGet(
            "/last-activity",
            (Guid relationshipId, TrainingDeliveryService s, CancellationToken ct) =>
                s.LastActivityAsync(relationshipId, ct)
        );
        group.MapGet(
            "/assignment-summary",
            (Guid relationshipId, TrainingDeliveryService s, CancellationToken ct) =>
                s.AssignmentSummaryAsync(relationshipId, ct)
        );
        group.MapPost(
            "/programs/{programId:guid}/assignments/preview",
            (
                Guid programId,
                AssignProgramRequest request,
                TrainingDeliveryService s,
                CancellationToken ct
            ) => s.PreviewAsync(programId, request, ct)
        );
        group.MapPost(
            "/programs/{programId:guid}/assignments",
            (
                Guid programId,
                AssignProgramRequest request,
                HttpContext h,
                TrainingDeliveryService s,
                CancellationToken ct
            ) =>
                s.AssignAsync(
                    programId,
                    request,
                    h.Request.Headers["Idempotency-Key"].ToString(),
                    ct
                )
        );
        group.MapGet(
            "/assignments",
            (
                Guid? relationshipId,
                Guid? programId,
                Guid? groupId,
                int? page,
                int? pageSize,
                string? view,
                TrainingDeliveryService s,
                CancellationToken ct
            ) =>
                s.ListAsync(relationshipId, programId, groupId, page ?? 1, pageSize ?? 25, ct, view)
        );
        group
            .MapGet(
                "/assignments/{id:guid}",
                async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) =>
                    Assignment(h, await s.GetAsync(id, ct))
            )
            .Produces<AssignmentDto>();
        group
            .MapPut(
                "/assignments/{id:guid}/status",
                async (
                    Guid id,
                    AssignmentStatusRequest request,
                    HttpContext h,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) => Assignment(h, await s.SetStatusAsync(id, request.Status, Version(h), ct))
            )
            .Produces<AssignmentDto>();
        group
            .MapPost(
                "/assignments/{id:guid}/refresh",
                async (
                    Guid id,
                    RefreshAssignmentRequest request,
                    HttpContext h,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) => Assignment(h, await s.RefreshAsync(id, request.RevisionId, Version(h), ct))
            )
            .Produces<AssignmentDto>();
        group.MapGet(
            "/schedule",
            (
                DateOnly from,
                DateOnly to,
                Guid? relationshipId,
                Guid? programId,
                Guid? blockId,
                Guid? cycleId,
                string? status,
                string? sort,
                int? page,
                int? pageSize,
                string? view,
                TrainingDeliveryService s,
                CancellationToken ct
            ) =>
                s.ScheduleAsync(
                    from,
                    to,
                    relationshipId,
                    programId,
                    page ?? 1,
                    pageSize ?? 50,
                    ct,
                    view,
                    blockId,
                    cycleId,
                    status,
                    sort
                )
        );
        group.MapGet(
            "/workouts/{id:guid}",
            (Guid id, Guid? relationshipId, TrainingDeliveryService s, CancellationToken ct) =>
                s.WorkoutAsync(id, ct, relationshipId)
        );
        group
            .MapPost(
                "/workouts/{id:guid}/start",
                async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) =>
                    Execution(h, await s.StartAsync(id, ct))
            )
            .Produces<ExecutionDto>();
        group
            .MapPost(
                "/workouts/{id:guid}/skip",
                async (
                    Guid id,
                    SkipWorkoutRequest request,
                    HttpContext h,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) => Execution(h, await s.SkipAsync(id, request.Reason, ct))
            )
            .Produces<ExecutionDto>();
        group
            .MapPut(
                "/executions/{id:guid}",
                async (
                    Guid id,
                    SaveExecutionRequest request,
                    HttpContext h,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) => Execution(h, await s.SaveAsync(id, request, Version(h), ct))
            )
            .Produces<ExecutionDto>();
        group
            .MapPost(
                "/executions/{id:guid}/complete",
                async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) =>
                    Execution(h, await s.CompleteAsync(id, Version(h), ct))
            )
            .Produces<ExecutionDto>();
        group
            .MapPut(
                "/executions/{id:guid}/feedback",
                async (
                    Guid id,
                    WorkoutFeedback request,
                    HttpContext h,
                    TrainingDeliveryService s,
                    CancellationToken ct
                ) => Execution(h, await s.SaveFeedbackAsync(id, request, Version(h), ct))
            )
            .Produces<ExecutionDto>();
        group.MapGet(
            "/executions/{id:guid}/comparison",
            (Guid id, TrainingDeliveryService service, CancellationToken ct) =>
                service.CompareExecutionAsync(id, ct)
        );
        group.MapGet(
            "/comparison-report",
            (
                DateOnly from,
                DateOnly to,
                Guid? relationshipId,
                Guid? programId,
                Guid? blockId,
                Guid? cycleId,
                int? page,
                int? pageSize,
                string? view,
                TrainingDeliveryService service,
                CancellationToken ct
            ) =>
                service.ComparisonReportAsync(
                    from,
                    to,
                    relationshipId,
                    programId,
                    blockId,
                    cycleId,
                    page ?? 1,
                    pageSize ?? 25,
                    view,
                    ct
                )
        );
        group.MapGet(
            "/progress",
            (
                DateOnly from,
                DateOnly to,
                Guid? relationshipId,
                Guid? programId,
                Guid? exerciseId,
                Guid? groupId,
                Guid? blockId,
                Guid? cycleId,
                int? repetitions,
                string? view,
                TrainingDeliveryService s,
                CancellationToken ct
            ) =>
                s.ReadAsync(
                    new(
                        from,
                        to,
                        relationshipId,
                        programId,
                        exerciseId,
                        groupId,
                        View: view,
                        BlockId: blockId,
                        CycleId: cycleId,
                        Repetitions: repetitions
                    ),
                    ct
                )
        );
    }

    private static long Version(HttpContext h) => RequestPreconditions.RequireVersion(h.Request);

    private static IResult Assignment(HttpContext h, AssignmentDto dto)
    {
        h.Response.Headers.ETag = $"\"{dto.Version}\"";
        return Results.Ok(dto);
    }

    private static IResult Execution(HttpContext h, ExecutionDto dto)
    {
        h.Response.Headers.ETag = $"\"{dto.Version}\"";
        return Results.Ok(dto);
    }
}
