using Metrivum.Training.Features;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Metrivum.Training.Generation;

/// <summary>Maps generation HTTP operations in Training; owning handlers validate requests and perform persistence.</summary>
public static class GenerationEndpoints
{
    public static void MapProgramGenerator(this RouteGroupBuilder training)
    {
        var group = training.MapGroup("/generator");
        group.MapGet(
            "/options",
            (TrainingService service, CancellationToken ct) => service.GeneratorOptionsAsync(ct)
        );
        group.MapPost(
            "/preview",
            (GenerationRequest request, TrainingService service, CancellationToken ct) =>
                service.PreviewGenerationAsync(request, ct)
        );
        group.MapPost(
            "/reshuffle",
            (GenerationEditRequest request, TrainingService service, CancellationToken ct) =>
                service.ReshuffleGenerationAsync(request, ct)
        );
        group.MapPost(
            "/replace-exercise",
            (GenerationReplaceRequest request, TrainingService service, CancellationToken ct) =>
                service.ReplaceGeneratedExerciseAsync(request, ct)
        );
        group.MapPost(
            "/save-draft",
            async (
                SaveGeneratedDraftRequest request,
                TrainingService service,
                HttpContext http,
                CancellationToken ct
            ) =>
            {
                var plan = await service.SaveGeneratedDraftAsync(
                    request,
                    http.Request.Headers["Idempotency-Key"].ToString(),
                    ct
                );
                http.Response.Headers.ETag = $"\"{plan.Version}\"";
                return plan;
            }
        );
        training.MapGet(
            "/programs/{id:guid}/generation",
            (Guid id, TrainingService service, CancellationToken ct) =>
                service.GetGenerationAsync(id, ct)
        );
    }
}
