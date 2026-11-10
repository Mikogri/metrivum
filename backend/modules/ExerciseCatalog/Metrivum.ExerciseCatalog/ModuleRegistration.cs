using Metrivum.Access.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.ExerciseCatalog.Features;
using Metrivum.ExerciseCatalog.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Metrivum.ExerciseCatalog;

/// <summary>Registers ExerciseCatalog services and HTTP routes; request handlers delegate database work to the owning module.</summary>
public static class ModuleRegistration
{
    public static IServiceCollection AddExerciseCatalog(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddModuleDatabase<ExerciseCatalogDbContext>("exercise_catalog");
        services.AddScoped<CatalogService>();
        services.AddScoped<IMcpExerciseOperations, McpExerciseOperations>();
        services.AddScoped<IExerciseCatalog>(provider =>
            provider.GetRequiredService<CatalogService>()
        );
        services.AddSingleton(
            new FeatureDefinition(
                "exercises.browse",
                "ExerciseCatalog",
                "features.exercises.browse.title",
                "features.exercises.browse.description",
                [],
                []
            )
        );
        services.AddSingleton(
            new FeatureDefinition(
                "exercises.create",
                "ExerciseCatalog",
                "features.exercises.create.title",
                "features.exercises.create.description",
                ["exercises.browse"],
                []
            )
        );
        services.AddSingleton(
            new FeatureDefinition(
                "exercises.favorites",
                "ExerciseCatalog",
                "features.exercises.favorites.title",
                "features.exercises.favorites.description",
                ["exercises.browse"],
                []
            )
        );
        return services;
    }

    public static IEndpointRouteBuilder MapExerciseCatalog(this IEndpointRouteBuilder endpoints)
    {
        var exercises = endpoints
            .MapGroup("/api/v1/exercises")
            .RequireAuthorization()
            .WithTags("Exercises");
        exercises.MapGet(
            "/",
            ([AsParameters] CatalogQuery query, CatalogService service, CancellationToken ct) =>
                service.ListAsync(query, ct)
        );
        exercises.MapGet(
            "/{id:guid}",
            (Guid id, CatalogService service, CancellationToken ct) => service.GetAsync(id, ct)
        );
        exercises
            .MapPost(
                "/",
                async (
                    CreateExerciseRequest request,
                    CatalogService service,
                    CancellationToken ct
                ) =>
                {
                    var exercise = await service.CreateAsync(request, ct);
                    return Results.Created($"/api/v1/exercises/{exercise.Id}", exercise);
                }
            )
            .Produces<ExerciseDto>(StatusCodes.Status201Created);
        exercises.MapPatch(
            "/{id:guid}",
            (
                Guid id,
                UpdateExerciseRequest request,
                CatalogService service,
                CancellationToken ct
            ) => service.UpdateAsync(id, request, ct)
        );
        exercises.MapPost(
            "/{id:guid}/archive",
            async (
                Guid id,
                ArchiveExerciseRequest request,
                CatalogService service,
                CancellationToken ct
            ) =>
            {
                await service.ArchiveAsync(id, request.ExpectedVersion, ct);
                return Results.NoContent();
            }
        );
        exercises.MapGet(
            "/{id:guid}/history",
            (Guid id, int? page, int? pageSize, CatalogService service, CancellationToken ct) =>
                service.HistoryAsync(id, ct, page ?? 1, pageSize ?? 50)
        );
        exercises.MapPut(
            "/{id:guid}/favorite",
            async (Guid id, CatalogService service, CancellationToken ct) =>
            {
                await service.SetFavoriteAsync(id, true, ct);
                return Results.NoContent();
            }
        );
        exercises.MapDelete(
            "/{id:guid}/favorite",
            async (Guid id, CatalogService service, CancellationToken ct) =>
            {
                await service.SetFavoriteAsync(id, false, ct);
                return Results.NoContent();
            }
        );
        var tags = endpoints
            .MapGroup("/api/v1/exercise-tags")
            .RequireAuthorization()
            .WithTags("Exercise tags");
        tags.MapGet(
            "/",
            (string? search, CatalogService service, CancellationToken ct) =>
                service.ListTagsAsync(search, ct)
        );
        tags.MapPost(
                "/",
                async (CreateTagRequest request, CatalogService service, CancellationToken ct) =>
                    Results.Ok(await service.CreateTagAsync(request.Name, ct))
            )
            .Produces<TagDto>();
        endpoints
            .MapGet(
                "/api/v1/exercise-dictionaries",
                (CatalogService service, CancellationToken ct) => service.ListDictionariesAsync(ct)
            )
            .RequireAuthorization()
            .WithTags("Exercise dictionaries");
        var admin = endpoints
            .MapGroup("/api/v1/admin")
            .RequireAuthorization()
            .WithTags("Catalog administration");
        admin.MapPut(
            "/exercise-dictionaries/{kind}/{key}",
            (
                string kind,
                string key,
                DictionaryRequest request,
                CatalogService service,
                CancellationToken ct
            ) => service.SaveDictionaryAsync(kind, key, request, ct)
        );
        admin.MapPost(
            "/exercise-tags/{id:guid}/merge",
            async (
                Guid id,
                MergeTagRequest request,
                CatalogService service,
                CancellationToken ct
            ) =>
            {
                await service.MergeTagAsync(id, request.TargetId, ct);
                return Results.NoContent();
            }
        );
        return endpoints;
    }
}
