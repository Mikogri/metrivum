namespace Metrivum.ClientDocumentation.Contracts;

public sealed record DocumentationPage<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int Total
);

public sealed record MeasurementDefinition(string Key, string Label, string[] Units);

public sealed record MeasurementInput(
    string Key,
    string Unit,
    decimal Value,
    DateTimeOffset ObservedAt,
    string? Comment
);

public sealed record MeasurementDto(
    Guid Id,
    Guid RelationshipId,
    string Key,
    string Unit,
    decimal Value,
    DateTimeOffset ObservedAt,
    string? Comment,
    Guid AuthorId,
    string Source,
    DateTimeOffset CreatedAt,
    long Version,
    DateTimeOffset UpdatedAt
);

public sealed record MeasurementTrend(
    string Key,
    string Unit,
    IReadOnlyList<MeasurementPoint> Points,
    decimal? LatestValue,
    DateTimeOffset? LatestAt,
    decimal? Change,
    string Aggregation
);

public sealed record MeasurementPoint(DateTimeOffset ObservedAt, decimal Value);

public sealed record NoteInput(string Text, string? Title = null);

public sealed record NoteDto(
    Guid Id,
    string Text,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    long Version,
    string Title,
    Guid AuthorId
);

public sealed record DocumentInput(
    string Title,
    string? Description,
    string Category,
    string Visibility,
    string? Text,
    Guid? MediaId,
    DateTimeOffset ObservedAt
);

public sealed record DocumentEdit(
    string Title,
    string? Description,
    string Category,
    string? Text,
    DateTimeOffset ObservedAt
);

public sealed record VisibilityInput(string Visibility);

public sealed record DocumentationUploadInput(string Name, string ContentType, long Size);

public sealed record DocumentDto(
    Guid Id,
    Guid RelationshipId,
    string Title,
    string? Description,
    string Category,
    string Visibility,
    string? Text,
    string? ContentType,
    bool HasFile,
    Guid AuthorId,
    string Source,
    DateTimeOffset ObservedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    long Version,
    string[] AllowedActions,
    long? Size
);

public sealed record DocumentationAccess(string Status, bool Coach, string[] AllowedActions);
