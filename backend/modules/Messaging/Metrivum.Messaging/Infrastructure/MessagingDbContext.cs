using Metrivum.Messaging.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Metrivum.Messaging.Infrastructure;

/// <summary>Maps Messaging entities to PostgreSQL, exposes queries and tracks changes for explicit saves by callers.</summary>
public sealed class MessagingDbContext(DbContextOptions<MessagingDbContext> options)
    : DbContext(options)
{
    public DbSet<MessagingAbuseRecord> AbuseRecords => Set<MessagingAbuseRecord>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ConversationMember> Members => Set<ConversationMember>();
    public DbSet<MembershipChange> MembershipChanges => Set<MembershipChange>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageAttachment> Attachments => Set<MessageAttachment>();
    public DbSet<MessageRequest> Requests => Set<MessageRequest>();
    public DbSet<UserBlock> Blocks => Set<UserBlock>();
    public DbSet<MessageReport> Reports => Set<MessageReport>();
    public DbSet<MessagingPreference> Preferences => Set<MessagingPreference>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("messaging");
        var abuse = b.Entity<MessagingAbuseRecord>();
        abuse.ToTable("AbuseRecords");
        abuse.HasKey(x => x.Id);
        abuse.Property(x => x.Kind).HasMaxLength(16);
        abuse.HasIndex(x => new
        {
            x.UserId,
            x.Kind,
            x.CreatedAt,
        });
        abuse
            .HasIndex(x => new { x.UserId, x.RecipientId })
            .IsUnique()
            .HasFilter("\"Kind\" = 'contact'");

        b.Entity<MessagingPreference>().ToTable("Preferences").HasKey(x => x.UserId);
        var c = b.Entity<Conversation>();
        c.ToTable(
            "Conversations",
            t =>
                t.HasCheckConstraint(
                    "CK_Conversation_Pair",
                    "(\"Type\" = 'Direct' AND \"PairFirst\" IS NOT NULL AND \"PairSecond\" IS NOT NULL AND \"PairFirst\" < \"PairSecond\" AND \"ClientGroupId\" IS NULL) OR (\"Type\" = 'Group' AND \"PairFirst\" IS NULL AND \"PairSecond\" IS NULL AND \"ClientGroupId\" IS NULL) OR (\"Type\" = 'ClientGroupLinked' AND \"PairFirst\" IS NULL AND \"PairSecond\" IS NULL AND \"ClientGroupId\" IS NOT NULL)"
                )
        );
        c.HasKey(x => x.Id);
        c.HasIndex(x => new { x.PairFirst, x.PairSecond }).IsUnique();
        c.HasIndex(x => x.ClientGroupId).IsUnique();
        c.Property(x => x.Title).HasMaxLength(200);
        c.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
        var m = b.Entity<ConversationMember>();
        m.ToTable(
            "Members",
            t =>
                t.HasCheckConstraint(
                    "CK_Member_Boundary",
                    "(\"State\"='Active' AND \"CutoffSequence\" IS NULL AND \"RemovedAt\" IS NULL AND NOT \"Excluded\") OR (\"State\" IN ('Removed','Left','Banned') AND \"CutoffSequence\" IS NOT NULL AND \"RemovedAt\" IS NOT NULL)"
                )
        );
        m.HasKey(x => new { x.ConversationId, x.UserId });
        m.HasIndex(x => new { x.UserId, x.State });
        m.Property(x => x.Source).HasConversion<string>().HasMaxLength(30);
        m.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
        m.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
        m.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(x => x.ConversationId)
            .OnDelete(DeleteBehavior.Restrict);
        var e = b.Entity<MembershipChange>();
        e.ToTable("MembershipChanges");
        e.HasKey(x => x.Id);
        e.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
        e.Property(x => x.Source).HasConversion<string>().HasMaxLength(30);
        e.HasOne<ConversationMember>()
            .WithMany()
            .HasForeignKey(x => new { x.ConversationId, x.UserId })
            .OnDelete(DeleteBehavior.Restrict);
        e.HasIndex(x => new
        {
            x.ConversationId,
            x.UserId,
            x.OccurredAt,
        });
        var msg = b.Entity<Message>();
        msg.ToTable(
            "Messages",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Message_Type",
                    "\"Type\" IN ('Text','Image','File','Video','VoiceMessage','System')"
                );
                t.HasCheckConstraint("CK_Message_Sequence", "\"Sequence\" > 0");
            }
        );
        msg.HasKey(x => x.Id);
        msg.HasAlternateKey(x => new { x.ConversationId, x.Id });
        msg.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        msg.Property(x => x.Body).HasMaxLength(8000);
        msg.Property(x => x.CoachingEntryJson).HasColumnType("jsonb");
        msg.Property(x => x.IdempotencyKey).HasMaxLength(100);
        msg.Property(x => x.RequestHash).HasMaxLength(64);
        msg.HasIndex(x => new
        {
            x.ConversationId,
            x.CreatedAt,
            x.Id,
        });
        msg.HasIndex(x => new { x.ConversationId, x.Sequence }).IsUnique();
        msg.HasIndex(x => new
            {
                x.ConversationId,
                x.SenderUserId,
                x.IdempotencyKey,
            })
            .IsUnique();
        msg.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(x => x.ConversationId)
            .OnDelete(DeleteBehavior.Restrict);
        msg.HasOne<Message>()
            .WithMany()
            .HasForeignKey(x => new { x.ConversationId, x.ReplyToMessageId })
            .HasPrincipalKey(x => new { x.ConversationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        var a = b.Entity<MessageAttachment>();
        a.ToTable("Attachments");
        a.HasKey(x => new { x.MessageId, x.MediaId });
        a.Property(x => x.ContentType).HasMaxLength(200);
        a.HasOne<Message>()
            .WithMany()
            .HasForeignKey(x => x.MessageId)
            .OnDelete(DeleteBehavior.Restrict);
        var r = b.Entity<MessageRequest>();
        r.ToTable(
            "Requests",
            t =>
                t.HasCheckConstraint(
                    "CK_Request_NoSelf",
                    "\"SenderUserId\" <> \"RecipientUserId\" AND \"PairFirst\" < \"PairSecond\""
                )
        );
        r.HasKey(x => x.Id);
        r.Property(x => x.Body).HasMaxLength(8000);
        r.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
        r.HasIndex(x => new { x.PairFirst, x.PairSecond })
            .IsUnique()
            .HasFilter("\"State\" = 'Pending'");
        r.HasIndex(x => new
        {
            x.RecipientUserId,
            x.State,
            x.CreatedAt,
        });
        r.HasIndex(x => new { x.SenderUserId, x.CreatedAt });
        r.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(x => x.ConversationId)
            .OnDelete(DeleteBehavior.Restrict);
        var block = b.Entity<UserBlock>();
        block.ToTable(
            "Blocks",
            t => t.HasCheckConstraint("CK_Block_NoSelf", "\"UserId\" <> \"BlockedUserId\"")
        );
        block.HasKey(x => new { x.UserId, x.BlockedUserId });
        block.HasIndex(x => x.BlockedUserId);
        var report = b.Entity<MessageReport>();
        report.ToTable("Reports");
        report.HasKey(x => x.Id);
        report.Property(x => x.Category).HasMaxLength(100);
        report.Property(x => x.Details).HasMaxLength(2000);
        report.Property(x => x.Evidence).HasColumnType("jsonb");
        report.Property(x => x.Status).HasMaxLength(30);
        report
            .HasOne<Message>()
            .WithMany()
            .HasForeignKey(x => new { x.ConversationId, x.MessageId })
            .HasPrincipalKey(x => new { x.ConversationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>Creates the Messaging DbContext for EF migration tooling; never applies migrations at normal API startup.</summary>
public sealed class MessagingDesignFactory : IDesignTimeDbContextFactory<MessagingDbContext>
{
    public MessagingDbContext CreateDbContext(string[] args) =>
        new(
            new DbContextOptionsBuilder<MessagingDbContext>()
                .UseNpgsql(
                    Environment.GetEnvironmentVariable("TRAINFLOW_MIGRATION_DATABASE")
                        ?? "Host=localhost;Database=trainflow_design;Username=design_only",
                    x => x.MigrationsHistoryTable("__EFMigrationsHistory", "messaging")
                )
                .Options
        );
}
