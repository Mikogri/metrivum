using System.Text.Json;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.CheckIns.Contracts;
using TrainFlow.CheckIns.Domain;

namespace TrainFlow.CheckIns.Features;

public sealed class McpCheckInOperations(CheckInsService checkins, IAccountContext accounts) : IMcpCheckInOperations
{
    public async Task<McpCheckInPage> ListAsync(Guid? relationshipId, DateTimeOffset from, DateTimeOffset to, string? status, int page, int pageSize, CancellationToken ct)
    {
        RequestStatus? parsed = null;
        if (status is not null)
        {
            if (!Enum.TryParse<RequestStatus>(status, false, out var value) || !Enum.IsDefined(value)) throw ApiException.Invalid("Unknown check-in status.");
            parsed = value;
        }
        var result = await checkins.RequestsAsync(page, pageSize, null, "due", parsed, relationshipId, null, "coach", ct, from, to);
        return new(result.Items.Select(Map).ToArray(), page, pageSize, result.Total);
    }
    public async Task<McpCheckInSubmission> SubmissionAsync(Guid requestId, CancellationToken ct)
    {
        await accounts.RequireCoachAsync(ct);
        var result = await checkins.DetailAsync(requestId, ct);
        if (result.Form.CoachId != accounts.UserId) throw ApiException.NotFound();
        return new(Map(result.Request), result.Form.Definition, result.Submission?.Answers, result.Submission?.SubmittedAt,
            "Recorded check-in answers; measurement timestamp is the submission time, not a medical assessment.");
    }
    public Task<McpAssignmentPreview> ProposeAssignmentAsync(McpCheckInAssignment request, CancellationToken ct) => checkins.PreviewMcpAssignmentAsync(request, ct);
    private static McpCheckIn Map(CheckInRequestDto x) => new(x.Id, x.RelationshipId, x.ScheduleName, x.AvailableAtUtc, x.DueAtUtc,
        x.Status.ToString(), x.SubmittedAt, x.ReviewedAt, x.WasLate);
}

public sealed partial class CheckInsService
{
    public async Task<McpAssignmentPreview> PreviewMcpAssignmentAsync(McpCheckInAssignment input, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        var recurrence = JsonSerializer.Deserialize<Recurrence>(JsonSerializer.Serialize(input.Recurrence))!;
        var request = new ScheduleRequest(input.FormTemplateId, input.Name, input.Description, input.TimeZone, recurrence,
            input.ResponseWindowHours, input.RelationshipIds, input.GroupIds);
        Validate(request);
        return await transaction.RunAsync(async token =>
        {
            var team = await LockCurrentTeamAsync(owner.UserId, token);
            var assignment = await ValidateDependenciesAsync(request, owner, team, token);
            var version = await forms.GetCurrentVersionAsync(request.FormTemplateId, token);
            var people = await recipients.ResolveActiveAsync(owner.UserId, owner.WorkspaceId, request.RelationshipIds, request.GroupIds, token);
            return new McpAssignmentPreview(request.FormTemplateId, version.Id, people.Select(x => x.Id).Distinct().ToArray(),
                request.TimeZone, Next(request.Recurrence, request.TimeZone, assignment), request.ResponseWindowHours, "/app/check-ins", false);
        }, ct);
    }
}
