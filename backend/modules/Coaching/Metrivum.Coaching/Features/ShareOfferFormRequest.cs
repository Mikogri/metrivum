namespace Metrivum.Coaching.Features;

public sealed record ShareOfferFormRequest(Guid UserId, Guid OfferId);

public sealed record InvitationChatReplayDto(
    int Scanned,
    int Delivered,
    int Skipped,
    Guid? NextCursor
);
