using Microsoft.EntityFrameworkCore;
using TrainFlow.Coaching.Domain;

namespace TrainFlow.Coaching.Infrastructure;

internal static class DiscoveryModel
{
    public static void Configure(ModelBuilder model)
    {
        var profile = model.Entity<CoachDiscoveryProfile>();
        profile.ToTable("DiscoveryProfiles", t =>
        {
            t.HasCheckConstraint("CK_Discovery_Arrays", "cardinality(\"Specializations\") <= 20 AND cardinality(\"Languages\") <= 10 AND cardinality(\"Modes\") <= 3");
            t.HasCheckConstraint("CK_Discovery_Modes", "\"Modes\" <@ ARRAY['Online','Offline','Hybrid']::text[]");
        });
        profile.HasKey(x => x.CoachId);
        profile.Property(x => x.Location).HasMaxLength(160);
        profile.Property(x => x.Version).IsConcurrencyToken();
        profile.HasIndex(x => new { x.Published, x.CoachId });
        profile.HasIndex(x => x.Specializations).HasMethod("gin");
        profile.HasIndex(x => x.Languages).HasMethod("gin");
        profile.HasIndex(x => x.Modes).HasMethod("gin");
        var audit = model.Entity<DiscoveryPublicationChanged>();
        audit.ToTable("DiscoveryPublicationChanges");
        audit.HasKey(x => x.Id);
        audit.HasIndex(x => new { x.CoachId, x.Version }).IsUnique();
        audit.HasOne<CoachDiscoveryProfile>().WithMany().HasForeignKey(x => x.CoachId).OnDelete(DeleteBehavior.Restrict);
    }
}
