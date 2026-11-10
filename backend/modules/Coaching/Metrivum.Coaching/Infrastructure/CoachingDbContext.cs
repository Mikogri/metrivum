using Metrivum.Coaching.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Coaching.Infrastructure;

/// <summary>Maps Coaching entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class CoachingDbContext(DbContextOptions<CoachingDbContext> options)
    : DbContext(options)
{
    public DbSet<Relationship> Relationships => Set<Relationship>();
    public DbSet<ClientGroup> Groups => Set<ClientGroup>();
    public DbSet<GroupMembership> Memberships => Set<GroupMembership>();
    public DbSet<RelationshipStatusChanged> StatusChanges => Set<RelationshipStatusChanged>();
    public DbSet<ClientGroupMembershipChanged> MembershipChanges =>
        Set<ClientGroupMembershipChanged>();
    public DbSet<CoachingApplication> Applications => Set<CoachingApplication>();
    public DbSet<CoachingInvitation> Invitations => Set<CoachingInvitation>();
    public DbSet<RelationshipService> Services => Set<RelationshipService>();
    public DbSet<ApplicationStatusChanged> ApplicationChanges => Set<ApplicationStatusChanged>();
    public DbSet<CoachShowcase> Showcases => Set<CoachShowcase>();
    public DbSet<CoachPortfolioItem> PortfolioItems => Set<CoachPortfolioItem>();
    public DbSet<CoachDiscoveryProfile> DiscoveryProfiles => Set<CoachDiscoveryProfile>();
    public DbSet<DiscoveryPublicationChanged> DiscoveryPublicationChanges =>
        Set<DiscoveryPublicationChanged>();
    public DbSet<SpecializationCategory> SpecializationCategories => Set<SpecializationCategory>();
    public DbSet<Specialization> Specializations => Set<Specialization>();
    public DbSet<CoachSpecializationProfile> CoachSpecializationProfiles =>
        Set<CoachSpecializationProfile>();
    public DbSet<CoachSpecialization> CoachSpecializations => Set<CoachSpecialization>();
    public DbSet<CoachSpecializationsChanged> CoachSpecializationChanges =>
        Set<CoachSpecializationsChanged>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("coaching");
        var r = model.Entity<Relationship>();
        r.ToTable(
            "Relationships",
            t =>
            {
                t.HasCheckConstraint("CK_Relationship_NoSelf", "\"CoachId\" <> \"ClientId\"");
                t.HasCheckConstraint(
                    "CK_Relationship_Status",
                    "\"Status\" IN ('Active','Suspended','Completed')"
                );
                t.HasCheckConstraint(
                    "CK_Relationship_Source",
                    "\"ActivationSource\" IN ('DevFixture','AcceptedApplication','TeamConsent')"
                );
            }
        );
        r.HasKey(x => x.Id);
        r.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
        });
        r.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
            x.ClientId,
        });
        r.HasIndex(x => new { x.CoachId, x.ClientId }).IsUnique().HasFilter("\"TeamId\" IS NULL");
        r.HasIndex(x => new
            {
                x.TeamId,
                x.CoachId,
                x.ClientId,
            })
            .IsUnique()
            .HasFilter("\"TeamId\" IS NOT NULL");
        r.ToTable(
            "Relationships",
            t =>
                t.HasCheckConstraint(
                    "CK_Relationship_Scope",
                    "(\"TeamId\" IS NULL) = (\"TeamClientCaseId\" IS NULL)"
                )
        );
        r.HasOne<TeamClientCase>()
            .WithMany()
            .HasForeignKey(x => new { x.TeamClientCaseId, x.TeamId })
            .HasPrincipalKey(x => new { x.Id, x.TeamId })
            .OnDelete(DeleteBehavior.Restrict);
        r.HasIndex(x => new
        {
            x.CoachId,
            x.Status,
            x.UpdatedAt,
            x.Id,
        });
        r.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.StartedAt,
        });
        r.HasIndex(x => new
        {
            x.ClientId,
            x.Status,
            x.Id,
        });
        r.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        r.Property(x => x.ActivationSource).HasConversion<string>().HasMaxLength(30);
        r.Property(x => x.Version).IsConcurrencyToken();
        var g = model.Entity<ClientGroup>();
        g.ToTable(
            "Groups",
            t =>
            {
                t.HasCheckConstraint("CK_Group_Name", "length(btrim(\"Name\")) BETWEEN 1 AND 200");
                t.HasCheckConstraint("CK_Group_Color", "\"Color\" ~ '^#[0-9A-Fa-f]{6}$'");
            }
        );
        g.HasKey(x => x.Id);
        g.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
        });
        g.HasIndex(x => new
        {
            x.CoachId,
            x.Archived,
            x.Name,
            x.Id,
        });
        g.HasIndex(x => new
        {
            x.TeamId,
            x.CoachId,
            x.Archived,
            x.Name,
        });
        g.Property(x => x.Name).HasMaxLength(200);
        g.Property(x => x.Description).HasMaxLength(4000);
        g.Property(x => x.Color).HasMaxLength(7);
        g.Property(x => x.Version).IsConcurrencyToken();
        var m = model.Entity<GroupMembership>();
        m.ToTable("Memberships");
        m.HasKey(x => new { x.GroupId, x.RelationshipId });
        m.HasOne<ClientGroup>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.GroupId,
                x.CoachId,
                x.WorkspaceId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        m.HasOne<Relationship>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.RelationshipId,
                x.CoachId,
                x.WorkspaceId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        m.HasIndex(x => new { x.RelationshipId, x.GroupId });
        var s = model.Entity<RelationshipStatusChanged>();
        s.ToTable("StatusChanges");
        s.HasKey(x => x.Id);
        s.HasIndex(x => new { x.RelationshipId, x.Version }).IsUnique();
        s.Property(x => x.PreviousStatus).HasConversion<string>().HasMaxLength(20);
        s.Property(x => x.NewStatus).HasConversion<string>().HasMaxLength(20);
        s.Property(x => x.InternalReason).HasMaxLength(1000);
        s.HasOne<Relationship>()
            .WithMany()
            .HasForeignKey(x => x.RelationshipId)
            .OnDelete(DeleteBehavior.Restrict);
        var a = model.Entity<ClientGroupMembershipChanged>();
        a.ToTable("MembershipChanges");
        a.HasKey(x => x.Id);
        a.HasIndex(x => new { x.GroupId, x.Version }).IsUnique();
        a.HasOne<ClientGroup>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        a.HasOne<Relationship>()
            .WithMany()
            .HasForeignKey(x => x.RelationshipId)
            .OnDelete(DeleteBehavior.Restrict);
        ConfigureIntake(model);
        TeamCoachingModel.Configure(model);
        ShowcaseModel.Configure(model);
        DiscoveryModel.Configure(model);
        SpecializationModel.Configure(model);
    }

    private static void ConfigureIntake(ModelBuilder model)
    {
        var app = model.Entity<CoachingApplication>();
        app.ToTable(
            "Applications",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Application_Status",
                    "\"Status\" IN ('InProgress','Submitted','Accepted','Rejected','Withdrawn')"
                );
                t.HasCheckConstraint(
                    "CK_Application_Source",
                    "(\"Source\" = 'Direct' AND \"InvitationId\" IS NULL) OR (\"Source\" = 'Invitation' AND \"InvitationId\" IS NOT NULL)"
                );
                t.HasCheckConstraint(
                    "CK_Application_OptionalForm",
                    "\"FormVersionId\" IS NOT NULL OR (\"FormSubmissionId\" IS NULL AND \"Answers\" = '{}'::jsonb)"
                );
                t.HasCheckConstraint("CK_Application_NoSelf", "\"CoachId\" <> \"ApplicantUserId\"");
                t.HasCheckConstraint(
                    "CK_Application_Submission",
                    "\"Status\" NOT IN ('Submitted','Accepted','Rejected') OR (\"SubmittedAt\" IS NOT NULL AND (\"FormVersionId\" IS NULL OR \"FormSubmissionId\" IS NOT NULL))"
                );
            }
        );
        app.HasKey(x => x.Id);
        app.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.SubmittedAt,
        });
        app.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
            x.ApplicantUserId,
        });
        app.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        app.Property(x => x.Source).HasConversion<string>().HasMaxLength(20);
        app.Property(x => x.OfferName).HasMaxLength(200);
        app.Property(x => x.OfferSnapshot).HasColumnType("jsonb");
        app.Property(x => x.Answers).HasColumnType("jsonb");
        app.Property(x => x.Amount).HasPrecision(18, 2);
        app.Property(x => x.Currency).HasMaxLength(3);
        app.Property(x => x.Version).IsConcurrencyToken();
        app.Property(x => x.TeamConsentVersion).HasMaxLength(80);
        app.HasIndex(x => new
        {
            x.TeamId,
            x.CoachId,
            x.SubmittedAt,
        });
        app.HasIndex(x => new
        {
            x.CoachId,
            x.Status,
            x.UpdatedAt,
            x.Id,
        });
        app.HasIndex(x => new
        {
            x.ApplicantUserId,
            x.Status,
            x.UpdatedAt,
            x.Id,
        });
        app.HasIndex(x => x.InvitationId).IsUnique();
        var invitation = model.Entity<CoachingInvitation>();
        invitation.ToTable(
            "Invitations",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Invitation_Status",
                    "\"Status\" IN ('Pending','Accepted','Declined','Revoked')"
                );
                t.HasCheckConstraint("CK_Invitation_NoSelf", "\"CoachId\" <> \"TargetUserId\"");
            }
        );
        invitation.HasKey(x => x.Id);
        invitation.HasIndex(x => new
        {
            x.CoachId,
            x.WorkspaceId,
            x.CreatedAt,
        });
        invitation.HasAlternateKey(x => new
        {
            x.Id,
            x.CoachId,
            x.WorkspaceId,
            x.TargetUserId,
        });
        invitation.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        invitation.Property(x => x.OfferName).HasMaxLength(200);
        invitation.Property(x => x.OfferSnapshot).HasColumnType("jsonb");
        invitation.Property(x => x.Message).HasMaxLength(2000);
        invitation.Property(x => x.Version).IsConcurrencyToken();
        invitation.HasIndex(x => new
        {
            x.CoachId,
            x.Status,
            x.CreatedAt,
            x.Id,
        });
        invitation.HasIndex(x => new
        {
            x.TargetUserId,
            x.Status,
            x.CreatedAt,
            x.Id,
        });
        app.HasOne<CoachingInvitation>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.InvitationId,
                x.CoachId,
                x.WorkspaceId,
                x.ApplicantUserId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.TargetUserId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        var service = model.Entity<RelationshipService>();
        service.ToTable(
            "Services",
            t => t.HasCheckConstraint("CK_Service_Status", "\"Status\" IN ('Active','Completed')")
        );
        service.HasKey(x => x.Id);
        service.HasIndex(x => new
        {
            x.TeamId,
            x.CoachId,
            x.StartedAt,
        });
        service.HasIndex(x => x.ApplicationId).IsUnique();
        service.HasIndex(x => x.OrderId).IsUnique();
        service.HasIndex(x => new
        {
            x.RelationshipId,
            x.Status,
            x.StartedAt,
            x.Id,
        });
        service.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        service.Property(x => x.OfferName).HasMaxLength(200);
        service.Property(x => x.OfferSnapshot).HasColumnType("jsonb");
        service.Property(x => x.Amount).HasPrecision(18, 2);
        service.Property(x => x.Currency).HasMaxLength(3);
        service.Property(x => x.Version).IsConcurrencyToken();
        service
            .HasOne<Relationship>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.RelationshipId,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        service
            .HasOne<CoachingApplication>()
            .WithMany()
            .HasForeignKey(x => new
            {
                x.ApplicationId,
                x.CoachId,
                x.WorkspaceId,
                x.ClientId,
            })
            .HasPrincipalKey(x => new
            {
                x.Id,
                x.CoachId,
                x.WorkspaceId,
                x.ApplicantUserId,
            })
            .OnDelete(DeleteBehavior.Restrict);
        var history = model.Entity<ApplicationStatusChanged>();
        history.ToTable("ApplicationChanges");
        history.HasKey(x => x.Id);
        history.HasIndex(x => new { x.ApplicationId, x.Version }).IsUnique();
        history.Property(x => x.PreviousStatus).HasConversion<string>().HasMaxLength(20);
        history.Property(x => x.NewStatus).HasConversion<string>().HasMaxLength(20);
        history.Property(x => x.InternalReason).HasMaxLength(1000);
        history
            .HasOne<CoachingApplication>()
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Creates the Coaching DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class CoachingDesignFactory : IDesignTimeDbContextFactory<CoachingDbContext>
{
    public CoachingDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<CoachingDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=localhost;Database=trainflow_design;Username=design_only",
                    x => x.MigrationsHistoryTable("__EFMigrationsHistory", "coaching")
                )
                .Options
        );
}
