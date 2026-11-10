using Metrivum.Accounts.Contracts;
using Metrivum.Coaching.Contracts;

namespace Metrivum.Coaching.Features;

/// <summary>Adapts MCP client requests to authorized Coaching operations; owning services control persistence.</summary>
public sealed class McpClientOperations(CoachingService coaching, CoachingIntakeService intake)
    : IMcpClientOperations
{
    public async Task<McpClientPage> ListAsync(
        int page,
        int pageSize,
        string? search,
        CancellationToken ct
    )
    {
        var result = await coaching.ClientsAsync(
            new()
            {
                Page = page,
                PageSize = pageSize,
                Search = search,
            },
            ct
        );
        return new(result.Items.Select(Map).ToArray(), page, pageSize, result.Total);
    }

    public async Task<McpClient> GetAsync(Guid relationshipId, CancellationToken ct) =>
        Map(await coaching.ClientAsync(relationshipId, ct));

    public async Task<McpClientTrainingContext> ContextAsync(
        Guid relationshipId,
        CancellationToken ct
    )
    {
        var relationship = await GetAsync(relationshipId, ct);
        var profile = await intake.RelationshipProfileAsync(relationshipId, ct);
        var allowed = new[]
        {
            SystemFieldKey.TrainingExperience,
            SystemFieldKey.ActivityLevel,
            SystemFieldKey.AvailableEquipment,
            SystemFieldKey.PreferredTrainingDays,
            SystemFieldKey.SessionsPerWeek,
            SystemFieldKey.AvailableSessionDuration,
        };
        return new(
            relationship,
            profile
                .CurrentAllowedProfile.Where(x => allowed.Contains(x.Key))
                .ToDictionary(x => x.Key.ToString(), x => x.Value),
            null
        );
    }

    public async Task<McpLeadPage> LeadsAsync(
        int page,
        int pageSize,
        string? search,
        CancellationToken ct
    )
    {
        var result = await intake.ApplicationsAsync(
            true,
            page,
            pageSize,
            search,
            "updated",
            null,
            null,
            ct
        );
        return new(
            result
                .Items.Select(x => new McpLead(
                    x.Id,
                    x.ApplicantUserId,
                    x.Applicant.DisplayName,
                    x.OfferName,
                    x.Source.ToString(),
                    x.Status.ToString(),
                    x.CreatedAt,
                    x.SubmittedAt,
                    x.RelationshipId
                ))
                .ToArray(),
            page,
            pageSize,
            result.Total
        );
    }

    private static McpClient Map(CoachRelationshipDto x) =>
        new(
            x.Id,
            x.Client.Id,
            x.Client.DisplayName,
            x.Client.Username,
            x.Status,
            x.StartedAt,
            x.UpdatedAt,
            x.Version
        );
}
