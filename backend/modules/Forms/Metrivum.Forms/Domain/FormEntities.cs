using Metrivum.Forms.Contracts;

namespace Metrivum.Forms.Domain;

public sealed class FormTemplate
{
    public Guid Id
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public FormPurpose Purpose
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Draft { get; set; } = "{}";
    public Guid? CurrentPublishedVersionId
    {
        get; set;
    }
    public bool Archived
    {
        get; set;
    }
    public DateTimeOffset CreatedAt
    {
        get; set;
    }
    public DateTimeOffset UpdatedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1;
}
public sealed class FormVersion
{
    public Guid Id
    {
        get; set;
    }
    public Guid TemplateId
    {
        get; set;
    }
    public Guid CoachId
    {
        get; set;
    }
    public FormPurpose Purpose
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Definition { get; set; } = "{}";
    public int Number
    {
        get; set;
    }
    public long DraftVersion
    {
        get; set;
    }
    public DateTimeOffset PublishedAt
    {
        get; set;
    }
}
public sealed class FormSubmission
{
    public Guid Id
    {
        get; set;
    }
    public Guid FormVersionId
    {
        get; set;
    }
    public Guid RespondentId
    {
        get; set;
    }
    public string SourceKey { get; set; } = "";
    public string Answers { get; set; } = "{}";
    public DateTimeOffset SubmittedAt
    {
        get; set;
    }
}
public sealed class FormOperation
{
    public Guid SourceTemplateId
    {
        get; set;
    }
    public string Key { get; set; } = "";
    public long SourceVersion
    {
        get; set;
    }
    public Guid ResultTemplateId
    {
        get; set;
    }
}
