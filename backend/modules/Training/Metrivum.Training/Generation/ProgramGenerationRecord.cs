using Microsoft.EntityFrameworkCore;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Generation;

/// <summary>Represents persisted program generation record state in Training; mapped and saved by the owning module's EF services.</summary>
public sealed class ProgramGenerationRecord
{
    public Guid ProgramId
    {
        get; set;
    }
    public Guid WorkspaceId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string StateJson { get; set; } = "";
    public string DocumentHash { get; set; } = "";
    public string AssumptionsJson { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}

/// <summary>Configures EF mappings, relationships and constraints for program generation in Training; does not execute data mutations.</summary>
public static class ProgramGenerationModel
{
    public static void ConfigureProgramGeneration(this ModelBuilder model)
    {
        model.Entity<ProgramGenerationRecord>(entity =>
        {
            entity.ToTable("program_generations", "training");
            entity.HasKey(x => x.ProgramId);
            entity.HasOne<TrainingPlan>().WithOne().HasForeignKey<ProgramGenerationRecord>(x => x.ProgramId).OnDelete(DeleteBehavior.Restrict);
            entity.Property(x => x.IdempotencyKey).HasMaxLength(128);
            entity.Property(x => x.RequestHash).HasMaxLength(64);
            entity.Property(x => x.DocumentHash).HasMaxLength(64);
            entity.Property(x => x.StateJson).HasColumnType("jsonb");
            entity.Property(x => x.AssumptionsJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.WorkspaceId, x.OwnerId, x.IdempotencyKey }).IsUnique();
        });
    }
}
