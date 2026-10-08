using TrainFlow.Notifications.Contracts;
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
    IRelationshipAccessPolicy relationshipPolicy, IFormLibrary forms, ModuleTransaction transaction, TimeProvider clock, INotificationPublisher notifications, ITeamContext? teams = null)
{
    public async Task<ScheduleDto> CreateAsync(ScheduleRequest request, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        Validate(request);
        return await transaction.RunAsync(async token =>
        {
            var lockedTeam = await LockCurrentTeamAsync(owner.UserId, token);
            await ValidateDependenciesAsync(request, owner, lockedTeam, token);
            var now = clock.GetUtcNow();
            var schedule = new CheckInSchedule { CoachId = owner.UserId, WorkspaceId = owner.WorkspaceId, FormTemplateId = request.FormTemplateId, Name = request.Name.Trim(), Description = request.Description, TimeZone = request.TimeZone, RecurrenceJson = JsonSerializer.Serialize(request.Recurrence), ResponseWindowHours = request.ResponseWindowHours, NextAvailableAtUtc = CheckInRules.Next(request.Recurrence, request.TimeZone), CreatedAt = now, UpdatedAt = now };
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
            var s = await OwnedScheduleAsync(id, owner, true, token);
            CheckInRules.CheckVersion(s.Version, version);
            if (s.Status == ScheduleStatus.Ended)
                throw ApiException.Conflict("Ended schedules cannot be edited.");
            await ValidateDependenciesAsync(request, owner, lockedTeam, token);
            s.FormTemplateId = request.FormTemplateId;
            s.Name = request.Name.Trim();
            s.Description = request.Description;
            s.ResponseWindowHours = request.ResponseWindowHours;
            var recurrence = JsonSerializer.Serialize(request.Recurrence);
            if (s.RecurrenceJson != recurrence || s.TimeZone != request.TimeZone)
                s.NextAvailableAtUtc = CheckInRules.Next(request.Recurrence, request.TimeZone);
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
    public async Task<CheckInPage<ScheduleDto>> SchedulesAsync(int page, int size, string? search, string sort, ScheduleStatus? status, CancellationToken ct)
    {
        var owner = await CoachAsync("checkins.schedules.manage", ct);
        CheckInRules.Pagination(page, size);
        CheckInRules.Text(search, 200);
        if (status.HasValue && !Enum.IsDefined(status.Value))
            throw ApiException.Invalid("Invalid schedule status.");
        var query = db.Schedules.AsNoTracking().Where(x => x.CoachId == owner.UserId && x.WorkspaceId == owner.WorkspaceId);
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
    public async Task<CheckInPage<CheckInRequestDto>> RequestsAsync(int page, int size, string? search, string sort, RequestStatus? status, Guid? relationshipId, Guid? scheduleId, string role, CancellationToken ct, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
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
            "available" => query.OrderByDescending(x => x.AvailableAtUtc).ThenBy(x => x.Id),
            "status" => query.OrderBy(x => x.Status).ThenBy(x => x.DueAtUtc).ThenBy(x => x.Id),
            _ => throw ApiException.Invalid("Sort must be due, available, or status.")
        };
        return new((await ordered.Skip((page - 1) * size).Take(size).ToArrayAsync(ct)).Select(RequestDto).ToArray(), page, size, count);
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
                    .OrderBy(x => x.NextAvailableAtUtc).ThenBy(x => x.Id).Select(x => new { x.Id, x.CoachId }).FirstOrDefaultAsync(token);
                if (candidate == null)
                    return false;
                // Membership closure takes the Team lock before schedule/request locks.
                var lockedTeam = await LockCurrentTeamAsync(candidate.CoachId, token);
                var rows = await db.Schedules.FromSqlInterpolated($"SELECT * FROM checkins.\"Schedules\" WHERE \"Id\" = {candidate.Id} AND \"Status\" = 'Active' AND \"NextAvailableAtUtc\" <= {now} AND (\"RetryAtUtc\" IS NULL OR \"RetryAtUtc\" <= {now}) ORDER BY \"NextAvailableAtUtc\", \"Id\" LIMIT 1 FOR UPDATE SKIP LOCKED").ToArrayAsync(token);
                if (rows.Length == 0)
                    return false;
                var s = rows[0];
                var id = s.Id;
                await db.Database.CurrentTransaction!.CreateSavepointAsync("generation", token);
                try
                {
                    var version = await forms.GetCurrentVersionAsync(s.FormTemplateId, token);
                    await forms.RequireUsableVersionAsync(version.Id, s.CoachId, FormPurpose.CheckIn, token);
                    var targets = await db.Targets.AsNoTracking().Where(x => x.ScheduleId == id).ToArrayAsync(token);
                    var people = await recipients.ResolveActiveAsync(s.CoachId, s.WorkspaceId, targets.Where(x => !x.IsGroup).Select(x => x.TargetId).ToArray(), targets.Where(x => x.IsGroup).Select(x => x.TargetId).ToArray(), token);
                    RequireLockedTeam(people, lockedTeam);
                    var available = s.NextAvailableAtUtc!.Value;
                    var existing = await db.Requests.Where(x => x.ScheduleId == id && x.AvailableAtUtc == available).Select(x => x.RelationshipId).ToArrayAsync(token);
                    foreach (var person in people.Where(x => !existing.Contains(x.Id)))
                    {
                        var issued = new CheckInRequest()
                        {
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
                    s.NextAvailableAtUtc = CheckInRules.Next(JsonSerializer.Deserialize<Recurrence>(s.RecurrenceJson)!, s.TimeZone, available);
                    if (s.NextAvailableAtUtc == null)
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
    private async Task ValidateDependenciesAsync(ScheduleRequest request, AccountIdentity owner, Guid? lockedTeam, CancellationToken ct)
    {
        var version = await forms.GetCurrentVersionAsync(request.FormTemplateId, ct);
        await forms.RequireUsableVersionAsync(version.Id, owner.UserId, FormPurpose.CheckIn, ct);
        var people = await recipients.ResolveActiveAsync(owner.UserId, owner.WorkspaceId, request.RelationshipIds, request.GroupIds, ct);
        RequireLockedTeam(people, lockedTeam);
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
    private CheckInRequestDto RequestDto(CheckInRequest r) => new(r.Id, r.ScheduleId, r.ScheduleName, r.RelationshipId, r.FormVersionId, r.AvailableAtUtc, r.DueAtUtc, r.Status == RequestStatus.Scheduled ? clock.GetUtcNow() < r.AvailableAtUtc ? RequestStatus.Scheduled : clock.GetUtcNow() > r.DueAtUtc ? RequestStatus.Overdue : RequestStatus.Available : r.Status, r.SubmittedAt, r.ReviewedAt, r.CancelledAt, r.WasLate, r.Version, r.ClientReply);
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
