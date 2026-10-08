using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Training.Delivery;

public static class DeliveryEndpoints
{
    public static void MapTrainingDelivery(this RouteGroupBuilder group)
    {
        group.MapPost("/programs/{programId:guid}/assignments/preview", (Guid programId, AssignProgramRequest request, TrainingDeliveryService s, CancellationToken ct) => s.PreviewAsync(programId, request, ct));
        group.MapPost("/programs/{programId:guid}/assignments", (Guid programId, AssignProgramRequest request, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => s.AssignAsync(programId, request, h.Request.Headers["Idempotency-Key"].ToString(), ct));
        group.MapGet("/assignments", (Guid? relationshipId, Guid? programId, Guid? groupId, int? page, int? pageSize, string? view, TrainingDeliveryService s, CancellationToken ct) => s.ListAsync(relationshipId, programId, groupId, page ?? 1, pageSize ?? 25, ct, view));
        group.MapGet("/assignments/{id:guid}", async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Assignment(h, await s.GetAsync(id, ct))).Produces<AssignmentDto>();
        group.MapPut("/assignments/{id:guid}/status", async (Guid id, AssignmentStatusRequest request, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Assignment(h, await s.SetStatusAsync(id, request.Status, Version(h), ct))).Produces<AssignmentDto>();
        group.MapPost("/assignments/{id:guid}/refresh", async (Guid id, RefreshAssignmentRequest request, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Assignment(h, await s.RefreshAsync(id, request.RevisionId, Version(h), ct))).Produces<AssignmentDto>();
        group.MapGet("/schedule", (DateOnly from, DateOnly to, Guid? relationshipId, Guid? programId, int? page, int? pageSize, string? view, TrainingDeliveryService s, CancellationToken ct) => s.ScheduleAsync(from, to, relationshipId, programId, page ?? 1, pageSize ?? 50, ct, view));
        group.MapGet("/workouts/{id:guid}", (Guid id, TrainingDeliveryService s, CancellationToken ct) => s.WorkoutAsync(id, ct));
        group.MapPost("/workouts/{id:guid}/start", async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Execution(h, await s.StartAsync(id, ct))).Produces<ExecutionDto>();
        group.MapPost("/workouts/{id:guid}/skip", async (Guid id, SkipWorkoutRequest request, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Execution(h, await s.SkipAsync(id, request.Reason, ct))).Produces<ExecutionDto>();
        group.MapPut("/executions/{id:guid}", async (Guid id, SaveExecutionRequest request, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Execution(h, await s.SaveAsync(id, request, Version(h), ct))).Produces<ExecutionDto>();
        group.MapPost("/executions/{id:guid}/complete", async (Guid id, HttpContext h, TrainingDeliveryService s, CancellationToken ct) => Execution(h, await s.CompleteAsync(id, Version(h), ct))).Produces<ExecutionDto>();
        group.MapGet("/progress", (DateOnly from, DateOnly to, Guid? relationshipId, Guid? programId, Guid? exerciseId, Guid? groupId, string? view, TrainingDeliveryService s, CancellationToken ct) => s.ReadAsync(new(from, to, relationshipId, programId, exerciseId, groupId, View: view), ct));
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
