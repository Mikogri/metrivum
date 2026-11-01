using Microsoft.EntityFrameworkCore;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;
using Metrivum.Messaging.Domain;
using Metrivum.Messaging.Features;
using Metrivum.Messaging.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class AccountNameSearchTests
{
    [CatalogPostgresFact]
    public async Task General_autocomplete_requires_an_active_account_and_returns_only_public_active_profiles()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        using var factory = new ApiFactory(database);
        using var http = factory.CreateClient();
        var actor = Guid.NewGuid(); var prefix = "u" + actor.ToString("N")[..10];
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(actor));
        (await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = prefix + "self", displayName = "Self", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Coach" })).EnsureSuccessStatusCode();
        await using var db = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(database).Options);
        foreach (var suffix in new[] { "active", "disabled", "draft" })
            db.Profiles.Add(new Profile { Id = Guid.NewGuid(), Username = prefix + suffix, NormalizedUsername = (prefix + suffix).ToUpperInvariant(), DisplayName = suffix, Active = suffix != "disabled", Onboarded = suffix != "draft" });
        await db.SaveChangesAsync();
        var rows = await http.GetFromJsonAsync<JsonElement>("/api/v1/accounts/people?search=%40" + prefix);
        var row = Assert.Single(rows.EnumerateArray());
        Assert.Equal(prefix + "active", row.GetProperty("username").GetString());
        Assert.Equal(new[] { "displayName", "userId", "username" }, row.EnumerateObject().Select(p => p.Name).Order());
        Assert.Empty((await http.GetFromJsonAsync<JsonElement>("/api/v1/accounts/people?search=a")).EnumerateArray());
        using var anonymous = factory.CreateClient();
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/accounts/people?search=" + prefix)).StatusCode);
        await db.Profiles.Where(p => p.Id == actor).ExecuteUpdateAsync(s => s.SetProperty(p => p.Active, false));
        Assert.Equal(System.Net.HttpStatusCode.Forbidden, (await http.GetAsync("/api/v1/accounts/people?search=" + prefix)).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Conversation_search_filters_membership_and_names_before_the_result_limit()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        using var factory = new ApiFactory(database);
        using var http = factory.CreateClient();
        var actor = Guid.NewGuid();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(actor));
        var onboarding = await http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = "s" + actor.ToString("N")[..25],
            displayName = "Search owner",
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC",
            role = "Coach"
        });
        Assert.True(onboarding.IsSuccessStatusCode, await onboarding.Content.ReadAsStringAsync());
        await using var accounts = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(database).Options);
        await using var messaging = new MessagingDbContext(new DbContextOptionsBuilder<MessagingDbContext>().UseNpgsql(database).Options);
        var expected = new List<Guid>();
        var now = DateTimeOffset.UtcNow;
        for (var i = 0; i < 140; i++)
        {
            var peer = Guid.NewGuid();
            var isMatch = i >= 110;
            var pair = MessagingRules.Pair(actor, peer);
            accounts.Profiles.Add(new()
            {
                Id = peer,
                DisplayName = isMatch ? "Prefix needle_% suffix" : "Other",
                Onboarded = true
            });
            accounts.Workspaces.Add(new()
            {
                Id = Guid.NewGuid(),
                OwnerId = peer
            });
            var conversation = new Conversation { Type = ConversationType.Direct, PairFirst = pair.First, PairSecond = pair.Second, CreatedAt = now.AddMinutes(-i), UpdatedAt = now };
            messaging.Conversations.Add(conversation);
            messaging.Members.Add(new()
            {
                ConversationId = conversation.Id,
                UserId = actor,
                Source = MemberSource.Direct,
                JoinedAt = now
            });
            messaging.Members.Add(new()
            {
                ConversationId = conversation.Id,
                UserId = peer,
                Source = MemberSource.Direct,
                JoinedAt = now
            });
            if (isMatch)
                expected.Add(conversation.Id);
        }
        var ownGroup = new Conversation { Type = ConversationType.Group, Title = "NEEDLE_% group", CreatedAt = now.AddMinutes(1), UpdatedAt = now };
        messaging.Conversations.Add(ownGroup);
        messaging.Members.Add(new()
        {
            ConversationId = ownGroup.Id,
            UserId = actor,
            Source = MemberSource.Manual,
            JoinedAt = now
        });
        messaging.Conversations.Add(new()
        {
            Type = ConversationType.Group,
            Title = "NEEDLE_% private",
            CreatedAt = now.AddMinutes(2),
            UpdatedAt = now
        });
        await accounts.SaveChangesAsync();
        await messaging.SaveChangesAsync();
        var path = "/api/v1/messaging/conversations?search=" + Uri.EscapeDataString("nEeDlE_%");
        var rows = await http.GetFromJsonAsync<JsonElement>(path + "&limit=100");
        Assert.Equal(expected.Prepend(ownGroup.Id), rows.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()));
        var limited = await http.GetFromJsonAsync<JsonElement>(path + "&limit=1");
        Assert.Equal(ownGroup.Id, Assert.Single(limited.EnumerateArray()).GetProperty("id").GetGuid());
    }

    [CatalogPostgresFact]
    public async Task Name_search_filters_eligible_ids_in_sql_without_autocomplete_limit_or_wildcards()
    {
        await using var db = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")).Options);
        var profiles = Enumerable.Range(0, 35).Select(i => new Profile
        {
            Id = Guid.NewGuid(),
            DisplayName = "Prefix NEEDLE_%\\ Suffix",
            Onboarded = true,
            Username = "s" + Guid.NewGuid().ToString("N")[..25]
        }).ToArray();
        foreach (var p in profiles)
        {
            p.NormalizedUsername = p.Username!.ToUpperInvariant();
            db.Profiles.Add(p);
            db.Workspaces.Add(new()
            {
                Id = Guid.NewGuid(),
                OwnerId = p.Id
            });
        }
        profiles[0].Active = false;
        profiles[1].Onboarded = false;
        profiles[2].DisplayName = "Prefix NEEDLEab Suffix";
        var missingWorkspace = new Profile { Id = Guid.NewGuid(), DisplayName = "NEEDLE_%\\", Onboarded = true };
        db.Profiles.Add(missingWorkspace);
        await db.SaveChangesAsync();
        var directory = new AccountDirectory(db);
        var eligibleIds = profiles.Select(p => p.Id).Append(missingWorkspace.Id).ToArray();
        var matches = await directory.FindNameMatchesAsync(eligibleIds, "needle_%\\", default);
        Assert.Equal(profiles.Skip(3).Select(p => p.Id).Order(), matches.Order());
        Assert.Empty(await directory.FindNameMatchesAsync([], "needle", default));
        Assert.Equal([profiles[3].Id], await directory.FindNameMatchesAsync(eligibleIds, profiles[3].Username![3..15].ToUpperInvariant(), default));
        Assert.Empty(await directory.FindNameMatchesAsync(eligibleIds, "  needle_%\\  ", default));
    }
}
