namespace TrainFlow.Calendar.Features;

public sealed record EventWrite(string Kind, string Title, string? Description, string TimeZone,
    DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc, DateOnly? StartDate, DateOnly? EndDateExclusive,
    string? Location, string? MeetingUrl, IReadOnlyList<Guid> RelationshipIds, IReadOnlyList<Guid> GroupIds);
public sealed record AttendeeDto(Guid RelationshipId, Guid ClientId, string Response, long Version);
public sealed record EventDto(Guid Id, Guid CoachId, string OrganizerName, string Kind, string Title, string Description, string TimeZone,
    DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, DateOnly? StartDate, DateOnly? EndDateExclusive,
    string? Location, string? MeetingUrl, bool Cancelled, long Version, string? Response, long? ResponseVersion,
    IReadOnlyList<AttendeeDto>? Attendees, Guid? TeamId = null);
public sealed record CalendarPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, long Total);
public sealed record EventResponse(string Status);
