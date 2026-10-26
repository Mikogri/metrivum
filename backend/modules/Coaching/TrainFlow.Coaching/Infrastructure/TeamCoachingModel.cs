using Microsoft.EntityFrameworkCore;
using TrainFlow.Coaching.Domain;

namespace TrainFlow.Coaching.Infrastructure;

internal static class TeamCoachingModel
{
    public static void Configure(ModelBuilder model)
    {
        model.Entity<TeamClientCase>(e =>
        {
            e.ToTable("TeamClientCases", t => t.HasCheckConstraint("CK_TeamCase_Status", "\"Status\" IN ('Active','Ended')"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.Id, x.TeamId });
            e.HasIndex(x => new { x.TeamId, x.ClientId }).IsUnique();
            e.HasIndex(x => new { x.TeamId, x.Status, x.CreatedAt });
            e.HasIndex(x => new { x.TeamId, x.CreatedAt, x.Id }).IsDescending(false, true, false);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<TeamCoachAssignment>(e =>
        {
            e.ToTable("TeamCoachAssignments", t => t.HasCheckConstraint("CK_TeamAssignment_Dates", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\""));
            e.HasKey(x => x.Id);
            e.HasOne<TeamClientCase>().WithMany().HasForeignKey(x => new { x.TeamClientCaseId, x.TeamId }).HasPrincipalKey(x => new { x.Id, x.TeamId }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.TeamClientCaseId, x.CoachId }).IsUnique().HasFilter("\"EndedAt\" IS NULL");
            e.HasIndex(x => new { x.TeamId, x.CoachId, x.EndedAt });
        });
        model.Entity<ClientTransferRequest>(e =>
        {
            e.ToTable("ClientTransferRequests", t =>
            {
                t.HasCheckConstraint("CK_TeamTransfer_Status", "\"Status\" IN ('Pending','Accepted','Declined','Expired','Revoked')");
                t.HasCheckConstraint("CK_TeamTransfer_Consent", "\"Status\" <> 'Accepted' OR (\"TeamClientCaseId\" IS NOT NULL AND \"DecidedBy\" = \"ClientId\" AND \"DecidedAt\" IS NOT NULL)");
            });
            e.HasKey(x => x.Id);
            e.HasOne<Relationship>().WithMany().HasForeignKey(x => x.RelationshipId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TeamClientCase>().WithMany().HasForeignKey(x => new { x.TeamClientCaseId, x.TeamId }).HasPrincipalKey(x => new { x.Id, x.TeamId }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.RelationshipId, "IX_ClientTransferRequests_RelationshipId_All");
            e.HasIndex(x => x.RelationshipId).IsUnique().HasFilter("\"Status\" = 'Pending'");
            e.HasIndex(x => new { x.ClientId, x.Status, x.CreatedAt });
            e.HasIndex(x => new { x.TeamId, x.Status, x.CreatedAt });
            e.HasIndex(x => new { x.ClientId, x.CreatedAt, x.Id }).IsDescending(false, true, false);
            e.HasIndex(x => new { x.TeamId, x.CreatedAt, x.Id }).IsDescending(false, true, false);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.TeamName).HasMaxLength(200);
            e.Property(x => x.ConsentVersion).HasMaxLength(80);
            e.Property(x => x.ConsentText).HasMaxLength(4000);
            e.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<TeamCaseChange>(e =>
        {
            e.ToTable("TeamCaseChanges");
            e.HasKey(x => x.Id);
            e.HasOne<TeamClientCase>().WithMany().HasForeignKey(x => x.TeamClientCaseId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.TeamClientCaseId, x.Version }).IsUnique();
            e.Property(x => x.Kind).HasMaxLength(40);
        });
        model.Entity<TeamTransferChange>(e =>
        {
            e.ToTable("TeamTransferChanges");
            e.HasKey(x => x.Id);
            e.HasOne<ClientTransferRequest>().WithMany().HasForeignKey(x => x.TransferRequestId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.TransferRequestId, x.Version }).IsUnique();
            e.Property(x => x.Status).HasMaxLength(20);
        });
    }
}
