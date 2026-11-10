using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Metrivum.Accounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Metrivum.IntegrationTests;

/// <summary>Account identity rules through the real HTTP pipeline and PostgreSQL, including direct-API bypass attempts.</summary>
public sealed class AccountIdentityTests
{
    [CatalogPostgresTheory]
    [InlineData("admin", "USERNAME_RESERVED")]
    [InlineData("Metrivum_Support", "USERNAME_RESERVED")]
    [InlineData("_hidden", "USERNAME_INVALID")]
    [InlineData("a__b", "USERNAME_INVALID")]
    [InlineData("9lives", "USERNAME_INVALID")]
    [InlineData("anna.k", "USERNAME_INVALID")]
    [InlineData("аdmin", "USERNAME_INVALID")] // Cyrillic look-alike.
    public async Task Onboarding_rejects_invalid_and_reserved_usernames(
        string username,
        string code
    )
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        var response = await client.PutAsJsonAsync(
            "/api/v1/me/onboarding",
            Onboarding(username, "Test Coach")
        );
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await Json(response);
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("errors").TryGetProperty("username", out _));
        using var db = Accounts();
        Assert.False(await db.Profiles.AnyAsync(x => x.Id == user && x.Onboarded));
    }

    [CatalogPostgresFact]
    public async Task Onboarding_and_profile_updates_store_the_normalised_display_name()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out var user);
        var onboarded = await client.PutAsJsonAsync(
            "/api/v1/me/onboarding",
            Onboarding(Name(user), "  René   Kowalski ")
        );
        Assert.Equal(HttpStatusCode.OK, onboarded.StatusCode);
        Assert.Equal(
            "René Kowalski",
            (await Json(onboarded)).GetProperty("displayName").GetString()
        );

        foreach (var hidden in new[] { "Admin‮nimda", "Coach​Team", "Line\nBreak" })
        {
            var current = await client.GetAsync("/api/v1/me");
            using var update = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/me")
            {
                Content = JsonContent.Create(
                    new
                    {
                        displayName = hidden,
                        locale = "en",
                        timeZone = "UTC",
                    }
                ),
            };
            update.Headers.IfMatch.Add(current.Headers.ETag!);
            var rejected = await client.SendAsync(update);
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
            Assert.Equal(
                "DISPLAY_NAME_INVALID",
                (await Json(rejected)).GetProperty("code").GetString()
            );
        }
        using var db = Accounts();
        Assert.Equal(
            "René Kowalski",
            await db.Profiles.Where(x => x.Id == user).Select(x => x.DisplayName).SingleAsync()
        );
    }

    [CatalogPostgresFact]
    public async Task Username_is_unique_regardless_of_case_even_for_concurrent_claims()
    {
        using var factory = new ApiFactory(Database);
        using var first = Client(factory, out var firstUser);
        using var second = Client(factory, out _);
        using var third = Client(factory, out _);
        var name = Name(firstUser);
        var results = await Task.WhenAll(
            first.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(name, "First")),
            second.PutAsJsonAsync(
                "/api/v1/me/onboarding",
                Onboarding(name.ToUpperInvariant(), "Second")
            )
        );
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        var conflict = Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal("USERNAME_TAKEN", (await Json(conflict)).GetProperty("code").GetString());

        var later = await third.PutAsJsonAsync("/api/v1/me/onboarding", Onboarding(name, "Third"));
        Assert.Equal(HttpStatusCode.Conflict, later.StatusCode);
        Assert.Equal("USERNAME_TAKEN", (await Json(later)).GetProperty("code").GetString());
        using var db = Accounts();
        Assert.Equal(
            1,
            await db.Profiles.CountAsync(x => x.NormalizedUsername == name.ToUpperInvariant())
        );
    }

    [CatalogPostgresFact]
    public async Task Database_rejects_identity_rows_that_bypass_the_application()
    {
        var id = Guid.NewGuid();
        await using var connection = new NpgsqlConnection(Database);
        await connection.OpenAsync();
        async Task<string?> Insert(
            string username,
            string normalized,
            string displayName,
            bool onboarded
        )
        {
            await using var command = new NpgsqlCommand(
                """
                INSERT INTO accounts.profiles ("Id", "Username", "NormalizedUsername", "DisplayName", "Locale", "TimeZone", "Onboarded", "Active", "Version")
                VALUES (@id, @username, @normalized, @display, 'en', 'UTC', @onboarded, true, 1)
                """,
                connection
            );
            command.Parameters.AddWithValue("id", Guid.NewGuid());
            command.Parameters.AddWithValue("username", username);
            command.Parameters.AddWithValue("normalized", normalized);
            command.Parameters.AddWithValue("display", displayName);
            command.Parameters.AddWithValue("onboarded", onboarded);
            try
            {
                await command.ExecuteNonQueryAsync();
                return null;
            }
            catch (PostgresException error)
                when (error.SqlState == PostgresErrorCodes.CheckViolation)
            {
                return error.ConstraintName;
            }
        }
        var suffix = id.ToString("N")[..10];
        Assert.Equal(
            "CK_profiles_username_shape",
            await Insert(
                "bad name " + suffix,
                "BAD NAME " + suffix.ToUpperInvariant(),
                "Name",
                true
            )
        );
        Assert.Equal(
            "CK_profiles_username_normalized",
            await Insert("ok" + suffix, "other" + suffix, "Name", true)
        );
        Assert.Equal(
            "CK_profiles_display_name",
            await Insert("ok" + suffix, "OK" + suffix.ToUpperInvariant(), " Padded ", true)
        );
        // The failing statement is atomic and does not depend on profiles created by other tests.
        await using var role = new NpgsqlCommand(
            """
            WITH fixture AS (
                INSERT INTO accounts.profiles ("Id", "DisplayName", "Locale", "TimeZone", "Onboarded", "Active", "Version")
                VALUES (gen_random_uuid(), '', 'en', 'UTC', false, true, 1) RETURNING "Id"
            )
            INSERT INTO accounts.user_roles ("UserId", "Role") SELECT "Id", 'SuperAdmin' FROM fixture
            """,
            connection
        );
        var violation = await Assert.ThrowsAsync<PostgresException>(() =>
            role.ExecuteNonQueryAsync()
        );
        Assert.Equal("CK_user_roles_role", violation.ConstraintName);
    }

    [CatalogPostgresFact]
    public async Task Onboarding_attempts_are_rate_limited_per_user()
    {
        using var factory = new ApiFactory(Database);
        using var client = Client(factory, out _);
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 11; i++)
            statuses.Add(
                (
                    await client.PutAsJsonAsync(
                        "/api/v1/me/onboarding",
                        Onboarding("admin", "Probe")
                    )
                ).StatusCode
            );
        Assert.All(statuses.Take(10), status => Assert.Equal(HttpStatusCode.BadRequest, status));
        var limited = await client.PutAsJsonAsync(
            "/api/v1/me/onboarding",
            Onboarding("admin", "Probe")
        );
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter is not null);
        Assert.Equal("RATE_LIMIT_EXCEEDED", (await Json(limited)).GetProperty("code").GetString());

        // Another person is not affected by this user's window.
        using var other = Client(factory, out var otherUser);
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await other.PutAsJsonAsync(
                    "/api/v1/me/onboarding",
                    Onboarding(Name(otherUser), "Other")
                )
            ).StatusCode
        );
    }

    private static string Name(Guid user) => $"id{user:N}"[..24];

    private static object Onboarding(string username, string displayName) =>
        new
        {
            username,
            displayName,
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC",
        };

    private static string Database =>
        Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;

    private static AccountsDbContext Accounts() =>
        new(new DbContextOptionsBuilder<AccountsDbContext>().UseNpgsql(Database).Options);

    private static HttpClient Client(ApiFactory factory, out Guid user)
    {
        user = Guid.NewGuid();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.Token(user));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();
}
