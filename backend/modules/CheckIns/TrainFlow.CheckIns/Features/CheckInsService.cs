using TrainFlow.Notifications.Contracts;
using TrainFlow.Training.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TrainFlow.Access.Contracts;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.CheckIns.Domain;
using TrainFlow.CheckIns.Infrastructure;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Forms.Contracts;

namespace TrainFlow.CheckIns.Features;

public sealed partial class CheckInsService(CheckInsDbContext db, IAccountContext accounts, IFeatureAccessService access, IRelationshipRecipients recipients,
    IRelationshipAccessPolicy relationshipPolicy, IFormLibrary forms, ModuleTransaction transaction, TimeProvider clock, INotificationPublisher notifications, ITeamContext? teams = null, IAssignedProgramCycles? assignedPrograms = null)
{
    public async Task<ScheduleDto> CreateAsync(ScheduleRequest request, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        Validate(request);
        return await transaction.RunAsync(async token =>
        {
            var lockedTeam = await LockCurrentTeamAsync(owner.UserId, token);
            var assignment = await ValidateDependenciesAsync(request, owner, lockedTeam, token);
            var now = clock.GetUtcNow();
            var schedule = new CheckInSchedule { CoachId = owner.UserId, WorkspaceId = owner.WorkspaceId, FormTemplateId = request.FormTemplateId, Name = request.Name.Trim(), Description = request.Description, TimeZone = request.TimeZone, RecurrenceJson = JsonSerializer.Serialize(request.Recurrence), ResponseWindowHours = request.ResponseWindowHours, NextAvailableAtUtc = Next(request.Recurrence, request.TimeZone, assignment), CreatedAt = now, UpdatedAt = now };
            db.Schedules.Add(schedule);
            AddTargets(schedule, request);
            await SaveAsync(token);
            return await DtoAsync(schedule, token);
        }, ct);
    }
    public async Task<ScheduleDto> UpdateAsync(Guid id, ScheduleRequest request, long version, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        Validate(request);
        return await transaction.RunAsync(async token =>
        {
            var lockedTeam = await LockCurrentTeamAsync(owner.UserId, token);
            var prior = await OwnedScheduleAsync(id, owner, false, token);
            var priorRecurrence = JsonSerializer.Deserialize<Recurrence>(prior.RecurrenceJson)!;
            if (assignedPrograms != null)
                foreach (var assignmentId in new[] { priorRecurrence.AssignmentId, request.Recurrence.AssignmentId }.Where(x => x != null).Select(x => x!.Value).Distinct().Order())
                    await assignedPrograms.GetAsync(owner.UserId, assignmentId, token);
            var s = await OwnedScheduleAsync(id, owner, true, token);
            CheckInRules.CheckVersion(s.Version, version);
            if (s.Status == ScheduleStatus.Ended)
                throw ApiException.Conflict("Ended schedules cannot be edited.");
            var assignment = await ValidateDependenciesAsync(request, owner, lockedTeam, token);
            s.FormTemplateId = request.FormTemplateId;
            s.Name = request.Name.Trim();
            s.Description = request.Description;
            s.ResponseWindowHours = request.ResponseWindowHours;
            var recurrence = JsonSerializer.Serialize(request.Recurrence);
            // Canonicalize jsonb formatting and omitted legacy optional fields before comparing.
            if (JsonSerializer.Serialize(JsonSerializer.Deserialize<Recurrence>(s.RecurrenceJson)) != recurrence || s.TimeZone != request.TimeZone)
            {
                var after = clock.GetUtcNow();
                var latest = await db.Requests.Where(r => r.ScheduleId == id).MaxAsync(r => (DateTimeOffset?)r.AvailableAtUtc, token);
                if (latest != null)
                {
                    // A release-time edit must not issue a second request for an already released local day.
                    var local = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(latest.Value, CheckInRules.Zone(request.TimeZone)).DateTime);
                    var end = CheckInRules.ToUtc(local.AddDays(1), TimeOnly.MinValue, CheckInRules.Zone(request.TimeZone)).AddTicks(-1);
                    if (end > after) after = end;
                }
                s.NextAvailableAtUtc = Next(request.Recurrence, request.TimeZone, assignment, after);
            }
            s.RecurrenceJson = recurrence;
            s.TimeZone = request.TimeZone;
            s.LastFailure = null;
            s.RetryAtUtc = null;
            s.FailureCount = 0;
            var targets = await db.Targets.Where(x => x.ScheduleId == id).ToArrayAsync(token);
            db.Targets.RemoveRange(targets);
            await SaveAsync(token);
            AddTargets(s, request);
            Touch(s);
            await SaveAsync(token);
            return await DtoAsync(s, token);
        }, ct);
    }
    public async Task<ScheduleDto> ChangeStatusAsync(Guid id, ScheduleStatus status, long version, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        return await transaction.RunAsync(async token =>
        {
            var s = await OwnedScheduleAsync(id, owner, true, token);
            CheckInRules.CheckVersion(s.Version, version);
            if (!Enum.IsDefined(status))
                throw ApiException.Invalid("Invalid schedule status.");
            if (s.Status == status)
                return await DtoAsync(s, token);
            if (s.Status == ScheduleStatus.Ended)
                throw ApiException.Conflict("Ended schedules cannot resume.");
            s.Status = status;
            if (status == ScheduleStatus.Active)
            {
                s.RetryAtUtc = null;
                s.LastFailure = null;
            }
            Touch(s);
            await SaveAsync(token);
            return await DtoAsync(s, token);
        }, ct);
    }
    public async Task<ScheduleDto> ScheduleAsync(Guid id, CancellationToken ct) => await DtoAsync(await OwnedScheduleAsync(id, await CoachAsync("checkins.schedules.manage", ct), false, ct), ct);
    public async Task<CheckInPage<ScheduleDto>> SchedulesAsync(int page, int size, string? search, string sort, ScheduleStatus? status, CancellationToken ct, Guid? relationshipId = null)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        CheckInRules.Pagination(page, size);
        CheckInRules.Text(search, 200);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid schedule status.");
        var query = db.Schedules.AsNoTracking().Where(x => x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId);
        if (relationshipId != null)
        {
            if (!(await recipients.GetForUserAsync(owner.UserId, true, ct)).Any(x => x.Id == relationshipId && x.WorkspaceId == owner.WorkspaceId)) throw ApiException.NotFound();
            var groupIds = await db.Targets.AsNoTracking().Where(x => x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId && x.IsGroup).Select(x => x.TargetId).Distinct().ToArrayAsync(ct);
            var sources = await recipients.GetGroupSourcesAsync(owner.UserId, owner.WorkspaceId, groupIds, ct);
            var matchingGroups = sources.Where(x => x.RelationshipId == relationshipId).Select(x => x.GroupId).ToArray();
            query = query.Where(x => db.Requests.Any(r => r.ScheduleId == x.Id && r.RelationshipId == relationshipId) || db.Targets.Any(t => t.ScheduleId == x.Id && (!t.IsGroup && t.TargetId == relationshipId || t.IsGroup && matchingGroups.Contains(t.TargetId))));
        }
        if (status != null)
            query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(text));
        }
        var count = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "name" => query.OrderBy(x => x.Name).ThenBy(x => x.Id),
            "updated" => query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id),
            "next" => query.OrderBy(x => x.NextAvailableAtUtc).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be name, updated, or next.")
        };
        var rows = await ordered.Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var targets = await db.Targets.AsNoTracking().Where(x => ids.Contains(x.ScheduleId)).ToArrayAsync(ct);
        return new(rows.Select(x => Dto(x, targets.Where(t => t.ScheduleId == x.Id))).ToArray(), page, size, count);
    }
    public async Task<CheckInPage<CheckInRequestDto>> RequestsAsync(int page, int size, string? search, string sort, RequestStatus? status, Guid? relationshipId, Guid? scheduleId, string role, CancellationToken ct, DateTimeOffset? from = null, DateTimeOffset? to = null, Guid? formTemplateId = null)
    {
        if (from >= to) throw ApiException.Invalid("The date range must end after it starts.");
        CheckInRules.Pagination(page, size);
        CheckInRules.Text(search, 200);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid request status.");
        var coach = role switch
        {
            "coach" => true,
            "client" => false,
            _ => throw ApiException.Invalid("Role must be coach or client.")
        };
        var identity = coach ? await CoachAsync("checkins.review", ct) : await ClientAsync(ct);
        await access.RequireAsync(coach ? "coaching.clients.view" : "coaching.relationships.read-own", ct);
        var visible = await recipients.GetForUserAsync(identity.UserId, coach, ct);
        var ids = visible.Where(x => coach ? x.WorkspaceId == identity.WorkspaceId : x.Status is RelationshipStatus.Active or RelationshipStatus.Completed).Select(x => x.Id).ToArray();
        var completed = visible.Where(x => x.Status == RelationshipStatus.Completed).Select(x => x.Id).ToArray();
        var query = db.Requests.AsNoTracking().Where(x => ids.Contains(x.RelationshipId) && (coach ? x.CoachId == identity.UserId && x.WorkspaceId == identity.WorkspaceId : x.ClientId == identity.UserId));
        if (!coach)
            query = query.Where(x => x.AvailableAtUtc <= clock.GetUtcNow() && (!completed.Contains(x.RelationshipId) || x.Status == RequestStatus.Submitted || x.Status == RequestStatus.Reviewed));
        if (from != null)
            query = query.Where(x => x.DueAtUtc > from);
        if (to != null)
            query = query.Where(x => x.AvailableAtUtc < to);
        if (relationshipId != null)
            query = query.Where(x => x.RelationshipId == relationshipId);
        if (formTemplateId != null)
        {
            var versions = await forms.GetVersionIdsForTemplateAsync(formTemplateId.Value, ct);
            query = query.Where(x => versions.Contains(x.FormVersionId));
        }
        if (scheduleId != null)
            query = query.Where(x => x.ScheduleId == scheduleId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var text = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.ScheduleName.ToLower().Contains(text));
        }
        var now = clock.GetUtcNow();
        if (status != null)
            query = status switch
            {
                RequestStatus.Scheduled => query.Where(x => x.Status == RequestStatus.Scheduled && x.AvailableAtUtc > now),
                RequestStatus.Available => query.Where(x => x.Status == RequestStatus.Scheduled && x.AvailableAtUtc <= now && x.DueAtUtc >= now),
                RequestStatus.Overdue => query.Where(x => x.Status == RequestStatus.Scheduled && x.DueAtUtc < now),
                _ => query.Where(x => x.Status == status)
            };
        var count = await query.LongCountAsync(ct);
        var ordered = sort switch
        {
            "due" => query.OrderBy(x => x.DueAtUtc).ThenBy(x => x.Id),
            "latest" or "available" => query.OrderByDescending(x => x.AvailableAtUtc).ThenBy(x => x.Id),
            "status" => query.OrderBy(x => x.Status == RequestStatus.Scheduled ? x.AvailableAtUtc > now ? RequestStatus.Scheduled : x.DueAtUtc < now ? RequestStatus.Overdue : RequestStatus.Available : x.Status).ThenBy(x => x.DueAtUtc).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be due, available, or status.")
        };
        return new((await ordered.Skip((page - 1) * size).Take(size).ToArrayAsync(ct)).Select(RequestDto).ToArray(), page, size, count);
    }
    public async Task<CheckInSummaryDto> SummaryAsync(Guid relationshipId, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.review", ct);
        await access.RequireAsync("coaching.clients.view", ct);
        var visible = await recipients.GetForUserAsync(owner.UserId, true, ct);
        if (!visible.Any(x => x.Id == relationshipId && x.WorkspaceId == owner.WorkspaceId)) throw ApiException.NotFound();
        var decision = await relationshipPolicy.DecideAsync(relationshipId, RelationshipOperation.HistoricalSharedRead, ct);
        if (!decision.Allowed) throw ApiException.NotFound();
        var q = db.Requests.AsNoTracking().Where(x => x.RelationshipId == relationshipId && x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId);
        var now = clock.GetUtcNow();
        var submitted = await q.CountAsync(x => x.Status == RequestStatus.Submitted, ct);
        var overdue = await q.CountAsync(x => x.Status == RequestStatus.Scheduled && x.DueAtUtc < now, ct);
        var reviewed = await q.CountAsync(x => x.Status == RequestStatus.Reviewed, ct);
        var last = await q.Where(x => x.AvailableAtUtc <= now).OrderByDescending(x => x.AvailableAtUtc).ThenBy(x => x.Id).FirstOrDefaultAsync(ct);
        var next = await q.Where(x => x.Status == RequestStatus.Scheduled && x.DueAtUtc >= now).MinAsync(x => (DateTimeOffset?)x.DueAtUtc, ct);
        return new(submitted, overdue, submitted, reviewed, last == null ? null : RequestDto(last), next);
    }
    public async Task<CheckInDetailDto> RelationshipDetailAsync(Guid relationshipId, Guid requestId, CancellationToken ct)
    {
        if (!await db.Requests.AnyAsync(x => x.Id == requestId && x.RelationshipId == relationshipId, ct)) throw ApiException.NotFound();
        return await DetailAsync(requestId, ct);
    }
    public async Task<CheckInDetailDto> DetailAsync(Guid id, CancellationToken ct)
    {
        var r = await db.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (x.CoachId == accounts.UserId || x.ClientId == accounts.UserId), ct) ?? throw ApiException.NotFound();
        var coach = r.CoachId == accounts.UserId;
        var operation = coach || r.Status is RequestStatus.Submitted or RequestStatus.Reviewed
            ? RelationshipOperation.HistoricalSharedRead : RelationshipOperation.ProtectedRead;
        await AuthorizeAsync(r, coach, operation, ct);
        return await DetailDtoAsync(r, coach, ct);
    }
    public async Task<CheckInDetailDto> SubmitAsync(Guid id, SubmitCheckInRequest request, long version, CancellationToken ct)
    {
        await ClientAsync(ct);
        return await transaction.RunAsync(async token =>
        {
            var r = await LockRequestAsync(id, false, token);
            await AuthorizeAsync(r, false, RelationshipOperation.ProtectedWrite, token);
            CheckInRules.CheckVersion(r.Version, version);
            if (r.Status is RequestStatus.Submitted or RequestStatus.Reviewed)
            {
                // Exact-answer retries remain read-only; changed answers never replace a submission.
                await forms.SubmitAsync(new(r.FormVersionId, r.ClientId, "checkin:" + r.Id, request.Answers), token);
                return await DetailDtoAsync(r, false, token);
            }
            if (r.Status == RequestStatus.Cancelled || r.AvailableAtUtc > clock.GetUtcNow())
                throw ApiException.Conflict("This check-in cannot be submitted.");
            var submission = await forms.SubmitAsync(new(r.FormVersionId, r.ClientId, "checkin:" + r.Id, request.Answers), token);
            r.FormSubmissionId = submission.Id;
            r.SubmittedAt = clock.GetUtcNow();
            r.WasLate = r.SubmittedAt > r.DueAtUtc;
            await notifications.CancelScheduledAsync("CheckIns", r.Id, token);
            await notifications.PublishAsync(new(r.CoachId, "checkin:" + r.Id + ":submitted", "CheckInSubmitted", "CheckIns", "CheckIns", r.Id, "/app/check-ins/" + r.Id), token);
            r.Status = RequestStatus.Submitted;
            r.Version++;
            await SaveAsync(token);
            return await DetailDtoAsync(r, false, token);
        }, ct);
    }
    public async Task<CheckInDetailDto> ReviewAsync(Guid id, ReviewCheckInRequest request, long version, CancellationToken ct)
    {
        await CoachAsync("checkins.review", ct);
        CheckInRules.Text(request.ClientReply, 4000);
        CheckInRules.Text(request.CoachPrivateNotes, 4000);
        return await transaction.RunAsync(async token =>
        {
            var r = await LockRequestAsync(id, true, token);
            await AuthorizeAsync(r, true, RelationshipOperation.Manage, token);
            CheckInRules.CheckVersion(r.Version, version);
            if (r.Status == RequestStatus.Reviewed)
            {
                if (r.ClientReply != request.ClientReply || r.CoachPrivateNotes != request.CoachPrivateNotes)
                    throw ApiException.Conflict("An explicit review is immutable.");
                return await DetailDtoAsync(r, true, token);
            }
            if (r.Status != RequestStatus.Submitted)
                throw ApiException.Conflict("Submit the check-in before review.");
            r.ClientReply = request.ClientReply;
            r.CoachPrivateNotes = request.CoachPrivateNotes;
            r.ReviewedAt = clock.GetUtcNow();
            r.ReviewedBy = accounts.UserId;
            await notifications.PublishAsync(new(r.ClientId, "checkin:" + r.Id + ":reviewed", "CheckInReviewed", "CheckIns", "CheckIns", r.Id, "/app/check-ins/" + r.Id), token);
            r.Status = RequestStatus.Reviewed;
            r.Version++;
            await SaveAsync(token);
            return await DetailDtoAsync(r, true, token);
        }, ct);
    }
    public async Task<CheckInDetailDto> CancelAsync(Guid id, long version, CancellationToken ct)
    {
        await CoachAsync("checkins.schedules.manage", ct);
        return await transaction.RunAsync(async token =>
        {
            var r = await LockRequestAsync(id, true, token);
            await AuthorizeAsync(r, true, RelationshipOperation.Manage, token);
            CheckInRules.CheckVersion(r.Version, version);
            if (r.Status == RequestStatus.Cancelled)
                return await DetailDtoAsync(r, true, token);
            if (r.Status != RequestStatus.Scheduled)
                throw ApiException.Conflict("Only pending requests can be cancelled.");
            await notifications.CancelScheduledAsync("CheckIns", r.Id, token);
            r.Status = RequestStatus.Cancelled;
            r.CancelledAt = clock.GetUtcNow();
            r.CancelledBy = accounts.UserId;
            r.Version++;
            await SaveAsync(token);
            return await DetailDtoAsync(r, true, token);
        }, ct);
    }
    public async Task<int> GenerateDueAsync(int limit, CancellationToken ct)
    {
        if (limit is < 1 or > 100)
            throw ApiException.Invalid("Generation batch must be 1–100.");
        var processed = 0;
        db.ChangeTracker.Clear();
        for (var i = 0; i < limit; i++)
        {
            var claimed = await transaction.RunAsync(async token =>
            {
                var now = clock.GetUtcNow();
                var candidate = await db.Schedules.AsNoTracking()
                    .Where(x => x.Status == ScheduleStatus.Active && x.NextAvailableAtUtc <= now && (x.RetryAtUtc == null || x.RetryAtUtc <= now))
                    .OrderBy(x => x.NextAvailableAtUtc).ThenBy(x => x.Id).Select(x => new { x.Id, x.CoachId, x.RecurrenceJson }).FirstOrDefaultAsync(token);
                if (candidate == null)
                    return false;
                // Membership closure takes the Team lock before schedule/request locks.
                var lockedTeam = await LockCurrentTeamAsync(candidate.CoachId, token);
                var candidateRecurrence = JsonSerializer.Deserialize<Recurrence>(candidate.RecurrenceJson)!;
                if (candidateRecurrence.AssignmentId != null && assignedPrograms != null)
                    await assignedPrograms.GetAsync(candidate.CoachId, candidateRecurrence.AssignmentId.Value, token);
                var rows = await db.Schedules.FromSqlInterpolated($"SELECT * FROM checkins.\"Schedules\" WHERE \"Id\" = {candidate.Id} AND \"Status\" = 'Active' AND \"NextAvailableAtUtc\" <= {now} AND (\"RetryAtUtc\" IS NULL OR \"RetryAtUtc\" <= {now}) ORDER BY \"NextAvailableAtUtc\", \"Id\" LIMIT 1 FOR UPDATE SKIP LOCKED").ToArrayAsync(token);
                if (rows.Length == 0 || rows[0].RecurrenceJson != candidate.RecurrenceJson)
                    return false;
                var s = rows[0];
                var id = s.Id;
                await db.Database.CurrentTransaction!.CreateSavepointAsync("generation", token);
                try
                {
                    var recurrence = JsonSerializer.Deserialize<Recurrence>(s.RecurrenceJson)!;
                    AssignedProgramCycles? assignment = null;
                    if (recurrence.Kind == RecurrenceKind.AssignedProgramCycle)
                    {
                        assignment = assignedPrograms == null ? null : await assignedPrograms.GetAsync(s.CoachId, recurrence.AssignmentId!.Value, token);
                        if (assignment == null || assignment.Ended)
                        {
                            s.Status = ScheduleStatus.Ended;
                            s.NextAvailableAtUtc = null;
                            Touch(s);
                            await SaveAsync(token);
                            return true;
                        }
                        if (!assignment.Active) throw ApiException.Conflict("The assigned program is paused.");
                        CheckInRules.ValidateCycles(recurrence, assignment);
                        // Re-read the effective revision before releasing; an updated plan may move a cycle.
                        var latest = await db.Requests.Where(r => r.ScheduleId == id).MaxAsync(r => (DateTimeOffset?)r.AvailableAtUtc, token);
                        s.TimeZone = assignment.TimeZone;
                        var after = s.NextAvailableAtUtc!.Value.AddTicks(-1);
                        if (latest > after) after = latest.Value;
                        s.NextAvailableAtUtc = Next(recurrence, s.TimeZone, assignment, after);
                        if (s.NextAvailableAtUtc == null || s.NextAvailableAtUtc > now)
                        {
                            Touch(s);
                            await SaveAsync(token);
                            return true;
                        }
                    }
                    var version = await forms.GetCurrentVersionAsync(s.FormTemplateId, token);
                    await forms.RequireUsableVersionAsync(version.Id, s.CoachId, FormPurpose.CheckIn, token);
                    var targets = await db.Targets.AsNoTracking().Where(x => x.ScheduleId == id).ToArrayAsync(token);
                    var people = await recipients.ResolveActiveAsync(s.CoachId, s.WorkspaceId, targets.Where(x => !x.IsGroup).Select(x => x.TargetId).ToArray(), targets.Where(x => x.IsGroup).Select(x => x.TargetId).ToArray(), token);
                    RequireLockedTeam(people, lockedTeam);
                    if (assignment != null && !people.Any(p => p.Id == assignment.RelationshipId))
                        throw ApiException.Conflict("The assigned program relationship is no longer active.");
                    var groupSources = await recipients.GetGroupSourcesAsync(s.CoachId, s.WorkspaceId, targets.Where(x => x.IsGroup).Select(x => x.TargetId).ToArray(), token);
                    var available = s.NextAvailableAtUtc!.Value;
                    var existing = await db.Requests.Where(x => x.ScheduleId == id && x.AvailableAtUtc == available).Select(x => x.RelationshipId).ToArrayAsync(token);
                    foreach (var person in people.Where(x => !existing.Contains(x.Id)))
                    {
                        var issued = new CheckInRequest()
                        {
                            AssignmentSource = targets.Any(x => !x.IsGroup && x.TargetId == person.Id) ? "Direct" : "Group",
                            AssignmentGroupsJson = JsonSerializer.Serialize(groupSources.Where(x => x.RelationshipId == person.Id).Select(x => new CheckInGroupSourceDto(x.GroupId, x.GroupName))),
                            ScheduleId = id,
                            ScheduleName = s.Name,
                            RelationshipId = person.Id,
                            CoachId = s.CoachId,
                            WorkspaceId = s.WorkspaceId,
                            ClientId = person.ClientId,
                            FormVersionId = version.Id,
                            AvailableAtUtc = available,
                            DueAtUtc = available.AddHours(s.ResponseWindowHours)
                        };
                        db.Requests.Add(issued);
                        foreach (var (kind, at) in new[] { ("CheckInAvailable", available), ("CheckInDueSoon", issued.DueAtUtc.AddHours(-Math.Min(24, s.ResponseWindowHours / 2.0))), ("CheckInOverdue", issued.DueAtUtc.AddSeconds(1)) })
                            await notifications.PublishAsync(new(person.ClientId, "checkin:" + issued.Id + ":" + kind, kind, "CheckIns", "CheckIns", issued.Id, "/app/check-ins/" + issued.Id, at), token);
                    }
                    s.NextAvailableAtUtc = Next(recurrence, s.TimeZone, assignment, available);
                    if (s.NextAvailableAtUtc == null && recurrence.Kind != RecurrenceKind.AssignedProgramCycle)
                        s.Status = ScheduleStatus.Ended;
                    s.FailureCount = 0;
                    s.LastFailure = null;
                    s.RetryAtUtc = null;
                    Touch(s);
                    await SaveAsync(token);
                    await db.Database.CurrentTransaction.ReleaseSavepointAsync("generation", token);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    await db.Database.CurrentTransaction!.RollbackToSavepointAsync("generation", token);
                    db.ChangeTracker.Clear();
                    s = await db.Schedules.SingleAsync(x => x.Id == id, token);
                    s.FailureCount++;
                    s.LastFailure = ex is ApiException api ? api.Code + ": " + api.Message : "GENERATION_FAILED: The occurrence could not be generated; retry is scheduled.";
                    s.RetryAtUtc = now.AddSeconds(Math.Min(3600, 30 * Math.Pow(2, Math.Min(s.FailureCount - 1, 7))));
                    Touch(s);
                    await SaveAsync(token);
                }
                return true;
            }, ct);
            if (!claimed)
                break;
            processed++;
            db.ChangeTracker.Clear();
        }
        return processed;
    }
    private async Task AuthorizeAsync(CheckInRequest r, bool coach, RelationshipOperation operation, CancellationToken ct)
    {
        if (coach)
        {
            var owner = await accounts.RequireCoachAsync(ct);
            if (r.CoachId != owner.UserId || r.WorkspaceId != owner.WorkspaceId)
                throw ApiException.NotFound();
        }
        else
        {
            await ClientAsync(ct);
            if (r.ClientId != accounts.UserId)
                throw ApiException.NotFound();
        }
        var decision = await relationshipPolicy.DecideAsync(r.RelationshipId, operation, ct);
        if (!decision.Allowed)
            throw new ApiException(decision.Reason == "RESOURCE_NOT_FOUND" ? 404 : 403, decision.Reason, "Relationship access is unavailable.");
        if (!coach && r.AvailableAtUtc > clock.GetUtcNow())
            throw ApiException.NotFound();
        if (coach)
            await access.RequireAsync("checkins.review", ct);
    }
    private async Task<AccountIdentity> CoachAsync(string feature, CancellationToken ct)
    {
        var owner = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync(feature, ct);
        return owner;
    }
    private async Task<AccountIdentity> ClientAsync(CancellationToken ct)
    {
        var owner = await accounts.RequireClientAsync(ct);
        await access.RequireAsync("checkins.respond-own", ct);
        return owner;
    }
    private async Task<CheckInSchedule> OwnedScheduleAsync(Guid id, AccountIdentity owner, bool locked, CancellationToken ct)
    {
        if (locked)
        {
            var schedule = (await db.Schedules.FromSqlInterpolated($"SELECT * FROM checkins.\"Schedules\" WHERE \"Id\" = {id} AND \"CoachId\" = {owner.UserId} AND \"WorkspaceId\" = {owner.WorkspaceId} FOR UPDATE").AsNoTracking().ToArrayAsync(ct)).SingleOrDefault() ?? throw ApiException.NotFound();
            var tracked = db.Schedules.Local.FirstOrDefault(x => x.Id == id);
            if (tracked != null)
                db.Entry(tracked).State = EntityState.Detached;
            db.Attach(schedule);
            return schedule;
        }
        return await db.Schedules.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId, ct) ?? throw ApiException.NotFound();
    }
    private async Task<CheckInRequest> LockRequestAsync(Guid id, bool coach, CancellationToken ct)
    {
        var rows = coach ? await db.Requests.FromSqlInterpolated($"SELECT * FROM checkins.\"Requests\" WHERE \"Id\" = {id} AND \"CoachId\" = {accounts.UserId} FOR UPDATE").AsNoTracking().ToArrayAsync(ct) : await db.Requests.FromSqlInterpolated($"SELECT * FROM checkins.\"Requests\" WHERE \"Id\" = {id} AND \"ClientId\" = {accounts.UserId} FOR UPDATE").AsNoTracking().ToArrayAsync(ct);
        var request = rows.SingleOrDefault() ?? throw ApiException.NotFound();
        var tracked = db.Requests.Local.FirstOrDefault(x => x.Id == id);
        if (tracked != null)
            db.Entry(tracked).State = EntityState.Detached;
        db.Attach(request);
        return request;
    }
    private async Task<AssignedProgramCycles?> ValidateDependenciesAsync(ScheduleRequest request, AccountIdentity owner, Guid? lockedTeam, CancellationToken ct)
    {
        var version = await forms.GetCurrentVersionAsync(request.FormTemplateId, ct);
        await forms.RequireUsableVersionAsync(version.Id, owner.UserId, FormPurpose.CheckIn, ct);
        var people = await recipients.ResolveActiveAsync(owner.UserId, owner.WorkspaceId, request.RelationshipIds, request.GroupIds, ct);
        RequireLockedTeam(people, lockedTeam);
        if (request.Recurrence.Kind != RecurrenceKind.AssignedProgramCycle) return null;
        var assignment = assignedPrograms == null ? null : await assignedPrograms.GetAsync(owner.UserId, request.Recurrence.AssignmentId!.Value, ct);
        if (assignment == null || !people.Any(p => p.Id == assignment.RelationshipId)) throw ApiException.NotFound();
        if (!assignment.Active) throw ApiException.Invalid("Choose an active assigned program.");
        if (request.RelationshipIds.Count != 1 || request.RelationshipIds[0] != assignment.RelationshipId || request.GroupIds.Count != 0)
            throw ApiException.Invalid("Program-cycle schedules target the selected assignment's client only.");
        if (request.TimeZone != assignment.TimeZone) throw ApiException.Invalid("Use the assigned program's time zone.");
        CheckInRules.ValidateCycles(request.Recurrence, assignment);
        return assignment;
    }
    private static DateTimeOffset? Next(Recurrence recurrence, string zone, AssignedProgramCycles? assignment, DateTimeOffset? after = null) =>
        recurrence.Kind == RecurrenceKind.AssignedProgramCycle ? assignment == null ? null : CheckInRules.NextCycle(recurrence, assignment, after) : CheckInRules.Next(recurrence, zone, after);

    public async Task<IReadOnlyList<AssignedProgramCycles>> AssignedProgramsAsync(Guid relationshipId, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        var people = await recipients.ResolveActiveAsync(owner.UserId, owner.WorkspaceId, [relationshipId], [], ct);
        if (!people.Any(p => p.Id == relationshipId)) throw ApiException.NotFound();
        return assignedPrograms == null ? [] : await assignedPrograms.ListAsync(owner.UserId, relationshipId, ct);
    }
    private async Task<Guid?> LockCurrentTeamAsync(Guid coachId, CancellationToken ct)
    {
        var team = teams == null ? null : await teams.GetForUserAsync(coachId, ct);
        if (team != null)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team.TeamId}, 0))", ct);
        return team?.TeamId;
    }
    private static void RequireLockedTeam(IEnumerable<RelationshipRecipient> people, Guid? lockedTeam)
    {
        if (people.Any(x => x.TeamId != null && x.TeamId != lockedTeam))
            throw ApiException.Conflict("Team membership changed. Retry this operation.");
    }
    private static void Validate(ScheduleRequest r)
    {
        CheckInRules.Text(r.Name, 200, true);
        CheckInRules.Text(r.Description, 4000);
        if (r.Description == null || r.Recurrence == null || r.RelationshipIds == null || r.GroupIds == null || r.RelationshipIds.Count + r.GroupIds.Count is < 1 or > 100 || r.FormTemplateId == Guid.Empty || r.RelationshipIds.Contains(Guid.Empty) || r.GroupIds.Contains(Guid.Empty))
            throw ApiException.Invalid("Use a published check-in template and 1–100 valid relationship/group targets.");
        if (r.RelationshipIds.Distinct().Count() != r.RelationshipIds.Count || r.GroupIds.Distinct().Count() != r.GroupIds.Count)
            throw ApiException.Invalid("Targets must be unique.");
        CheckInRules.Validate(r.Recurrence, r.TimeZone, r.ResponseWindowHours);
    }
    private void AddTargets(CheckInSchedule s, ScheduleRequest r)
    {
        db.Targets.AddRange(r.RelationshipIds.Select(x => new ScheduleTarget { ScheduleId = s.Id, TargetId = x, CoachId = s.CoachId, WorkspaceId = s.WorkspaceId }));
        db.Targets.AddRange(r.GroupIds.Select(x => new ScheduleTarget { ScheduleId = s.Id, TargetId = x, IsGroup = true, CoachId = s.CoachId, WorkspaceId = s.WorkspaceId }));
    }
    private void Touch(CheckInSchedule s)
    {
        s.Version++;
        s.UpdatedAt = clock.GetUtcNow();
    }
    private async Task<ScheduleDto> DtoAsync(CheckInSchedule s, CancellationToken ct) => Dto(s, await db.Targets.AsNoTracking().Where(x => x.ScheduleId == s.Id).ToArrayAsync(ct));
    private static ScheduleDto Dto(CheckInSchedule s, IEnumerable<ScheduleTarget> targets) => new(s.Id, s.CoachId, s.WorkspaceId, s.FormTemplateId, s.Name, s.Description, s.TimeZone, JsonSerializer.Deserialize<Recurrence>(s.RecurrenceJson)!, s.ResponseWindowHours, targets.Where(x => !x.IsGroup).Select(x => x.TargetId).Order().ToArray(), targets.Where(x => x.IsGroup).Select(x => x.TargetId).Order().ToArray(), s.Status, s.NextAvailableAtUtc, s.RetryAtUtc, s.LastFailure, s.FailureCount, s.Version, s.CreatedAt, s.UpdatedAt);
    private CheckInRequestDto RequestDto(CheckInRequest r) => new(r.Id, r.ScheduleId, r.ScheduleName, r.RelationshipId, r.FormVersionId, r.AvailableAtUtc, r.DueAtUtc, r.Status == RequestStatus.Scheduled ? clock.GetUtcNow() < r.AvailableAtUtc ? RequestStatus.Scheduled : clock.GetUtcNow() > r.DueAtUtc ? RequestStatus.Overdue : RequestStatus.Available : r.Status, r.SubmittedAt, r.ReviewedAt, r.CancelledAt, r.WasLate, r.Version, r.ClientReply, r.ReviewedBy, r.AssignmentSource, r.CoachId == accounts.UserId && r.AssignmentGroupsJson != null ? JsonSerializer.Deserialize<CheckInGroupSourceDto[]>(r.AssignmentGroupsJson) : null);
    private async Task<CheckInDetailDto> DetailDtoAsync(CheckInRequest r, bool coach, CancellationToken ct) => new(RequestDto(r), await forms.GetVersionAsync(r.FormVersionId, ct), r.FormSubmissionId is Guid submission ? await forms.GetSubmissionAsync(submission, ct) : null, coach ? r.CoachPrivateNotes : null);
    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException) { throw new ApiException(412, "VERSION_CONFLICT", "The resource changed. Reload it before retrying."); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw ApiException.Conflict("A concurrent operation changed this resource. Reload it before retrying."); }
    }
}
