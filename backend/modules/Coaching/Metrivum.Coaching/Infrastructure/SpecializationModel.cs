using Metrivum.Coaching.Domain;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Coaching.Infrastructure;

/// <summary>Configures EF mappings, relationships and constraints for specialization in Coaching; does not execute data mutations.</summary>
internal static class SpecializationModel
{
    public static void Configure(ModelBuilder model)
    {
        var category = model.Entity<SpecializationCategory>();
        category.ToTable("SpecializationCategories");
        category.HasKey(x => x.Code);
        category.Property(x => x.Code).HasMaxLength(80);
        category.Property(x => x.Name).HasMaxLength(160);
        category.HasData(CoachSpecializationTaxonomy.Categories);
        var item = model.Entity<Specialization>();
        item.ToTable("Specializations");
        item.HasKey(x => x.Code);
        item.Property(x => x.Code).HasMaxLength(80);
        item.Property(x => x.CategoryCode).HasMaxLength(80);
        item.Property(x => x.Name).HasMaxLength(160);
        item.HasOne<SpecializationCategory>()
            .WithMany()
            .HasForeignKey(x => x.CategoryCode)
            .OnDelete(DeleteBehavior.Restrict);
        item.HasData(CoachSpecializationTaxonomy.Items);
        var profile = model.Entity<CoachSpecializationProfile>();
        profile.ToTable("CoachSpecializationProfiles");
        profile.HasKey(x => x.CoachId);
        profile.Property(x => x.Version).IsConcurrencyToken();
        var link = model.Entity<CoachSpecialization>();
        link.ToTable("CoachSpecializations");
        link.HasKey(x => new { x.CoachId, x.SpecializationCode });
        link.Property(x => x.SpecializationCode).HasMaxLength(80);
        link.HasOne<CoachSpecializationProfile>()
            .WithMany()
            .HasForeignKey(x => x.CoachId)
            .OnDelete(DeleteBehavior.Restrict);
        link.HasOne(x => x.Specialization)
            .WithMany()
            .HasForeignKey(x => x.SpecializationCode)
            .OnDelete(DeleteBehavior.Restrict);
        link.HasIndex(x => new
        {
            x.SpecializationCode,
            x.CoachId,
            x.IsPrimary,
        });
        var history = model.Entity<CoachSpecializationsChanged>();
        history.ToTable("CoachSpecializationChanges");
        history.HasKey(x => new { x.CoachId, x.Version });
        history
            .HasOne<CoachSpecializationProfile>()
            .WithMany()
            .HasForeignKey(x => x.CoachId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
