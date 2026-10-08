using Microsoft.EntityFrameworkCore;
using TrainFlow.Billing.Domain;
namespace TrainFlow.Billing.Infrastructure;

public static class TeamBillingModel
{
    public static void Configure(ModelBuilder m)
    {
        m.Entity<Order>().HasIndex(x => new { x.TeamId, x.CoachId, x.CreatedAt });
        m.Entity<PaymentDue>().HasIndex(x => new { x.TeamId, x.CoachId, x.DueAt });
        m.Entity<Payment>().HasIndex(x => new { x.TeamId, x.CoachId, x.SettledAt });
        m.Entity<TeamPlatformSubscription>(e =>
        {
            e.ToTable("team_platform_subscriptions", t => t.HasCheckConstraint("CK_team_subscription_seats", "\"PurchasedSeats\" >= 1 AND (\"PendingSeats\" IS NULL OR \"PendingSeats\" >= 1)"));
            e.HasKey(x => x.TeamId);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.Property(x => x.Status).HasMaxLength(32);
            e.HasIndex(x => new { x.Status, x.PeriodEnd });
            e.HasOne<Team>().WithOne().HasForeignKey<TeamPlatformSubscription>(x => x.TeamId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PlanPrice>().WithMany().HasForeignKey(x => x.AcceptedPriceId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PaymentMethod>().WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<TeamBillingQuote>(e =>
        {
            e.ToTable("team_billing_quotes", t => t.HasCheckConstraint("CK_team_quote_money", "\"PurchasedSeats\" >= 1 AND \"CreditAmount\" >= 0 AND \"AmountDue\" >= 0 AND \"GrossAmount\" = \"CreditAmount\" + \"AmountDue\""));
            e.HasKey(x => x.Id);
            e.Property(x => x.TeamName).HasMaxLength(80);
            e.Property(x => x.Kind).HasMaxLength(16);
            e.Property(x => x.Status).HasMaxLength(16);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.Property(x => x.GrossAmount).HasPrecision(28, 2);
            e.Property(x => x.CreditAmount).HasPrecision(28, 2);
            e.Property(x => x.AmountDue).HasPrecision(28, 2);
            e.HasIndex(x => new { x.OwnerId, x.CreatedAt });
            e.HasIndex(x => new { x.TeamId, x.CreatedAt });
            e.HasIndex(x => x.DueId).IsUnique();
            e.HasOne<PlanPrice>().WithMany().HasForeignKey(x => x.PriceId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PaymentDue>().WithMany().HasForeignKey(x => x.DueId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Payment>().WithMany().HasForeignKey(x => x.SourcePaymentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PlatformSubscription>().WithMany().HasForeignKey(x => x.SourceSubscriptionId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<ProrationCredit>(e =>
        {
            e.ToTable("proration_credits");
            e.HasKey(x => x.Id);
            e.Property(x => x.Amount).HasPrecision(28, 2);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasIndex(x => x.SourcePaymentId).IsUnique();
            e.HasIndex(x => new { x.SourceSubscriptionId, x.SourcePeriodStart, x.SourcePeriodEnd }).IsUnique();
            e.HasIndex(x => x.QuoteId).IsUnique();
            e.HasOne<TeamBillingQuote>().WithMany().HasForeignKey(x => x.QuoteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Payment>().WithMany().HasForeignKey(x => x.SourcePaymentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PlatformSubscription>().WithMany().HasForeignKey(x => x.SourceSubscriptionId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
