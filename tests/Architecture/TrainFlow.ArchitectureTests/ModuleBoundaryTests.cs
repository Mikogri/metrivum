using TrainFlow.Notifications;
using TrainFlow.Analytics;
using TrainFlow.Messaging.Infrastructure;
using TrainFlow.Calendar.Infrastructure;
using System.Reflection;
using TrainFlow.Coaching.Infrastructure;
using TrainFlow.Forms.Infrastructure;
using TrainFlow.Offers.Infrastructure;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.CheckIns.Infrastructure;
using TrainFlow.Access.Infrastructure;
using TrainFlow.Accounts.Infrastructure;
using TrainFlow.ExerciseCatalog.Infrastructure;
using TrainFlow.Media.Infrastructure;
using TrainFlow.Training.Infrastructure;
using TrainFlow.VideoAnalysis.Infrastructure;

namespace TrainFlow.ArchitectureTests;

public class ModuleBoundaryTests
{
    [Fact]
    public void Modules_reference_only_contracts_of_other_modules()
    {
        Assembly[] modules = [typeof(AccountsDbContext).Assembly, typeof(AccessDbContext).Assembly,
            typeof(ExerciseCatalogDbContext).Assembly, typeof(TrainingDbContext).Assembly,
            typeof(MediaDbContext).Assembly, typeof(VideoAnalysisDbContext).Assembly, typeof(CoachingDbContext).Assembly, typeof(FormsDbContext).Assembly, typeof(OffersDbContext).Assembly, typeof(BillingDbContext).Assembly, typeof(CheckInsDbContext).Assembly, typeof(CalendarDbContext).Assembly, typeof(MessagingDbContext).Assembly, typeof(NotificationsDbContext).Assembly, typeof(TrainFlow.Analytics.ModuleRegistration).Assembly, typeof(TrainFlow.ClientDocumentation.Infrastructure.DocumentationDbContext).Assembly];
        var names = modules.Select(x => x.GetName().Name).ToHashSet();
        foreach (var module in modules)
            Assert.DoesNotContain(module.GetReferencedAssemblies(), reference => names.Contains(reference.Name));
    }

    [Fact]
    public void Domain_public_contracts_do_not_expose_framework_or_provider_types()
    {
        Assembly[] modules = [typeof(AccountsDbContext).Assembly, typeof(AccessDbContext).Assembly,
            typeof(ExerciseCatalogDbContext).Assembly, typeof(TrainingDbContext).Assembly,
            typeof(MediaDbContext).Assembly, typeof(VideoAnalysisDbContext).Assembly, typeof(CoachingDbContext).Assembly, typeof(FormsDbContext).Assembly, typeof(OffersDbContext).Assembly, typeof(BillingDbContext).Assembly, typeof(CheckInsDbContext).Assembly, typeof(CalendarDbContext).Assembly, typeof(MessagingDbContext).Assembly, typeof(NotificationsDbContext).Assembly, typeof(TrainFlow.Analytics.ModuleRegistration).Assembly, typeof(TrainFlow.ClientDocumentation.Infrastructure.DocumentationDbContext).Assembly];
        foreach (var type in modules.SelectMany(x => x.GetTypes()).Where(x => x.Namespace?.Contains(".Domain") == true))
        {
            var exposed = type.GetProperties().Select(x => x.PropertyType)
                .Concat(type.GetMethods(BindingFlags.Public | BindingFlags.DeclaredOnly | BindingFlags.Instance | BindingFlags.Static)
                    .SelectMany(x => x.GetParameters().Select(p => p.ParameterType).Append(x.ReturnType)));
            Assert.DoesNotContain(exposed, t => t.Namespace?.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) == true ||
                t.Namespace?.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) == true ||
                t.Namespace?.StartsWith("Npgsql", StringComparison.Ordinal) == true);
        }
    }
}
