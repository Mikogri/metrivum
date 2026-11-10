using Metrivum.BuildingBlocks;
using Metrivum.Forms.Contracts;

namespace Metrivum.Forms.Features;

/// <summary>Adapts MCP form requests to authorized Forms operations; owning services control persistence.</summary>
public sealed class McpFormOperations(FormsService forms) : IMcpFormOperations
{
    public async Task<McpFormPage> ListAsync(
        int page,
        int pageSize,
        string? search,
        CancellationToken ct
    )
    {
        var result = await forms.ListAsync(
            page,
            pageSize,
            FormPurpose.CheckIn,
            false,
            search,
            "updated",
            ct
        );
        return new(
            result
                .Items.Select(x => new McpFormSummary(
                    x.Id,
                    x.Name,
                    x.Description,
                    x.Version,
                    x.CurrentPublishedVersionId
                ))
                .ToArray(),
            page,
            pageSize,
            result.Total
        );
    }

    public async Task<McpForm> GetAsync(Guid templateId, CancellationToken ct)
    {
        var result = await forms.DetailAsync(templateId, ct);
        if (result.Purpose != FormPurpose.CheckIn)
            throw ApiException.NotFound();
        return Map(result);
    }

    public async Task<McpForm> CreateDraftAsync(McpFormDraft request, CancellationToken ct) =>
        Map(
            await forms.CreateAsync(
                new(FormPurpose.CheckIn, request.Name, request.Description, request.Definition),
                ct
            )
        );

    private static McpForm Map(FormTemplateDto form) =>
        new(
            form.Id,
            form.Name,
            form.Description,
            form.Version,
            form.Draft,
            $"/app/forms/{form.Id}",
            form.CurrentPublishedVersionId != null
        );
}
