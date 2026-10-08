using TrainFlow.BuildingBlocks;
using TrainFlow.Messaging.Features;

namespace TrainFlow.UnitTests;

public sealed class MessagingRulesTests
{
    [Fact]
    public void Canonical_pair_is_direction_independent_and_rejects_self()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        Assert.Equal(MessagingRules.Pair(a, b), MessagingRules.Pair(b, a));
        Assert.Throws<ApiException>(() => MessagingRules.Pair(a, a));
        Assert.Throws<ApiException>(() => MessagingRules.Pair(Guid.Empty, b));
    }

    [Fact]
    public void Cursor_is_conversation_bound_and_rejects_malformed_input()
    {
        var id = Guid.NewGuid();
        var cursor = new MessageCursor(id, DateTimeOffset.UtcNow, Guid.NewGuid());
        Assert.Equal(cursor, MessageCursor.Decode(cursor.Encode(), id));
        Assert.Throws<ApiException>(() => MessageCursor.Decode(cursor.Encode(), Guid.NewGuid()));
        Assert.Throws<ApiException>(() => MessageCursor.Decode("garbage", id));
    }
}
