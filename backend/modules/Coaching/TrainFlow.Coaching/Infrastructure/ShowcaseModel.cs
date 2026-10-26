using Microsoft.EntityFrameworkCore;
using TrainFlow.Coaching.Domain;

namespace TrainFlow.Coaching.Infrastructure;

internal static class ShowcaseModel
{
    public static void Configure(ModelBuilder model)
    {
        var showcase = model.Entity<CoachShowcase>();
        showcase.ToTable("Showcases", t =>
        {
            t.HasCheckConstraint("CK_Showcase_Years", "\"YearsExperience\" IS NULL OR \"YearsExperience\" BETWEEN 0 AND 80");
            t.HasCheckConstraint("CK_Showcase_Competencies", "cardinality(\"Competencies\") <= 20");
        });
        showcase.HasKey(x => x.CoachId);
        showcase.Property(x => x.Headline).HasMaxLength(160);
        showcase.Property(x => x.Version).IsConcurrencyToken();

        var item = model.Entity<CoachPortfolioItem>();
        item.ToTable("PortfolioItems", t => t.HasCheckConstraint("CK_PortfolioItem_Kind", "\"Kind\" IN ('Certificate','ClientResult','Other')"));
        item.HasKey(x => x.Id);
        item.HasIndex(x => new { x.CoachId, x.CreatedAt });
        item.HasIndex(x => x.MediaId).IsUnique();
        item.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
        item.Property(x => x.Title).HasMaxLength(120);
        item.Property(x => x.Description).HasMaxLength(1000);
        item.Property(x => x.ContentType).HasMaxLength(100);
    }
}
