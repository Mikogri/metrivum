using System.Reflection;
using Metrivum.Access.Infrastructure;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Analytics;
using Metrivum.Billing.Infrastructure;
using Metrivum.Calendar.Infrastructure;
using Metrivum.CheckIns.Infrastructure;
using Metrivum.Coaching.Infrastructure;
using Metrivum.ExerciseCatalog.Infrastructure;
using Metrivum.Forms.Infrastructure;
using Metrivum.Media.Infrastructure;
using Metrivum.Messaging.Infrastructure;
using Metrivum.Notifications;
using Metrivum.Offers.Infrastructure;
using Metrivum.Training.Infrastructure;
using Metrivum.VideoAnalysis.Infrastructure;

namespace Metrivum.ArchitectureTests;

public class ModuleBoundaryTests
{
    private static readonly Assembly[] Modules =
    [
        typeof(AccountsDbContext).Assembly,
        typeof(AccessDbContext).Assembly,
        typeof(ExerciseCatalogDbContext).Assembly,
        typeof(TrainingDbContext).Assembly,
        typeof(MediaDbContext).Assembly,
        typeof(VideoAnalysisDbContext).Assembly,
        typeof(CoachingDbContext).Assembly,
        typeof(FormsDbContext).Assembly,
        typeof(OffersDbContext).Assembly,
        typeof(BillingDbContext).Assembly,
        typeof(CheckInsDbContext).Assembly,
        typeof(CalendarDbContext).Assembly,
        typeof(MessagingDbContext).Assembly,
        typeof(NotificationsDbContext).Assembly,
        typeof(Metrivum.Analytics.ModuleRegistration).Assembly,
        typeof(Metrivum.ClientDocumentation.Infrastructure.DocumentationDbContext).Assembly,
        typeof(Metrivum.Integrations.Infrastructure.IntegrationsDbContext).Assembly,
    ];

    [Fact]
    public void Modules_reference_only_contracts_of_other_modules()
    {
        var names = Modules.Select(x => x.GetName().Name).ToHashSet();
        foreach (var module in Modules)
            Assert.DoesNotContain(
                module.GetReferencedAssemblies(),
                reference => names.Contains(reference.Name)
            );
    }

    [Fact]
    public void Domain_public_contracts_do_not_expose_framework_or_provider_types()
    {
        foreach (
            var type in Modules
                .SelectMany(x => x.GetTypes())
                .Where(x => x.Namespace?.Contains(".Domain") == true)
        )
        {
            var exposed = type.GetProperties()
                .Select(x => x.PropertyType)
                .Concat(type.GetInterfaces())
                .Concat(type.BaseType is { } parent ? [parent] : [])
                .Concat(type.GetGenericArguments())
                .Concat(
                    type.GetFields(
                            BindingFlags.Public
                                | BindingFlags.DeclaredOnly
                                | BindingFlags.Instance
                                | BindingFlags.Static
                        )
                        .Select(x => x.FieldType)
                )
                .Concat(
                    type.GetConstructors()
                        .SelectMany(x => x.GetParameters().Select(p => p.ParameterType))
                )
                .Concat(
                    type.GetMethods(
                            BindingFlags.Public
                                | BindingFlags.DeclaredOnly
                                | BindingFlags.Instance
                                | BindingFlags.Static
                        )
                        .SelectMany(x =>
                            x.GetParameters()
                                .Select(p => p.ParameterType)
                                .Append(x.ReturnType)
                                .Concat(x.GetGenericArguments())
                        )
                );
            Assert.DoesNotContain(exposed.SelectMany(TypeClosure), IsProviderType);
        }
    }

    [Fact]
    public void Contract_assemblies_do_not_reference_module_implementations_or_providers()
    {
        var names = Modules.Select(x => x.GetName().Name).ToHashSet();
        var contracts = Modules
            .SelectMany(x => x.GetReferencedAssemblies())
            .Where(x => x.Name?.EndsWith(".Contracts", StringComparison.Ordinal) == true)
            .DistinctBy(x => x.FullName)
            .Select(Assembly.Load)
            .ToArray();
        Assert.NotEmpty(contracts);
        foreach (var contract in contracts)
            Assert.DoesNotContain(
                contract.GetReferencedAssemblies(),
                reference =>
                    names.Contains(reference.Name)
                    || reference.Name?.StartsWith(
                        "Microsoft.EntityFrameworkCore",
                        StringComparison.Ordinal
                    ) == true
                    || reference.Name?.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
                        == true
                    || reference.Name?.StartsWith("Npgsql", StringComparison.Ordinal) == true
            );
    }

    [Theory]
    [InlineData(typeof(Task<IReadOnlyList<Microsoft.EntityFrameworkCore.DbContext[]>>), true)]
    [InlineData(typeof(Dictionary<string, Npgsql.NpgsqlConnection>), true)]
    [InlineData(typeof(Task<IReadOnlyList<DateOnly[]>>), false)]
    [InlineData(typeof(ProviderConstrained<>), true)]
    [InlineData(typeof(InheritedProvider), true)]
    public void Signature_guard_inspects_nested_generic_arguments_and_arrays(
        Type signature,
        bool rejected
    ) => Assert.Equal(rejected, TypeClosure(signature).Any(IsProviderType));

    private static IEnumerable<Type> TypeClosure(Type type)
    {
        return Visit(type, []);
        static IEnumerable<Type> Visit(Type type, HashSet<Type> visited)
        {
            if (!visited.Add(type))
                yield break;
            yield return type;
            if (type.HasElementType)
                foreach (var element in Visit(type.GetElementType()!, visited))
                    yield return element;
            foreach (var argument in type.GetGenericArguments())
            foreach (var nested in Visit(argument, visited))
                yield return nested;
            if (type.BaseType is { } parent)
                foreach (var nested in Visit(parent, visited))
                    yield return nested;
            foreach (var implemented in type.GetInterfaces())
            foreach (var nested in Visit(implemented, visited))
                yield return nested;
            if (type.IsGenericParameter)
                foreach (var constraint in type.GetGenericParameterConstraints())
                foreach (var nested in Visit(constraint, visited))
                    yield return nested;
        }
    }

    private static bool IsProviderType(Type type) =>
        type.Namespace?.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) == true
        || type.Namespace?.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
            == true
        || type.Namespace?.StartsWith("Npgsql", StringComparison.Ordinal) == true;

    private sealed class ProviderConstrained<T>
        where T : Microsoft.EntityFrameworkCore.DbContext;

    private sealed class InheritedProvider : Microsoft.EntityFrameworkCore.DbContext;
}
