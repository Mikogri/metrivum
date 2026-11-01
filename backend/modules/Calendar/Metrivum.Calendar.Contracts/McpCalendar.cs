namespace Metrivum.Calendar.Contracts;

public sealed record McpCalendarEvent(Guid Id, string Kind, string Title, string Description, string TimeZone,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool Cancelled, string? Location);
public sealed record McpCalendarPage(McpCalendarEvent[] Items, int Page, int PageSize, long Total);
public interface IMcpCalendarOperations
{
    Task<McpCalendarPage> ListAsync(DateTimeOffset from, DateTimeOffset to, string timeZone, int page, int pageSize, CancellationToken ct);
}
