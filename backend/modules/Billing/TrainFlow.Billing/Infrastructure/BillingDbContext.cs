using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using TrainFlow.Billing.Domain;

namespace TrainFlow.Billing.Infrastructure;

public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<PaymentDue> Dues => Set<PaymentDue>();
    public DbSet<PaymentMethod> Methods => Set<PaymentMethod>();
    public DbSet<PaymentAttempt> Attempts => Set<PaymentAttempt>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentTransaction> Transactions => Set<PaymentTransaction>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<RenewalFailure> RenewalFailures => Set<RenewalFailure>();
    public DbSet<PlatformPlan> PlatformPlans => Set<PlatformPlan>();
    public DbSet<PlanPrice> PlanPrices => Set<PlanPrice>();
    public DbSet<PlatformSubscription> PlatformSubscriptions => Set<PlatformSubscription>();
    public DbSet<PlanChange> PlanChanges => Set<PlanChange>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMembership> TeamMemberships => Set<TeamMembership>();
    public DbSet<TeamRequest> TeamRequests => Set<TeamRequest>();
    protected override void OnModelCreating(ModelBuilder m)
    {
        m.HasDefaultSchema("billing");
        m.Entity<Team>(e => { e.ToTable("teams"); e.HasKey(x => x.Id); e.HasIndex(x => x.OwnerId).IsUnique().HasFilter("\"Status\" <> 'Dissolved'"); e.Property(x => x.Name).HasMaxLength(80); });
        m.Entity<TeamMembership>(e => { e.ToTable("team_memberships"); e.HasKey(x => new { x.TeamId, x.UserId }); e.HasIndex(x => x.UserId).IsUnique().HasFilter("\"Status\" = 'Active'"); e.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<TeamRequest>(e => { e.ToTable("team_requests"); e.HasKey(x => x.Id); e.HasIndex(x => x.UserId); e.HasIndex(x => new { x.TeamId, x.UserId, x.Kind }).IsUnique().HasFilter("\"Status\" = 'Pending'"); e.Property(x => x.Kind).HasMaxLength(16); e.Property(x => x.Status).HasMaxLength(16); e.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict); });
        TeamBillingModel.Configure(m);
        m.Entity<Team>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => x.DissolutionAt).HasFilter("\"Status\" = 'DissolutionScheduled'");
        });
        m.Entity<TeamMembership>(e =>
        {
            e.Property(x => x.Role).HasMaxLength(16);
            e.Property(x => x.Status).HasMaxLength(16);
            e.HasIndex(x => x.TeamId).IsUnique().HasFilter("\"Role\" = 'Owner' AND \"Status\" = 'Active'");
            e.ToTable("team_memberships", t => { t.HasCheckConstraint("CK_team_member_role", "\"Role\" IN ('Owner','Admin','Member')"); t.HasCheckConstraint("CK_team_member_status", "\"Status\" IN ('Active','Ended')"); });
        });
        m.Entity<TeamRequest>().Property(x => x.Role).HasMaxLength(16);
        m.Entity<TeamAudit>(e => { e.ToTable("team_audit"); e.HasKey(x => x.Id); e.Property(x => x.Action).HasMaxLength(80); e.HasIndex(x => new { x.TeamId, x.CreatedAt }); e.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<PlatformSubscription>().Property(x => x.CheckoutTeamName).HasMaxLength(80);
        m.Entity<Payment>().HasIndex(x => new { x.CoachId, x.SettledAt })
            .HasFilter("\"Context\" = 'CoachingService'");
        m.Entity<PaymentDue>().HasIndex(x => new { x.CoachId, x.DueAt })
            .HasFilter("\"Context\" = 'CoachingService' AND \"Status\" = 'AwaitingPayment'");
        m.Entity<Order>().Property(x => x.Context).HasConversion<string>().HasMaxLength(32).HasDefaultValue(BillingContext.CoachingService);
        m.Entity<PaymentDue>().HasIndex(x => new { x.ClientId, x.PeriodStart }).HasFilter("\"Context\" = 'Platform'");
        m.Entity<Subscription>().HasOne<PaymentMethod>().WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PaymentDue>().Property(x => x.Context).HasConversion<string>().HasMaxLength(32).HasDefaultValue(BillingContext.CoachingService);
        m.Entity<Payment>().Property(x => x.Context).HasConversion<string>().HasMaxLength(32).HasDefaultValue(BillingContext.CoachingService);
        m.Entity<PlatformPlan>(e =>
        {
            e.ToTable("platform_plans");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(16);
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.CommissionRate).HasPrecision(7, 6);
            e.HasData(new PlatformPlan { Id = "Free", Name = "Free", CommissionRate = 0.10m }, new PlatformPlan { Id = "Pro", Name = "Pro", CommissionRate = 0.05m }, new PlatformPlan { Id = "Team", Name = "Team", CommissionRate = 0.05m });
        });
        m.Entity<PlanPrice>(e =>
        {
            e.ToTable("plan_prices", t => t.HasCheckConstraint("CK_plan_price", "\"Amount\" > 0"));
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.PlanId, x.Version }).IsUnique();
            e.Property(x => x.PlanId).HasMaxLength(16);
            e.Property(x => x.Version).HasMaxLength(80);
            e.Property(x => x.TermsVersion).HasMaxLength(80);
            e.Property(x => x.Amount).HasPrecision(28, 2);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasOne<PlatformPlan>().WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<PlatformSubscription>(e =>
        {
            e.ToTable("platform_subscriptions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.OwnerId).IsUnique();
            e.HasIndex(x => new { x.PlanId, x.PeriodEnd });
            e.Property(x => x.PlanId).HasMaxLength(16);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.PendingPlanId).HasMaxLength(16);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasOne<PlatformPlan>().WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PlanPrice>().WithMany().HasForeignKey(x => x.AcceptedPriceId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PaymentDue>().WithMany().HasForeignKey(x => x.PendingDueId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PaymentMethod>().WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<PlanChange>(e =>
        {
            e.ToTable("plan_changes");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.SubscriptionId, x.CreatedAt });
            e.Property(x => x.Type).HasMaxLength(40);
            e.Property(x => x.PlanId).HasMaxLength(16);
            e.HasOne<PlatformSubscription>().WithMany().HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PaymentDue>().WithMany().HasForeignKey(x => x.DueId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<Order>(e => { e.ToTable("orders", t => t.HasCheckConstraint("CK_order_money", Money)); e.HasKey(x => x.Id); e.HasIndex(x => x.ServiceId).IsUnique(); e.HasIndex(x => new { x.ClientId, x.CreatedAt }); e.HasIndex(x => new { x.CoachId, x.RelationshipId, x.CreatedAt }); e.Property(x => x.Name).HasMaxLength(200); e.Property(x => x.OptionSnapshot).HasColumnType("jsonb"); e.Property(x => x.SettlementMode).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Currency).HasMaxLength(3); e.Property(x => x.Amount).HasPrecision(28, 2); e.Property(x => x.FeeRate).HasPrecision(7, 6); e.Property(x => x.FeeAmount).HasPrecision(28, 2); e.Property(x => x.CoachNetAmount).HasPrecision(28, 2); });
        m.Entity<PaymentDue>(e => { e.ToTable("payment_dues", t => { t.HasCheckConstraint("CK_due_money", Money); t.HasCheckConstraint("CK_due_sequence", "\"Sequence\" >= 0"); }); e.HasKey(x => x.Id); e.HasIndex(x => new { x.OrderId, x.Sequence }).IsUnique(); e.HasIndex(x => new { x.ClientId, x.Status, x.DueAt }); e.HasIndex(x => new { x.CoachId, x.RelationshipId, x.DueAt }); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32); e.Property(x => x.SettlementMode).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Currency).HasMaxLength(3); e.Property(x => x.SettlementSource).HasMaxLength(200); e.Property(x => x.Amount).HasPrecision(28, 2); e.Property(x => x.FeeRate).HasPrecision(7, 6); e.Property(x => x.FeeAmount).HasPrecision(28, 2); e.Property(x => x.CoachNetAmount).HasPrecision(28, 2); e.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<PaymentMethod>(e => { e.ToTable("payment_methods"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.ClientId, x.Active }); e.Property(x => x.Label).HasMaxLength(80); e.Property(x => x.Token).HasMaxLength(100); e.HasIndex(x => x.Token).IsUnique(); });
        m.Entity<PaymentAttempt>(e => { e.ToTable("payment_attempts"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.DueId, x.IdempotencyKey }).IsUnique(); e.Property(x => x.IdempotencyKey).HasMaxLength(100); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32); e.Property(x => x.FailureCode).HasMaxLength(80); e.Property(x => x.ProviderReference).HasMaxLength(100); e.HasOne<PaymentDue>().WithMany().HasForeignKey(x => x.DueId).OnDelete(DeleteBehavior.Restrict); e.HasOne<PaymentMethod>().WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<Payment>(e => { e.ToTable("payments", t => t.HasCheckConstraint("CK_payment_money", "\"GrossAmount\" >= 0 AND \"FeeRate\" BETWEEN 0 AND 1 AND \"FeeAmount\" >= 0 AND \"CoachNetAmount\" >= 0 AND \"GrossAmount\" = \"FeeAmount\" + \"CoachNetAmount\"")); e.HasKey(x => x.Id); e.HasIndex(x => x.DueId).IsUnique(); e.HasIndex(x => x.AttemptId).IsUnique(); e.HasIndex(x => new { x.CoachId, x.Currency, x.SettledAt }); e.Property(x => x.Source).HasMaxLength(200); e.Property(x => x.IdempotencyKey).HasMaxLength(100); e.Property(x => x.Mode).HasConversion<string>().HasMaxLength(32); e.Property(x => x.Currency).HasMaxLength(3); e.Property(x => x.GrossAmount).HasPrecision(28, 2); e.Property(x => x.FeeRate).HasPrecision(7, 6); e.Property(x => x.FeeAmount).HasPrecision(28, 2); e.Property(x => x.CoachNetAmount).HasPrecision(28, 2); e.HasOne<PaymentDue>().WithMany().HasForeignKey(x => x.DueId).OnDelete(DeleteBehavior.Restrict); e.HasOne<PaymentAttempt>().WithMany().HasForeignKey(x => x.AttemptId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<PaymentTransaction>(e => { e.ToTable("transactions", t => t.HasCheckConstraint("CK_transaction_amount", "\"Amount\" > 0")); e.HasKey(x => x.Id); e.HasIndex(x => x.PaymentId).IsUnique(); e.HasIndex(x => x.AttemptId).IsUnique(); e.HasIndex(x => new { x.Provider, x.ProviderReference }).IsUnique(); e.Property(x => x.Provider).HasMaxLength(32); e.Property(x => x.ProviderReference).HasMaxLength(100); e.Property(x => x.Amount).HasPrecision(28, 2); e.Property(x => x.Currency).HasMaxLength(3); e.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict); e.HasOne<PaymentAttempt>().WithMany().HasForeignKey(x => x.AttemptId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<Subscription>(e => { e.ToTable("subscriptions", t => t.HasCheckConstraint("CK_subscription_period", "\"NextSequence\" >= 1 AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1))")); e.HasKey(x => x.Id); e.HasIndex(x => x.OrderId).IsUnique(); e.HasIndex(x => x.ServiceId).IsUnique(); e.HasIndex(x => new { x.Active, x.NextPeriodAt }); e.Property(x => x.PeriodUnit).HasConversion<string>().HasMaxLength(16); e.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict); });
        m.Entity<RenewalFailure>(e => { e.ToTable("renewal_failures"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.SubscriptionId, x.Sequence }).IsUnique(); e.Property(x => x.Code).HasMaxLength(80); e.HasOne<Subscription>().WithMany().HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Restrict); });
    }
    private const string Money = "\"Amount\" >= 0 AND \"FeeRate\" BETWEEN 0 AND 1 AND \"FeeAmount\" >= 0 AND \"CoachNetAmount\" >= 0 AND \"Amount\" = \"FeeAmount\" + \"CoachNetAmount\"";
    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var e in ChangeTracker.Entries())
        {
            if (e.Entity is TeamBillingQuote && e.State == EntityState.Modified && e.Properties.Any(p => p.IsModified && p.Metadata.Name is not ("Status" or "DueId" or "ConfirmedAt")))
                throw new InvalidOperationException("Accepted quote amounts and terms are immutable.");
            if (e.Entity is Order or Payment or PaymentTransaction or PlanPrice or PlanChange or ProrationCredit or TeamAudit && e.State is EntityState.Modified or EntityState.Deleted)
                throw new InvalidOperationException("Financial snapshots and settlements are immutable.");
            if (e.Entity is PaymentAttempt && e.State is EntityState.Modified or EntityState.Deleted && (AttemptStatus)e.OriginalValues[nameof(PaymentAttempt.Status)]! != AttemptStatus.Pending)
                throw new InvalidOperationException("Completed payment attempts are immutable.");
            if (e.Entity is PaymentDue && e.State is EntityState.Modified or EntityState.Deleted && (DueStatus)e.OriginalValues[nameof(PaymentDue.Status)]! != DueStatus.AwaitingPayment)
                throw new InvalidOperationException("Settled dues are immutable.");
        }
        return base.SaveChangesAsync(ct);
    }
}
public sealed class BillingDesignFactory : IDesignTimeDbContextFactory<BillingDbContext>
{
    public BillingDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<BillingDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE") ?? "Host=127.0.0.1;Database=trainflow_design;Username=unconfigured", o => o.MigrationsHistoryTable("__EFMigrationsHistory", "billing")).Options);
}
