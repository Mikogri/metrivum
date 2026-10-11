using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace TrainFlow.IntegrationTests;

public sealed class EndpointContractBoundaryTests
{
    [Fact]
    public void Module_models_match_checked_in_migration_snapshots()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var contexts = ModuleContexts();
        Assert.NotEmpty(contexts);
        foreach (var type in contexts)
        {
            var context = (DbContext)scope.ServiceProvider.GetRequiredService(type);
            Assert.False(context.Database.HasPendingModelChanges(), $"{type.Name} differs from its migration snapshot.");
        }
    }

    [Fact]
    public void Extracted_response_dtos_preserve_existing_json_properties_and_values()
    {
        var now = new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero);
        var category = new TrainFlow.Offers.Domain.OfferCategory { Key = "strength", Name = "Strength", Active = true };
        EqualJson(category, new TrainFlow.Offers.Features.OfferCategoryDto(category.Key, category.Name, category.Active));
        var change = new TrainFlow.Billing.Domain.PlanChange
        {
            Id = Guid.NewGuid(),
            SubscriptionId = Guid.NewGuid(),
            Type = "RenewalDisabled",
            PlanId = "Pro",
            DueId = null,
            CreatedAt = now,
            EffectiveAt = now.AddMonths(1)
        };
        EqualJson(change, new TrainFlow.Billing.Features.PlanChangeDto(change.Id, change.SubscriptionId, change.Type,
            change.PlanId, change.DueId, change.CreatedAt, change.EffectiveAt));
        var request = new TrainFlow.Billing.Domain.TeamRequest
        {
            Id = Guid.NewGuid(),
            TeamId = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            InviterId = Guid.NewGuid(),
            Kind = "Invite",
            Role = "Admin",
            Status = "Pending",
            CreatedAt = now,
            ExpiresAt = now.AddDays(7),
            DecidedAt = null
        };
        EqualJson(request, new TrainFlow.Billing.Features.TeamRequestResultDto(request.Id, request.TeamId, request.UserId,
            request.Kind, request.Status, request.CreatedAt, request.InviterId, request.Role, request.ExpiresAt, request.DecidedAt));

        static void EqualJson<TSource, TDto>(TSource source, TDto dto)
        {
            var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            Assert.True(JsonNode.DeepEquals(JsonSerializer.SerializeToNode(source, options), JsonSerializer.SerializeToNode(dto, options)));
        }
    }

    [Fact]
    public void Documented_response_graphs_do_not_expose_persisted_entities()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var contexts = ModuleContexts();
        Assert.NotEmpty(contexts);
        var entities = contexts.Select(type => (DbContext)scope.ServiceProvider.GetRequiredService(type))
            .SelectMany(context => context.Model.GetEntityTypes()).Select(x => x.ClrType).ToHashSet();
        var violations = new List<string>();
        foreach (var endpoint in factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>())
            foreach (var response in endpoint.Metadata.GetOrderedMetadata<IProducesResponseTypeMetadata>())
                foreach (var type in ResponseTypes(response.Type, []))
                    if (entities.Contains(type))
                        violations.Add($"{endpoint.RoutePattern.RawText} -> {type.FullName}");
        Assert.True(violations.Count == 0, string.Join(Environment.NewLine, violations));
    }

    private static Type[] ModuleContexts() => typeof(Program).Assembly.GetReferencedAssemblies()
        .Where(x => x.Name?.StartsWith("TrainFlow.", StringComparison.Ordinal) == true)
        .Select(Assembly.Load).SelectMany(x => x.GetTypes())
        .Where(x => !x.IsAbstract && typeof(DbContext).IsAssignableFrom(x)).ToArray();

    private static IEnumerable<Type> ResponseTypes(Type? type, HashSet<Type> seen)
    {
        if (type is null || !seen.Add(type))
            yield break;
        yield return type;
        if (type.HasElementType)
            foreach (var nested in ResponseTypes(type.GetElementType(), seen))
                yield return nested;
        foreach (var argument in type.GetGenericArguments())
            foreach (var nested in ResponseTypes(argument, seen))
                yield return nested;
        if (type.Namespace?.StartsWith("TrainFlow.", StringComparison.Ordinal) == true)
            foreach (var property in type.GetProperties())
                foreach (var nested in ResponseTypes(property.PropertyType, seen))
                    yield return nested;
    }
}
