using Microsoft.EntityFrameworkCore;
using Metrivum.Analytics.Contracts;
using Metrivum.Messaging.Domain;

namespace Metrivum.Messaging.Infrastructure;

public sealed class MessagingAnalytics(MessagingDbContext db) : IMessagingAnalytics
{
    public async Task<MessagingAnalysis> QueryAsync(AnalysisScope scope, CancellationToken ct)
    {
        // Personal workspace activity, independent of offer/group filters; count only currently authorized conversations and membership bounds.
        var q =
            from message in db.Messages
            join member in db.Members on message.ConversationId equals member.ConversationId
            where
                member.UserId == scope.CoachId
                && member.State == MemberState.Active
                && !member.Excluded
                && message.Type != MessageType.System
                && message.CreatedAt >= member.JoinedAt
                && message.CreatedAt >= scope.Window.Start
                && message.CreatedAt < scope.Window.End
            select message;
        var totals = await q.GroupBy(x => 1)
            .Select(g => new
            {
                Sent = g.Count(x => x.SenderUserId == scope.CoachId),
                Received = g.Count(x => x.SenderUserId != scope.CoachId),
                Conversations = g.Select(x => x.ConversationId).Distinct().Count(),
            }).SingleOrDefaultAsync(ct);
        return new(totals?.Sent ?? 0, totals?.Received ?? 0, totals?.Conversations ?? 0);
    }
}
