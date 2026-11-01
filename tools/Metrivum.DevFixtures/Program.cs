using Metrivum.Analytics;
using Metrivum.Notifications;
using Metrivum.Media;
using Metrivum.Messaging;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Metrivum.Accounts;
using Metrivum.Accounts.Contracts;
using Metrivum.Access;
using Metrivum.Coaching;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Features;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Forms;
using Metrivum.Offers;
using Metrivum.Billing;
using Metrivum.CheckIns;

// This executable is deliberately separate from the normal JWT-authenticated API.
var builder = Host.CreateApplicationBuilder(args);
if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
    throw new InvalidOperationException("Dev fixtures require Development or Testing.");
if (builder.Configuration["settings"] is { } settings)
    builder.Configuration.AddJsonFile(Path.GetFullPath(settings), optional: false);
builder.Configuration.AddEnvironmentVariables().AddCommandLine(args);
var connection = new NpgsqlConnectionStringBuilder(builder.Configuration.GetConnectionString("Database")
    ?? throw new InvalidOperationException("Set ConnectionStrings__Database to the restricted development runtime connection."));
var local = connection.Host is "localhost" or "127.0.0.1" or "::1";
var confirmedProject = builder.Configuration["confirm-project"];
if (local)
{
    if (connection.Database is not { } name || !(name.Contains("test", StringComparison.OrdinalIgnoreCase) || name.Contains("dev", StringComparison.OrdinalIgnoreCase)))
        throw new InvalidOperationException("Local fixture database names must include dev or test.");
}
else if (confirmedProject != "atclvdkpbccafakzpwls" || connection.Host != "aws-0-eu-west-1.pooler.supabase.com" ||
    connection.Database != "postgres" || connection.Username != "trainflow_api.atclvdkpbccafakzpwls" || connection.SslMode != SslMode.VerifyFull)
    throw new InvalidOperationException("Remote fixtures require explicit confirmation of the recorded development project and its restricted TLS connection.");
if (builder.Configuration["confirm-test-accounts"] != "true")
    throw new InvalidOperationException("Pass --confirm-test-accounts true only for four existing, onboarded Supabase test accounts.");
Guid ReadId(string key) => Guid.TryParse(builder.Configuration[key], out var id) && id != Guid.Empty
    ? id : throw new InvalidOperationException($"Supply --{key} with an existing onboarded test account ID.");
var ids = new[] { ReadId("coach-a"), ReadId("coach-b"), ReadId("client-c"), ReadId("client-d") };
if (ids.Distinct().Count() != 4) throw new InvalidOperationException("Four distinct test accounts are required.");
var stage = builder.Configuration["stage"] ?? "1";
if (stage is not ("1" or "2" or "3a" or "4")) throw new InvalidOperationException("Use --stage 1, --stage 2, --stage 3a, or --stage 4.");
Guid? userE = builder.Configuration["user-e"] is null ? null : ReadId("user-e");
if (userE.HasValue && ids.Contains(userE.Value)) throw new InvalidOperationException("User E must be distinct from the four coaching test accounts.");
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connection.ConnectionString));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHttpContextAccessor();
builder.Services.AddAccounts(builder.Configuration).AddAccess(builder.Configuration).AddCoaching(builder.Configuration)
    .AddForms(builder.Configuration).AddOffers(builder.Configuration).AddBilling(builder.Configuration).AddCheckIns(builder.Configuration).AddCoachingIntake().AddMedia(builder.Configuration).AddMessaging(builder.Configuration).AddNotifications(builder.Configuration).AddAnalyticsModule(builder.Configuration);
using var host = builder.Build();
await using var scope = host.Services.CreateAsyncScope();
var services = scope.ServiceProvider;
await using (var guard = services.GetRequiredService<NpgsqlDataSource>().CreateCommand("""
    SELECT current_user = 'trainflow_api' AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
    FROM pg_roles WHERE rolname = current_user
    """))
    if (await guard.ExecuteScalarAsync() is not true)
        throw new InvalidOperationException("Fixtures require the restricted trainflow_api database role.");
var allTestIds = userE.HasValue ? ids.Append(userE.Value).ToArray() : ids;
var people = await services.GetRequiredService<IAccountDirectory>().GetAccountsAsync(allTestIds, default);
if (people.Count != allTestIds.Length || !ids.Take(2).All(id => people[id].Roles.Contains(AccountRole.Coach)) || !ids.Skip(2).All(id => people[id].Roles.Contains(AccountRole.Client)))
    throw new InvalidOperationException("Both coaches and clients must already be active and onboarded with the required roles.");
var activation = services.GetRequiredService<IRelationshipActivation>();
var ac = await activation.ActivateDevFixtureAsync(ids[0], ids[2], default);
var ad = await activation.ActivateDevFixtureAsync(ids[0], ids[3], default);
var bc = await activation.ActivateDevFixtureAsync(ids[1], ids[2], default);
services.GetRequiredService<IHttpContextAccessor>().HttpContext = new DefaultHttpContext
{
    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", ids[0].ToString())], "DevFixtureConsole"))
};
var db = services.GetRequiredService<CoachingDbContext>();
var service = services.GetRequiredService<CoachingService>();
foreach (var (name, members) in new[] { ("DevFixture Group A1", new[] { ac, ad }), ("DevFixture Group A2", new[] { ac }) })
{
    var existing = await db.Groups.AsNoTracking().SingleOrDefaultAsync(g => g.CoachId == ids[0] && g.Name == name);
    var group = existing is null ? await service.CreateGroupAsync(new(name, "Stage 01 test accounts only", "#2563EB"), default) : await service.GroupAsync(existing.Id, default);
    if (group.Archived)
        group = await service.ArchiveGroupAsync(group.Id, false, group.Version, default);
    foreach (var relationship in members)
        group = await service.MembershipAsync(group.Id, relationship, true, group.Version, default);
}
Console.WriteLine($"DevFixture ready: A->C {ac}, A->D {ad}, B->C {bc}; two Coach A groups. No Auth accounts or consent records were created.");
if (stage == "2") await StageTwoFixture.RunAsync(host.Services, ids);
if (stage == "3a") await StageThreeMessagingFixture.RunAsync(host.Services, ids, userE, builder.Configuration);


if (stage == "4") await StageFourFixture.RunAsync(host.Services, ids);
