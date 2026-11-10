using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.ExerciseCatalog.Features;
using Metrivum.ExerciseCatalog.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.UnitTests;

public sealed class CatalogValidationTests
{
    [Theory]
    [InlineData("", "", null)]
    [InlineData("  \t ", "", null)]
    [InlineData("Squat", "", "http://example.com/demo.mp4")]
    [InlineData("Squat", "", "https://user:password@example.com/demo.mp4")]
    [InlineData("Squat", "\0", null)]
    public async Task Invalid_input_is_rejected_before_database_access(
        string name,
        string instructions,
        string? url
    )
    {
        using var db = Database();
        var service = new CatalogService(db, new Account(), new Features());
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateAsync(
                new(name, Instructions: instructions, DemonstrationUrl: url),
                default
            )
        );
        Assert.Equal(400, exception.Status);
        Assert.Empty(db.ChangeTracker.Entries());
    }

    [Fact]
    public async Task Invalid_unicode_description_is_validation_error()
    {
        using var db = Database();
        var service = new CatalogService(db, new Account(), new Features());
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateAsync(new("Squat", new string((char)0xD800, 1)), default)
        );
        Assert.Equal(400, exception.Status);
    }

    [Fact]
    public async Task A_muscle_cannot_be_both_primary_and_secondary()
    {
        using var db = Database();
        var service = new CatalogService(db, new Account(), new Features());
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateAsync(
                new("Squat", PrimaryMuscleKeys: ["glutes"], SecondaryMuscleKeys: ["glutes"]),
                default
            )
        );
        Assert.Equal(400, exception.Status);
    }

    [Fact]
    public async Task Invalid_pagination_is_rejected_before_database_access()
    {
        using var db = Database();
        var service = new CatalogService(db, new Account(), new Features());
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            service.ListAsync(new() { PageSize = 101 }, default)
        );
        Assert.Equal(400, exception.Status);
    }

    private static ExerciseCatalogDbContext Database() =>
        new(
            new DbContextOptionsBuilder<ExerciseCatalogDbContext>()
                .UseNpgsql("Host=127.0.0.1;Port=1;Database=unreachable;Username=unused;Timeout=1")
                .Options
        );

    private sealed class Account : IAccountContext
    {
        public Guid UserId { get; } = Guid.NewGuid();

        public Task<AccountIdentity> RequireClientAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(
            CancellationToken cancellationToken
        ) => Task.FromResult<IReadOnlyList<AccountRole>>([AccountRole.Coach]);

        public Task<AccountIdentity> RequireCoachAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new AccountIdentity(UserId, UserId));

        public Task RequireAdminAsync(string permission, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }

    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}
