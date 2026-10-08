namespace TrainFlow.Coaching.Contracts;

public sealed record MessagingClientGroup(Guid Id, Guid CoachId, string Title, bool Archived, Guid[] EligibleUserIds);
public interface ICoachingMessagingDirectory
{
    Task<bool> IsActivePairAsync(Guid first, Guid second, CancellationToken ct);
    Task<MessagingClientGroup> OwnedGroupAsync(Guid groupId, CancellationToken ct);
}

// Called inside the Coaching transaction after its durable mutation. Implementations must enlist in ModuleTransaction.
public interface ICoachingMessagingObserver
{
    Task GroupChangedAsync(MessagingClientGroup group, CancellationToken ct);
}
