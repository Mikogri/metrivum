namespace TrainFlow.Training.Contracts;

public sealed record AssignedProgramCycle(Guid CycleId, DateOnly StartDate, int DayCount);
public sealed record AssignedProgramCycles(Guid AssignmentId, Guid RelationshipId, string ProgramName, string TimeZone, bool Active, IReadOnlyList<AssignedProgramCycle> Cycles, bool Ended = false);

public interface IAssignedProgramCycles
{
    Task<AssignedProgramCycles?> GetAsync(Guid coachId, Guid assignmentId, CancellationToken ct);
    Task<IReadOnlyList<AssignedProgramCycles>> ListAsync(Guid coachId, Guid relationshipId, CancellationToken ct);
}

// Called inside the assignment write transaction, with its assignment lock held.
public interface IAssignedProgramScheduleObserver
{
    Task ChangedAsync(Guid coachId, AssignedProgramCycles assignment, CancellationToken ct);
}
