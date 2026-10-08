using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TrainFlow.ExerciseCatalog.Contracts;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Delivery;

[JsonConverter(typeof(JsonStringEnumConverter<AssignmentStatus>))]
public enum AssignmentStatus
{
    Active, Paused, Completed, Cancelled
}
[JsonConverter(typeof(JsonStringEnumConverter<ExecutionStatus>))]
public enum ExecutionStatus
{
    InProgress, Completed, Skipped
}
[JsonConverter(typeof(JsonStringEnumConverter<LoadMeaning>))]
public enum LoadMeaning
{
    TotalExternal, PerHand, Bodyweight, Assisted
}
public sealed class AssignmentBatch
{
    public Guid Id
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
}
public sealed class GroupProgramAssignment
{
    public Guid Id
    {
        get; set;
    }
    public Guid BatchId
    {
        get; set;
    }
    public Guid GroupId
    {
        get; set;
    }
}
public sealed class ProgramAssignment
{
    public Guid Id
    {
        get; set;
    }
    public Guid BatchId
    {
        get; set;
    }
    public Guid RelationshipId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public Guid ClientId
    {
        get; set;
    }
    public Guid ProgramId
    {
        get; set;
    }
    public Guid OriginalRevisionId
    {
        get; set;
    }
    public Guid EffectiveRevisionId
    {
        get; set;
    }
    public Guid? GroupAssignmentId
    {
        get; set;
    }
    public DateOnly StartDate
    {
        get; set;
    }
    public string TimeZone { get; set; } = "UTC";
    public string ProgramName { get; set; } = "";
    public AssignmentStatus Status
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class AssignmentGroupSource
{
    public Guid AssignmentId
    {
        get; set;
    }
    public Guid GroupAssignmentId
    {
        get; set;
    }
}
public sealed class WorkoutOccurrence
{
    public Guid Id
    {
        get; set;
    }
    public Guid AssignmentId
    {
        get; set;
    }
    public Guid RevisionId
    {
        get; set;
    }
    public Guid BlockId
    {
        get; set;
    }
    public Guid CycleId
    {
        get; set;
    }
    public Guid DayId
    {
        get; set;
    }
    public Guid WorkoutId
    {
        get; set;
    }
    public DateOnly ScheduledDate
    {
        get; set;
    }
    public DateTimeOffset Deadline
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public bool Superseded
    {
        get; set;
    }
    public WorkoutPrescription Prescription { get; set; } = null!;
}
public sealed record WorkoutPrescription(Guid RevisionId, string ProgramName, Workout Workout, Dictionary<Guid, ExerciseSnapshot> Exercises, Dictionary<Guid, FormulaEvaluation> Formulas);
public sealed class WorkoutExecution
{
    public Guid Id
    {
        get; set;
    }
    public Guid OccurrenceId
    {
        get; set;
    }
    public ExecutionStatus Status
    {
        get; set;
    }
    public WorkoutPrescription Prescription { get; set; } = null!;
    public DateOnly PerformedDate
    {
        get; set;
    }
    public DateTimeOffset StartedAt
    {
        get; set;
    }
    public DateTimeOffset? CompletedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public Guid UpdatedBy
    {
        get; set;
    }
    public string Comment { get; set; } = "";
    public int? DurationSeconds
    {
        get; set;
    }
    public long Version { get; set; } = 1;
    public List<ExerciseExecution> Exercises { get; set; } = [];
}
public sealed class ExerciseExecution
{
    public Guid Id
    {
        get; set;
    }
    public Guid ExecutionId
    {
        get; set;
    }
    public Guid? PrescribedInstanceId
    {
        get; set;
    }
    public Guid ExerciseId
    {
        get; set;
    }
    public bool IsSubstitution
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Comment { get; set; } = "";
    public int Position
    {
        get; set;
    }
    public List<SetExecution> Sets { get; set; } = [];
}
public sealed class SetExecution
{
    public Guid Id
    {
        get; set;
    }
    public Guid ExerciseExecutionId
    {
        get; set;
    }
    public Guid? PrescribedSetId
    {
        get; set;
    }
    public Guid? PrescribedSegmentId
    {
        get; set;
    }
    public int Position
    {
        get; set;
    }
    public bool Skipped
    {
        get; set;
    }
    public int? Reps
    {
        get; set;
    }
    public decimal? Load
    {
        get; set;
    }
    public string? LoadUnit
    {
        get; set;
    }
    public LoadMeaning LoadMeaning
    {
        get; set;
    }
    public decimal? Rpe
    {
        get; set;
    }
    public decimal? Rir
    {
        get; set;
    }
    public decimal? DurationSeconds
    {
        get; set;
    }
    public decimal? DistanceMeters
    {
        get; set;
    }
    public decimal? RestSeconds
    {
        get; set;
    }
    public string? Tempo
    {
        get; set;
    }
    public string Comment { get; set; } = "";
    public decimal? VolumeKg
    {
        get; set;
    }
}

public static class DeliveryModel
{
    public static void Configure(ModelBuilder model)
    {
        var batch = model.Entity<AssignmentBatch>();
        batch.ToTable("assignment_batches");
        batch.HasKey(x => x.Id);
        batch.Property(x => x.IdempotencyKey).HasMaxLength(128);
        batch.Property(x => x.RequestHash).HasMaxLength(64);
        batch.HasIndex(x => new { x.CoachId, x.IdempotencyKey }).IsUnique();
        var group = model.Entity<GroupProgramAssignment>();
        group.ToTable("group_assignments");
        group.HasKey(x => x.Id);
        group.HasIndex(x => new { x.BatchId, x.GroupId }).IsUnique();
        group.HasOne<AssignmentBatch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
        var a = model.Entity<ProgramAssignment>();
        a.ToTable("assignments");
        a.HasKey(x => x.Id);
        a.HasIndex(x => new { x.BatchId, x.RelationshipId }).IsUnique();
        a.HasIndex(x => new { x.RelationshipId, x.Status, x.CreatedAt });
        a.Property(x => x.Version).IsConcurrencyToken();
        a.Property(x => x.Status).HasConversion<string>();
        a.Property(x => x.TimeZone).HasMaxLength(100);
        a.HasOne<AssignmentBatch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<GroupProgramAssignment>().WithMany().HasForeignKey(x => x.GroupAssignmentId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<TrainingPlan>().WithMany().HasForeignKey(x => x.ProgramId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<TrainingRevision>().WithMany().HasForeignKey(x => x.OriginalRevisionId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<TrainingRevision>().WithMany().HasForeignKey(x => x.EffectiveRevisionId).OnDelete(DeleteBehavior.Restrict);
        var source = model.Entity<AssignmentGroupSource>();
        source.ToTable("assignment_group_sources");
        source.HasKey(x => new { x.AssignmentId, x.GroupAssignmentId });
        source.HasOne<ProgramAssignment>().WithMany().HasForeignKey(x => x.AssignmentId).OnDelete(DeleteBehavior.Restrict);
        source.HasOne<GroupProgramAssignment>().WithMany().HasForeignKey(x => x.GroupAssignmentId).OnDelete(DeleteBehavior.Restrict);
        var o = model.Entity<WorkoutOccurrence>();
        o.ToTable("workout_occurrences");
        o.HasKey(x => x.Id);
        o.HasIndex(x => new { x.AssignmentId, x.RevisionId, x.WorkoutId }).IsUnique();
        o.HasIndex(x => new { x.ScheduledDate, x.AssignmentId });
        o.HasOne<ProgramAssignment>().WithMany().HasForeignKey(x => x.AssignmentId).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<TrainingRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict);
        Json(o.Property(x => x.Prescription));
        var e = model.Entity<WorkoutExecution>();
        e.ToTable("workout_executions");
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.OccurrenceId).IsUnique();
        e.HasIndex(x => new { x.PerformedDate, x.Status });
        e.Property(x => x.Version).IsConcurrencyToken();
        e.Property(x => x.Status).HasConversion<string>();
        Json(e.Property(x => x.Prescription));
        e.HasOne<WorkoutOccurrence>().WithMany().HasForeignKey(x => x.OccurrenceId).OnDelete(DeleteBehavior.Restrict);
        e.HasMany(x => x.Exercises).WithOne().HasForeignKey(x => x.ExecutionId).OnDelete(DeleteBehavior.Cascade);
        var ex = model.Entity<ExerciseExecution>();
        ex.ToTable("exercise_executions");
        ex.HasKey(x => x.Id);
        ex.HasIndex(x => new { x.ExerciseId, x.ExecutionId });
        ex.HasMany(x => x.Sets).WithOne().HasForeignKey(x => x.ExerciseExecutionId).OnDelete(DeleteBehavior.Cascade);
        var s = model.Entity<SetExecution>();
        s.ToTable("set_executions");
        s.HasKey(x => x.Id);
        s.Property(x => x.LoadMeaning).HasConversion<string>();
    }
    private static void Json<T>(Microsoft.EntityFrameworkCore.Metadata.Builders.PropertyBuilder<T> p) where T : class =>
        p.HasConversion(v => TrainingJson.Serialize(v), v => TrainingJson.Deserialize<T>(v)).HasColumnType("jsonb");
}
