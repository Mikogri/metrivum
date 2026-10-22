using TrainFlow.Calendar.Contracts;

namespace TrainFlow.Calendar.Features;

public sealed class McpCalendarOperations(CalendarService calendar) : IMcpCalendarOperations
{
    public async Task<McpCalendarPage> ListAsync(DateTimeOffset from, DateTimeOffset to, string timeZone, int page, int pageSize, CancellationToken ct)
    {
        var result = await calendar.List("coach", from, to, timeZone, page, pageSize, ct);
        return new(result.Items.Select(x => new McpCalendarEvent(x.Id, x.Kind, x.Title, x.Description, x.TimeZone,
            x.StartsAtUtc, x.EndsAtUtc, x.Cancelled, x.Location)).ToArray(), page, pageSize, result.Total);
    }
}
