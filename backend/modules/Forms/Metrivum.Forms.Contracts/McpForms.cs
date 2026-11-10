namespace Metrivum.Forms.Contracts;

public sealed record McpFormSummary(
    Guid Id,
    string Name,
    string Description,
    long Revision,
    Guid? PublishedVersionId
);

public sealed record McpFormPage(McpFormSummary[] Items, int Page, int PageSize, long Total);

public sealed record McpFormDraft(string Name, string Description, FormDefinition Definition);

public sealed record McpForm(
    Guid Id,
    string Name,
    string Description,
    long Revision,
    FormDefinition Definition,
    string EditorPath,
    bool Published
);

public interface IMcpFormOperations
{
    Task<McpFormPage> ListAsync(int page, int pageSize, string? search, CancellationToken ct);
    Task<McpForm> GetAsync(Guid templateId, CancellationToken ct);
    Task<McpForm> CreateDraftAsync(McpFormDraft request, CancellationToken ct);
}
