using System.Text.Json;
using System.Text.Json.Serialization;
using Metrivum.Accounts.Contracts;

namespace Metrivum.Forms.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<FormPurpose>))]
public enum FormPurpose
{
    Application,
    CheckIn,
}

[JsonConverter(typeof(JsonStringEnumConverter<QuestionType>))]
public enum QuestionType
{
    ShortText,
    LongText,
    Number,
    YesNo,
    SingleChoice,
    MultiChoice,
    Scale,
    Date,
    FileAttachment,
}

public sealed record FormChoice(string Key, string Label);

public sealed record FormQuestion(
    string Key,
    string Label,
    QuestionType Type,
    bool Required = false,
    int Order = 0,
    string? HelpText = null,
    decimal? Min = null,
    decimal? Max = null,
    string? Unit = null,
    int? MaxLength = null,
    int? MinSelections = null,
    int? MaxSelections = null,
    string? MinLabel = null,
    string? MaxLabel = null,
    IReadOnlyList<FormChoice>? Choices = null,
    SystemFieldKey? SystemField = null
);

public sealed record FormSection(
    string Key,
    string Title,
    int Order,
    IReadOnlyList<FormQuestion> Questions,
    string? Description = null
);

public sealed record FormDefinition(IReadOnlyList<FormSection> Sections);

public sealed record FormVersionDto(
    Guid Id,
    Guid TemplateId,
    Guid CoachId,
    FormPurpose Purpose,
    string Name,
    string Description,
    FormDefinition Definition,
    int Number,
    DateTimeOffset PublishedAt
);

public sealed record FormSubmissionCommand(
    Guid FormVersionId,
    Guid RespondentId,
    string SourceKey,
    IReadOnlyDictionary<string, JsonElement> Answers
);

public sealed record FormSubmissionDto(
    Guid Id,
    Guid FormVersionId,
    Guid RespondentId,
    string SourceKey,
    IReadOnlyDictionary<string, JsonElement> Answers,
    DateTimeOffset SubmittedAt
);

// Internal workflow callers must authorize offer/request/relationship context before using these methods.
// No unscoped public endpoint exposes versions or submissions to respondents.
public interface IFormLibrary
{
    Task<IReadOnlyList<Guid>> GetVersionIdsForTemplateAsync(
        Guid templateId,
        CancellationToken ct
    ) => Task.FromResult<IReadOnlyList<Guid>>([]);
    Task<FormVersionDto> GetVersionAsync(Guid id, CancellationToken cancellationToken);
    Task<FormVersionDto> RequireUsableVersionAsync(
        Guid id,
        Guid coachId,
        FormPurpose purpose,
        CancellationToken cancellationToken
    );
    Task<IReadOnlyDictionary<Guid, FormVersionDto>> GetVersionsAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken
    );
    Task<FormVersionDto> GetCurrentVersionAsync(
        Guid templateId,
        CancellationToken cancellationToken
    );
    Task ValidateAsync(
        Guid versionId,
        IReadOnlyDictionary<string, JsonElement> answers,
        CancellationToken cancellationToken
    );
    Task<FormSubmissionDto> SubmitAsync(
        FormSubmissionCommand command,
        CancellationToken cancellationToken
    );
    Task<FormSubmissionDto> GetSubmissionAsync(Guid id, CancellationToken cancellationToken);
}
