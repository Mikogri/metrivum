using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Billing.Infrastructure;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.IntegrationTests;

public sealed partial class OffersBillingTests
{
    [CatalogPostgresFact]
    public async Task Team_member_pages_preserve_full_roster_and_reject_nonmembers()
    {
        await using var isolated = await IsolatedDatabase.CreateAsync();
        var owner = Guid.NewGuid();
        var clock = new Clock(DateTimeOffset.UtcNow);
        await using var services = TeamServices(owner, isolated.Connection, clock);
        await using var scope = services.CreateAsyncScope();
        var billing = TeamBilling(scope);
        var quote = await billing.QuoteAsync(new("Paged roster", 3, "eur-monthly-v3-Team"), default);
        var teamId = (await billing.ConfirmAsync(new(quote.Id, "create"), default)).TeamId;
        var team = Organization(scope, owner, clock);
        foreach (var user in new[] { Guid.NewGuid(), Guid.NewGuid() })
        {
            var invitation = await team.RequestAsync(teamId, new(user.ToString()), default);
            await Organization(scope, user, clock).DecideAsync(invitation.Id, true, default);
        }
        var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var expected = await db.TeamMemberships.AsNoTracking().Where(x => x.TeamId == teamId && x.Status == "Active")
            .OrderBy(x => x.JoinedAt).ThenBy(x => x.UserId).Select(x => x.UserId).ToArrayAsync();
        Assert.Equal(3, (await team.MembersAsync(teamId, default)).Length);
        Assert.Equal(expected.Take(2), (await team.MembersAsync(teamId, default, 1, 2)).Select(x => x.UserId));
        Assert.Equal(expected.Skip(2), (await team.MembersAsync(teamId, default, 2, 2)).Select(x => x.UserId));
        Assert.Empty(await team.MembersAsync(teamId, default, 3, 2));
        var outsider = Organization(scope, Guid.NewGuid(), clock);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => outsider.MembersAsync(teamId, default, 1, 2))).Status);
        foreach (var (page, size) in new[] { (0, 25), (1000001, 25), (1, 0), (1, 101) })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => team.MembersAsync(teamId, default, page, size))).Status);
    }
}
