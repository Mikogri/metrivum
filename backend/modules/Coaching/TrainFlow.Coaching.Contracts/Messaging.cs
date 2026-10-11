namespace TrainFlow.Coaching.Contracts;

public sealed record CoachingChatEntry(string Kind, Guid? InvitationId, Guid OfferId, Guid CoachId, Guid OfferRevisionId, Guid FormVersionId, string Title);
public sealed record CoachingChatDelivery(Guid ConversationId, Guid MessageId);
public interface ICoachingChatPublisher
{
    Task<CoachingChatDelivery> PublishAsync(Guid recipientId, string eventKey, CoachingChatEntry entry, string? body, CancellationToken ct, bool historical = false);
}

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
