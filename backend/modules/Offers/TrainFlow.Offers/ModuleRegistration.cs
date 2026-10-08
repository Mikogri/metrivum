using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Access.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Offers.Contracts;
using TrainFlow.Offers.Features;
using TrainFlow.Offers.Infrastructure;

namespace TrainFlow.Offers;

public static class ModuleRegistration
{
    public static IServiceCollection AddOffers(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDatabase<OffersDbContext>("offers");
        services.AddScoped<OffersService>();
        services.AddScoped<IOfferLibrary>(p => p.GetRequiredService<OffersService>());
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "offers.manage", "offers.view-public" })
            services.AddSingleton(new FeatureDefinition(key, "Offers", key + ".title", key + ".description", [], []));
        return services;
    }
    public static IEndpointRouteBuilder MapOffers(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/offers").WithTags("Offers").RequireAuthorization();
        group.MapGet("", (int? page, int? pageSize, OfferStatus? status, string? search, string? sort, Guid? teamId, OffersService s, CancellationToken ct) => s.ListAsync(page ?? 1, pageSize ?? 25, status, search, sort ?? "updated", ct, teamId));
        group.MapPost("", async (OfferRequest r, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.CreateAsync(r, ct))).Produces<OfferDto>();
        group.MapGet("/categories", (OffersService s, CancellationToken ct) => s.CategoriesAsync(ct));
        group.MapGet("/tags", (string? search, OffersService s, CancellationToken ct) => s.TagsAsync(search, ct));
        group.MapGet("/{id:guid}", async (Guid id, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.DetailAsync(id, ct))).Produces<OfferDto>();
        group.MapPatch("/{id:guid}", async (Guid id, OfferRequest r, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.UpdateAsync(id, r, Version(http), ct))).Produces<OfferDto>();
        group.MapPost("/{id:guid}/publish", async (Guid id, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.PublishAsync(id, Version(http), ct))).Produces<OfferDto>();
        group.MapPost("/{id:guid}/activate", async (Guid id, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.ChangeStatusAsync(id, OfferStatus.Active, Version(http), ct))).Produces<OfferDto>();
        group.MapPost("/{id:guid}/deactivate", async (Guid id, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.ChangeStatusAsync(id, OfferStatus.Inactive, Version(http), ct))).Produces<OfferDto>();
        group.MapPost("/{id:guid}/archive", async (Guid id, OffersService s, HttpContext http, CancellationToken ct) => Versioned(http, await s.ChangeStatusAsync(id, OfferStatus.Archived, Version(http), ct))).Produces<OfferDto>();
        var coaches = endpoints.MapGroup("/api/v1/coaches/{coachId:guid}/offers").WithTags("Offers").RequireAuthorization();
        coaches.MapGet("", (Guid coachId, int? page, int? pageSize, string? search, string? category, string? sort, OffersService s, CancellationToken ct) => s.PublicListAsync(coachId, page ?? 1, pageSize ?? 25, search, category, sort ?? "updated", ct));
        coaches.MapGet("/{offerId:guid}", (Guid coachId, Guid offerId, OffersService s, CancellationToken ct) => s.PublicDetailAsync(coachId, offerId, ct));
        return endpoints;
    }
    private static long Version(HttpContext http) => RequestPreconditions.RequireVersion(http.Request);
    private static IResult Versioned(HttpContext http, OfferDto dto)
    {
        http.Response.Headers.ETag = $"\"{dto.Version}\"";
        return Results.Ok(dto);
    }
}
