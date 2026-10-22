using Microsoft.EntityFrameworkCore;
using TrainFlow.BuildingBlocks;
using TrainFlow.Messaging.Domain;

namespace TrainFlow.Messaging.Features;

public sealed partial class MessagingService
{
    // A nonempty direct conversation is already an established contact, including incoming introductions.
    private Task AdmitDirectContactAsync(Conversation conversation, CancellationToken ct) => conversation.Sequence == 0
        ? AdmitRecipientsAsync([conversation.PairFirst == Actor ? conversation.PairSecond!.Value : conversation.PairFirst!.Value], false, ct)
        : Task.CompletedTask;

    // Called within the business transaction. One sender lock serializes contacts across all transports.
    private async Task AdmitRecipientsAsync(IEnumerable<Guid> recipients, bool creatingGroup, CancellationToken ct)
    {
        var targets = recipients.Where(x => x != Actor).Distinct().ToArray();
        if (targets.Length > abuseLimits.MaximumRecipients) throw ApiException.Invalid($"At most {abuseLimits.MaximumRecipients} unique recipients are allowed.");
        await Lock("messaging-abuse:" + Actor, ct);
        var now = clock.GetUtcNow();
        if (creatingGroup)
        {
            if (await db.AbuseRecords.CountAsync(x => x.UserId == Actor && x.Kind == "group" && x.CreatedAt > now.AddDays(-1), ct) >= abuseLimits.GroupsPerDay)
                throw AbuseRejected(TimeSpan.FromDays(1));
            await db.AbuseRecords.Where(x => x.UserId == Actor && x.Kind == "group" && x.CreatedAt <= now.AddDays(-1)).ExecuteDeleteAsync(ct);
            db.AbuseRecords.Add(new() { UserId = Actor, Kind = "group", CreatedAt = now });
        }
        var trusted = await coaching.HasActiveRelationshipAsync(Actor, ct);
        foreach (var recipient in targets)
        {
            if (await coaching.IsActivePairAsync(Actor, recipient, ct)) continue;
            if (await db.AbuseRecords.AnyAsync(x => x.UserId == Actor && x.RecipientId == recipient && x.Kind == "contact", ct)) continue;
            // Existing communication, including an incoming introduction, is not a new unsolicited contact.
            if (await db.Conversations.AnyAsync(x => x.Type == ConversationType.Direct && x.Sequence > 0 &&
                ((x.PairFirst == Actor && x.PairSecond == recipient) || (x.PairFirst == recipient && x.PairSecond == Actor)), ct)) continue;
            var recent = await db.AbuseRecords.Where(x => x.UserId == Actor && x.Kind == "contact" && x.CreatedAt > now.AddDays(-1))
                .Select(x => x.CreatedAt).ToArrayAsync(ct);
            var pending = db.AbuseRecords.Local.Count(x => x.UserId == Actor && x.Kind == "contact" && db.Entry(x).State == EntityState.Added);
            if (recent.Count(x => x > now.AddHours(-1)) + pending >= abuseLimits.StrangerContactsPerHour || (!trusted && recent.Length + pending >= abuseLimits.UnestablishedContactsPerDay))
                throw AbuseRejected(trusted ? TimeSpan.FromHours(1) : TimeSpan.FromDays(1));
            db.AbuseRecords.Add(new() { UserId = Actor, RecipientId = recipient, Kind = "contact", CreatedAt = now });
        }
    }

    private static ApiException AbuseRejected(TimeSpan retry) => new(429, "RATE_LIMIT_EXCEEDED",
        "The new contact or group budget has been reached. Try again later.", retryAfter: retry);
}
