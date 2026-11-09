using Metrivum.BuildingBlocks;

namespace Metrivum.Training.Delivery;

public sealed record WorkoutFeedback(int Rating, decimal SessionRpe, int Wellbeing, int SleepQuality, string? Note = null);

/// <summary>Validates optional post-workout feedback ranges before persistence.</summary>
public static class WorkoutFeedbackRules
{
    public static void Validate(WorkoutFeedback value)
    {
        if (value.Rating is < 1 or > 5 || value.SessionRpe is < 0 or > 10 || value.Wellbeing is < 1 or > 5
            || value.SleepQuality is < 1 or > 5 || value.Note?.Length > 2000)
            throw ApiException.Invalid("Rating, wellbeing and sleep must be 1–5, session RPE 0–10, and the note at most 2000 characters.");
    }
}

/// <summary>Manages assignments, frozen workout prescriptions, executions and progress in the Training database.</summary>
public sealed partial class TrainingDeliveryService
{
    public Task<ExecutionDto> SaveFeedbackAsync(Guid id, WorkoutFeedback feedback, long version, CancellationToken ct) => MutateAsync(async () =>
    {
        WorkoutFeedbackRules.Validate(feedback);
        var (execution, assignment) = await ExecutionContextAsync(id, ct);
        if (assignment.ClientId != accounts.UserId) throw ApiException.NotFound();
        if (execution.Status != ExecutionStatus.Completed) throw ApiException.Conflict("Finish the workout before giving feedback.");
        DeliveryRules.Version(execution.Version, version);
        execution.Feedback = feedback with { Note = string.IsNullOrWhiteSpace(feedback.Note) ? null : feedback.Note.Trim() };
        Touch(execution);
        await db.SaveChangesAsync(ct);
        return ExecutionDto(execution, true);
    }, ct);
}
