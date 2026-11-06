using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Accounts.Domain;
using Metrivum.Accounts.Infrastructure;

namespace Metrivum.IntegrationTests;

public sealed class PersonProfileTests
{
    [CatalogPostgresFact]
    public async Task Public_profile_shows_only_public_fields_and_hides_unavailable_accounts()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        using var factory = new ApiFactory(database);
        using var http = factory.CreateClient();
        var actor = Guid.NewGuid();
        var prefix = "p" + actor.ToString("N")[..10];
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(actor));
        (await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = prefix + "self", displayName = "Self", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Coach", phone = "+48 600 100 200", phoneVisibleToCoach = true })).EnsureSuccessStatusCode();

        // The owner sets an introduction; it is trimmed and a blank one clears it.
        var me = await http.GetAsync("/api/v1/me");
        var version = me.Headers.ETag!.Tag;
        using (var update = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me") { Content = JsonContent.Create(new { displayName = "Self", locale = "en", timeZone = "UTC", bio = "  Strength coach.  " }) })
        {
            update.Headers.TryAddWithoutValidation("If-Match", version);
            var updated = await http.SendAsync(update);
            Assert.True(updated.IsSuccessStatusCode, await updated.Content.ReadAsStringAsync());
            Assert.Equal("Strength coach.", (await updated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("bio").GetString());
        }

        await using var db = new AccountsDbContext(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(database).Options);
        foreach (var suffix in new[] { "client", "disabled", "draft" })
        {
            var id = Guid.NewGuid();
            db.Profiles.Add(new Profile { Id = id, Username = prefix + suffix, NormalizedUsername = (prefix + suffix).ToUpperInvariant(), DisplayName = suffix, Bio = "Hi", Phone = "+48 600 000 000", BirthDate = new DateOnly(1991, 2, 3), Active = suffix != "disabled", Onboarded = suffix != "draft" });
            db.Roles.Add(new UserRole { UserId = id, Role = "Client" });
        }
        await db.SaveChangesAsync();

        var person = await http.GetFromJsonAsync<JsonElement>($"/api/v1/accounts/people/%40{prefix.ToUpperInvariant()}CLIENT");
        Assert.Equal(new[] { "bio", "coverStyle", "displayName", "hasAvatar", "isSelf", "memberSince", "roles", "userId", "username" }, person.EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal(prefix + "client", person.GetProperty("username").GetString());
        Assert.False(person.GetProperty("isSelf").GetBoolean());
        Assert.False(person.GetProperty("hasAvatar").GetBoolean());
        Assert.Equal(["Client"], person.GetProperty("roles").EnumerateArray().Select(x => x.GetString()));

        var self = await http.GetFromJsonAsync<JsonElement>($"/api/v1/accounts/people/{prefix}self");
        Assert.True(self.GetProperty("isSelf").GetBoolean());
        Assert.Equal("Strength coach.", self.GetProperty("bio").GetString());
        // Joined date comes from onboarding (terms acceptance).
        Assert.Equal(JsonValueKind.String, self.GetProperty("memberSince").ValueKind);

        // Missing, disabled and unfinished accounts are indistinguishable.
        foreach (var name in new[] { prefix + "disabled", prefix + "draft", prefix + "nobody", "ab", new string('a', 40) })
        {
            var missing = await http.GetAsync($"/api/v1/accounts/people/{name}");
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        }

        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/accounts/people/{prefix}client")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Introduction_longer_than_the_limit_is_refused()
    {
        var database = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;
        using var factory = new ApiFactory(database);
        using var http = factory.CreateClient();
        var actor = Guid.NewGuid();
        http.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(actor));
        (await http.PutAsJsonAsync("/api/v1/me/onboarding", new { username = "b" + actor.ToString("N")[..20], displayName = "Bio", birthDate = "1990-01-01", acceptedTerms = true, locale = "en", timeZone = "UTC", role = "Client" })).EnsureSuccessStatusCode();
        var version = (await http.GetAsync("/api/v1/me")).Headers.ETag!.Tag;
        // Line breaks are kept (CRLF as LF, at most one empty line), tabs become spaces, emoji joiners stay.
        using (var ok = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me") { Content = JsonContent.Create(new { displayName = "Bio", locale = "en", timeZone = "UTC", bio = "Line\tone \r\n\r\n\r\nLine two 👩‍💻" }) })
        {
            ok.Headers.TryAddWithoutValidation("If-Match", version);
            var saved = await http.SendAsync(ok);
            Assert.True(saved.IsSuccessStatusCode, await saved.Content.ReadAsStringAsync());
            Assert.Equal("Line one\n\nLine two 👩‍💻", (await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("bio").GetString());
            version = saved.Headers.ETag!.Tag;
        }
        foreach (var bio in new[] { new string('x', 501), "bad\u0007bell", "safe‮evil", "zero​width" })
        {
            using var update = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me") { Content = JsonContent.Create(new { displayName = "Bio", locale = "en", timeZone = "UTC", bio }) };
            update.Headers.TryAddWithoutValidation("If-Match", version);
            Assert.Equal(HttpStatusCode.BadRequest, (await http.SendAsync(update)).StatusCode);
        }
    }
}
