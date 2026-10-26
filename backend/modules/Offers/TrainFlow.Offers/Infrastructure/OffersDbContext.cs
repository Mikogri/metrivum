using TrainFlow.Offers.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using TrainFlow.Offers.Domain;

namespace TrainFlow.Offers.Infrastructure;

public sealed class OffersDbContext(DbContextOptions<OffersDbContext> options) : DbContext(options)
{
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<OfferCategory> Categories => Set<OfferCategory>();
    public DbSet<OfferTag> Tags => Set<OfferTag>();
    public DbSet<OfferTagLink> TagLinks => Set<OfferTagLink>();
    public DbSet<OfferRevision> Revisions => Set<OfferRevision>();
    public DbSet<OfferBillingOption> Options => Set<OfferBillingOption>();
    public DbSet<RevisionBillingOption> RevisionOptions => Set<RevisionBillingOption>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("offers");
        model.Entity<Offer>().Property(x => x.Purpose).HasConversion<string>().HasMaxLength(32).HasDefaultValue(OfferPurpose.CoachingService);
        model.Entity<OfferRevision>().Property(x => x.Purpose).HasConversion<string>().HasMaxLength(32).HasDefaultValue(OfferPurpose.CoachingService);
        model.Entity<OfferBillingOption>().ToTable("billing_options", t => t.HasCheckConstraint("CK_option_validity", "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" NOT IN ('PeriodSubscription','OneTime'))"));
        model.Entity<RevisionBillingOption>().ToTable("revision_billing_options", t => t.HasCheckConstraint("CK_revision_option_validity", "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" NOT IN ('PeriodSubscription','OneTime'))"));
        model.Entity<Offer>().HasIndex(x => new { x.TeamId, x.Status, x.UpdatedAt });
        model.Entity<Offer>().HasIndex(x => new { x.CoachId, x.Id }).HasDatabaseName("IX_offers_PublishedCoachCard")
            .HasFilter("\"Status\" = 'Active' AND \"CurrentPublishedRevisionId\" IS NOT NULL");
        model.Entity<Offer>().Property(x => x.TeamName).HasMaxLength(200);
        model.Entity<OfferRevision>().Property(x => x.TeamName).HasMaxLength(200);
        model.Entity<OfferCategory>(e => { e.ToTable("categories"); e.HasKey(x => x.Key); e.Property(x => x.Key).HasMaxLength(60); e.Property(x => x.Name).HasMaxLength(120); e.HasData(new[] { "strength", "hypertrophy", "endurance", "general-fitness", "conditioning" }.Select(x => new OfferCategory { Key = x, Name = x, Active = true })); });
        model.Entity<Offer>(e => { e.ToTable("offers"); e.HasKey(x => x.Id); e.Property(x => x.Name).HasMaxLength(200); e.Property(x => x.Description).HasMaxLength(4000); e.Property(x => x.Category).HasMaxLength(60); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32); e.Property(x => x.CoachingMode).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Version).IsConcurrencyToken(); e.HasIndex(x => new { x.CoachId, x.Status, x.UpdatedAt }); e.HasOne<OfferCategory>().WithMany().HasForeignKey(x => x.Category).OnDelete(DeleteBehavior.Restrict); e.HasOne<OfferRevision>().WithMany().HasForeignKey(x => x.CurrentPublishedRevisionId).OnDelete(DeleteBehavior.Restrict); });
        model.Entity<OfferTag>(e => { e.ToTable("tags"); e.HasKey(x => x.Id); e.Property(x => x.Name).HasMaxLength(60); e.HasIndex(x => x.Name).IsUnique(); });
        model.Entity<OfferTagLink>(e => { e.ToTable("tag_links"); e.HasKey(x => new { x.OfferId, x.TagId }); e.HasOne<Offer>().WithMany().HasForeignKey(x => x.OfferId).OnDelete(DeleteBehavior.Restrict); e.HasOne<OfferTag>().WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Restrict); });
        model.Entity<OfferRevision>(e => { e.ToTable("revisions"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.OfferId, x.Number }).IsUnique(); e.HasIndex(x => new { x.OfferId, x.DraftVersion }).IsUnique(); e.Property(x => x.Name).HasMaxLength(200); e.Property(x => x.Description).HasMaxLength(4000); e.Property(x => x.Category).HasMaxLength(60); e.Property(x => x.CoachingMode).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Tags).HasColumnType("jsonb"); e.Property(x => x.Currency).HasMaxLength(3); e.HasOne<Offer>().WithMany().HasForeignKey(x => x.OfferId).OnDelete(DeleteBehavior.Restrict); });
        model.Entity<OfferBillingOption>(e => { e.ToTable("billing_options", t => { t.HasCheckConstraint("CK_option_price", "\"Price\" >= 0"); t.HasCheckConstraint("CK_option_shape", "(" + OptionShape + ") IS TRUE"); }); e.HasKey(x => x.Id); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.Model).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Price).HasPrecision(28, 2); e.Property(x => x.PeriodUnit).HasConversion<string>().HasMaxLength(16); e.Property(x => x.DueRule).HasConversion<string>().HasMaxLength(32); e.HasIndex(x => x.OfferId); e.HasOne<Offer>().WithMany().HasForeignKey(x => x.OfferId).OnDelete(DeleteBehavior.Restrict); });
        model.Entity<RevisionBillingOption>(e => { e.ToTable("revision_billing_options", t => { t.HasCheckConstraint("CK_revision_option_price", "\"Price\" >= 0"); t.HasCheckConstraint("CK_revision_option_shape", "(" + OptionShape + ") IS TRUE"); }); e.HasKey(x => new { x.RevisionId, x.Id }); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.Model).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Price).HasPrecision(28, 2); e.Property(x => x.PeriodUnit).HasConversion<string>().HasMaxLength(16); e.Property(x => x.DueRule).HasConversion<string>().HasMaxLength(32); e.HasOne<OfferRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict); });
    }
    private const string OptionShape = "(\"Model\" IN ('PerSession','OneTime') AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))";
    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        if (ChangeTracker.Entries().Any(x => x.Entity is OfferRevision or RevisionBillingOption && x.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Published offer terms are immutable.");
        return base.SaveChangesAsync(ct);
    }
}
public sealed class OffersDesignFactory : IDesignTimeDbContextFactory<OffersDbContext>
{
    public OffersDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<OffersDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured", o => o.MigrationsHistoryTable("__EFMigrationsHistory", "offers")).Options);
}
