using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.Notifications.Contracts;
using Metrivum.Training.Contracts;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Infrastructure;

namespace Metrivum.Training.Delivery;

public sealed partial class TrainingDeliveryService(TrainingDbContext db, IAccountContext accounts, IFeatureAccessService access,
    IRelationshipRecipients relationships, IRelationshipAccessPolicy policy, IExerciseCatalog catalog, INotificationPublisher notifications,
    ModuleTransaction transaction, TimeProvider clock, IAccountDirectory directory, IEnumerable<IAssignedProgramScheduleObserver> assignmentObservers, ITeamContext? teams = null, TrainingService? formulaService = null) : ITrainingProgressReader
{
    private DbSet<ProgramAssignment> Assignments => db.Set<ProgramAssignment>();
    private DbSet<WorkoutOccurrence> Occurrences => db.Set<WorkoutOccurrence>();
    private DbSet<WorkoutExecution> Executions => db.Set<WorkoutExecution>();

    public async Task<AssignmentRecipientDto[]> PreviewAsync(Guid programId, AssignProgramRequest request, CancellationToken ct)
    {
        var coach = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.assignments.manage", ct);
        ValidateAssignment(request);
        var revision = await PublishedAsync(programId, request.RevisionId, coach, ct);
        var recipients = (await relationships.ResolveActiveAsync(coach.UserId, coach.WorkspaceId, request.RelationshipIds, request.GroupIds, ct)).DistinctBy(x => x.Id).ToArray();
        if (recipients.Length is 0 or > 200)
            throw ApiException.Invalid("Select between 1 and 200 active relationships.");
        var occurrences = DeliveryRules.Resolve(new()
        {
            StartDate = request.StartDate,
            TimeZone = request.TimeZone
        }, revision);
        if (occurrences.Length == 0)
            throw ApiException.Invalid("The published program has no workouts to assign.");
        if ((long)occurrences.Length * recipients.Length > 50000)
            throw ApiException.Invalid("This batch exceeds 50000 planned workouts. Select fewer recipients.");
        var people = await directory.GetAccountsAsync(recipients.Select(x => x.ClientId).Distinct().ToArray(), ct);
        return recipients.Select(r => new AssignmentRecipientDto(r.Id, r.ClientId, people.TryGetValue(r.ClientId, out var p) ? p.DisplayName : "Client", people.GetValueOrDefault(r.ClientId)?.Username)).ToArray();
    }
    public Task<AssignmentBatchDto> AssignAsync(Guid programId, AssignProgramRequest request, string key, CancellationToken ct) => MutateAsync(async () =>
    {
        var coach = await accounts.RequireCoachAsync(ct);
        await access.RequireAsync("training.assignments.manage", ct);
        ValidateAssignment(request);
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128)
            throw ApiException.Invalid("Idempotency-Key (1-128 characters) is required.");
        var team = teams == null ? null : await teams.GetForUserAsync(coach.UserId, ct);
        if (team != null)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + team.TeamId}, 0))", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({coach.WorkspaceId.ToString()}, 7105))", ct);
        await LockAsync(coach.UserId, ct);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(TrainingJson.Serialize(new
        {
            programId,
            request
        }))));
        var prior = await db.Set<AssignmentBatch>().SingleOrDefaultAsync(x => x.CoachId == coach.UserId && x.IdempotencyKey == key, ct);
        if (prior != null)
        {
            if (prior.RequestHash != hash)
                throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "This key was used for a different assignment.");
            var assignments = await Assignments.Where(x => x.BatchId == prior.Id).OrderBy(x => x.Id).ToArrayAsync(ct);
            var decisions = await DecisionsAsync(assignments.Select(x => x.RelationshipId).Distinct().ToArray(), RelationshipOperation.HistoricalSharedRead, ct);
            if (assignments.Any(x => !decisions.TryGetValue(x.RelationshipId, out var decision) || !decision.Allowed))
                throw new ApiException(403, "RELATIONSHIP_ACCESS_DENIED", "This relationship does not permit training access.");
            return new AssignmentBatchDto(prior.Id, assignments.Select(x => Dto(x, true)).ToArray());
        }
        var revision = await PublishedAsync(programId, request.RevisionId, coach, ct);
        var recipients = (await relationships.ResolveActiveAsync(coach.UserId, coach.WorkspaceId, request.RelationshipIds, request.GroupIds, ct)).DistinctBy(x => x.Id).ToArray();
        if (recipients.Length is 0 or > 200)
            throw ApiException.Invalid("Select between 1 and 200 active relationships.");
        if (recipients.Any(x => x.TeamId != null && x.TeamId != team?.TeamId))
            throw ApiException.Conflict("Team membership changed. Retry this operation.");
        var batch = new AssignmentBatch { Id = Guid.NewGuid(), CoachId = coach.UserId, IdempotencyKey = key, RequestHash = hash, CreatedAt = clock.GetUtcNow() };
        db.Add(batch);
        var groupForRecipient = new Dictionary<Guid, List<Guid>>();
        foreach (var groupId in request.GroupIds.Distinct())
        {
            var group = new GroupProgramAssignment { Id = Guid.NewGuid(), BatchId = batch.Id, GroupId = groupId };
            db.Add(group);
            foreach (var recipient in await relationships.ResolveActiveAsync(coach.UserId, coach.WorkspaceId, [], [groupId], ct))
            {
                if (!groupForRecipient.TryGetValue(recipient.Id, out var sources))
                    groupForRecipient[recipient.Id] = sources = [];
                sources.Add(group.Id);
            }
        }
        var result = new List<AssignmentDto>();
        foreach (var r in recipients)
        {
            var a = new ProgramAssignment
            {
                Id = Guid.NewGuid(),
                BatchId = batch.Id,
                RelationshipId = r.Id,
                CoachId = coach.UserId,
                ClientId = r.ClientId,
                ProgramId = programId,
                ProgramName = revision.Snapshot.Name,
                OriginalRevisionId = revision.Id,
                EffectiveRevisionId = revision.Id,
                GroupAssignmentId = groupForRecipient.TryGetValue(r.Id, out var groups) ? groups[0] : null,
                StartDate = request.StartDate,
                TimeZone = request.TimeZone,
                CreatedAt = clock.GetUtcNow(),
                UpdatedAt = clock.GetUtcNow()
            };
            if (formulaService != null) a.FormulaSnapshot = await formulaService.ResolveClientFormulasAsync(revision.Snapshot.Document, a.ClientId, a.CoachId, ct);
            var occurrences = DeliveryRules.Resolve(a, revision);
            if (occurrences.Length == 0)
                throw ApiException.Invalid("The published program has no workouts to assign.");
            if ((long)occurrences.Length * recipients.Length > 50000)
                throw ApiException.Invalid("This batch exceeds 50000 planned workouts. Select fewer recipients.");
            db.Add(a);
            db.AddRange(occurrences);
            result.Add(Dto(a, true));
            if (groups != null)
                db.AddRange(groups.Select(g => new AssignmentGroupSource { AssignmentId = a.Id, GroupAssignmentId = g }));
            await notifications.PublishAsync(new(r.ClientId, $"training-assigned:{a.Id}", "training.assigned", "Coaching", "Training", a.Id, "/app/my-training"), ct);
        }
        await db.SaveChangesAsync(ct);
        return new AssignmentBatchDto(batch.Id, result.ToArray());
    }, ct);

    public async Task<Paged<AssignmentDto>> ListAsync(Guid? relationshipId, Guid? programId, Guid? groupId, int page, int pageSize, CancellationToken ct, string? view = null)
    {
        Page(page, pageSize);
        var ids = await VisibleAsync(relationshipId, null, ct, view);
        if (groupId != null)
        {
            var coach = await accounts.RequireCoachAsync(ct);
            await relationships.ResolveActiveAsync(coach.UserId, coach.WorkspaceId, [], [groupId.Value], ct);
        }
        var q = Assignments.AsNoTracking().Where(x => ids.Contains(x.RelationshipId));
        if (programId != null)
            q = q.Where(x => x.ProgramId == programId);
        if (groupId != null)
            q = q.Where(x => db.Set<AssignmentGroupSource>().Any(s => s.AssignmentId == x.Id && db.Set<GroupProgramAssignment>().Any(g => g.Id == s.GroupAssignmentId && g.GroupId == groupId)));
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var active = await ActiveIds(rows.Select(x => x.RelationshipId).Distinct().ToArray(), ct);
        var clients = await directory.GetAccountsAsync(rows.Select(x => x.ClientId).Distinct().ToArray(), ct);
        return new(rows.Select(x => Dto(x, x.CoachId == accounts.UserId, active.Contains(x.RelationshipId)) with { ClientDisplayName = clients.GetValueOrDefault(x.ClientId)?.DisplayName, ClientUsername = clients.GetValueOrDefault(x.ClientId)?.Username }).ToArray(), page, pageSize, total);
    }
    public async Task<AssignmentDto> GetAsync(Guid id, CancellationToken ct)
    {
        var a = await AssignmentAsync(id, RelationshipOperation.HistoricalSharedRead, ct);
        return Dto(a, a.CoachId == accounts.UserId, (await relationships.GetAsync(a.RelationshipId, ct))?.Status == RelationshipStatus.Active);
    }
    public Task<AssignmentDto> SetStatusAsync(Guid id, AssignmentStatus status, long version, CancellationToken ct) => MutateAsync(async () =>
    {
        var a = await AssignmentAsync(id, RelationshipOperation.Manage, ct);
        await accounts.RequireCoachAsync(ct);
        if (a.CoachId != accounts.UserId)
            throw ApiException.NotFound();
        if (!Enum.IsDefined(status))
            throw ApiException.Invalid("Unknown assignment status.");
        DeliveryRules.Version(a.Version, version);
        if (a.Status == status)
            return Dto(a, true);
        if (a.Status is AssignmentStatus.Completed or AssignmentStatus.Cancelled)
            throw new ApiException(409, "ASSIGNMENT_CLOSED", "Closed assignments cannot resume.");
        if (status == AssignmentStatus.Active)
            await ActiveRelationship(a, ct);
        if (status is AssignmentStatus.Completed or AssignmentStatus.Cancelled)
        {
            var today = DeliveryRules.LocalDate(clock.GetUtcNow(), a.TimeZone);
            await Occurrences.Where(o => o.AssignmentId == a.Id && !o.Superseded && o.ScheduledDate >= today && !Executions.Any(e => e.OccurrenceId == o.Id))
                .ExecuteUpdateAsync(update => update.SetProperty(o => o.Superseded, true), ct);
        }
        a.Status = status;
        a.Version++;
        a.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        var revision = await db.Revisions.AsNoTracking().SingleAsync(r => r.Id == a.EffectiveRevisionId, ct);
        foreach (var observer in assignmentObservers)
            await observer.ChangedAsync(a.CoachId, AssignedProgramCyclesReader.Describe(a, revision), ct);
        return Dto(a, true);
    }, ct);
    public Task<AssignmentDto> RefreshAsync(Guid id, Guid revisionId, long version, CancellationToken ct) => MutateAsync(async () =>
    {
        var a = await AssignmentAsync(id, RelationshipOperation.Manage, ct);
        var coach = await accounts.RequireCoachAsync(ct);
        if (a.CoachId != coach.UserId)
            throw ApiException.NotFound();
        DeliveryRules.Version(a.Version, version);
        await ActiveRelationship(a, ct);
        if (a.Status is AssignmentStatus.Completed or AssignmentStatus.Cancelled)
            throw new ApiException(409, "ASSIGNMENT_CLOSED", "Closed assignments cannot refresh.");
        var revision = await PublishedAsync(a.ProgramId, revisionId, coach, ct);
        if (revision.Id == a.EffectiveRevisionId)
            return Dto(a, true);
        var oldRevisionNumber = await db.Revisions.Where(x => x.Id == a.EffectiveRevisionId).Select(x => x.Number).SingleAsync(ct);
        if (revision.Number <= oldRevisionNumber)
            throw ApiException.Invalid("Refresh requires a newer applied revision.");
        await AssignmentRevisionUpdater.RefreshAsync(db, a, revision, clock, assignmentObservers, ct, formulaService);
        await db.SaveChangesAsync(ct);
        return Dto(a, true);
    }, ct);

    private sealed record PlannedSetSummary(Guid Id, int Count);

    public async Task<Paged<OccurrenceDto>> ScheduleAsync(DateOnly fromDate, DateOnly to, Guid? relationshipId, Guid? programId, int page, int pageSize, CancellationToken ct, string? view = null, Guid? blockId = null, Guid? cycleId = null, string? status = null, string? sort = null)
    {
        Range(fromDate, to);
        Page(page, pageSize);
        if (status is not (null or "" or "Scheduled" or "InProgress" or "Completed" or "Skipped" or "Missed") || sort is not (null or "oldest" or "latest"))
            throw ApiException.Invalid("Invalid activity status or sort order.");
        var now = clock.GetUtcNow();
        var ids = await VisibleAsync(relationshipId, null, ct, view);
        var q = from o in Occurrences.AsNoTracking()
                join a in Assignments.AsNoTracking() on o.AssignmentId equals a.Id
                where !o.Superseded && ids.Contains(a.RelationshipId) && o.ScheduledDate >= fromDate && o.ScheduledDate <= to && (programId == null || a.ProgramId == programId)
                join e in Executions.AsNoTracking() on o.Id equals e.OccurrenceId into logs
                from e in logs.DefaultIfEmpty()
                select new
                {
                    o,
                    a,
                    e
                };
        q = q.Where(x => (blockId == null || x.o.BlockId == blockId) && (cycleId == null || x.o.CycleId == cycleId));
        q = status switch
        {
            "Scheduled" => q.Where(x => x.e == null && x.o.Deadline > now),
            "Missed" => q.Where(x => x.e == null && x.o.Deadline <= now),
            "InProgress" => q.Where(x => x.e != null && x.e.Status == ExecutionStatus.InProgress),
            "Completed" => q.Where(x => x.e != null && x.e.Status == ExecutionStatus.Completed),
            "Skipped" => q.Where(x => x.e != null && x.e.Status == ExecutionStatus.Skipped),
            _ => q
        };
        var count = await q.CountAsync(ct);
        // Only summary fields are needed here; prescription snapshots belong to workout details.
        var ordered = sort == "latest" ? q.OrderByDescending(x => x.o.ScheduledDate).ThenBy(x => x.o.Id) : q.OrderBy(x => x.o.ScheduledDate).ThenBy(x => x.o.Id);
        var rows = await ordered.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                o = new WorkoutOccurrence
                {
                    Id = x.o.Id,
                    RevisionId = x.o.RevisionId,
                    BlockId = x.o.BlockId,
                    CycleId = x.o.CycleId,
                    DayId = x.o.DayId,
                    WorkoutId = x.o.WorkoutId,
                    Name = x.o.Name,
                    ScheduledDate = x.o.ScheduledDate,
                    Deadline = x.o.Deadline
                },
                a = new ProgramAssignment
                {
                    Id = x.a.Id,
                    RelationshipId = x.a.RelationshipId,
                    ProgramId = x.a.ProgramId,
                    ProgramName = x.a.ProgramName,
                    Status = x.a.Status
                },
                e = x.e == null ? null : new WorkoutExecution { Id = x.e.Id, Status = x.e.Status, CompletedAt = x.e.CompletedAt, PerformedDate = x.e.PerformedDate, DurationSeconds = x.e.DurationSeconds, Comment = x.e.Comment, Feedback = x.e.Feedback },
                ExerciseCount = x.e == null ? (int?)null : x.e.Exercises.Count,
                // A set counts as done when it was not skipped and something was recorded for it.
                PerformedSets = x.e == null ? (int?)null : x.e.Exercises.SelectMany(ex => ex.Sets).Count(s => !s.Skipped && (s.Reps != null || s.Load != null || s.DurationSeconds != null || s.DistanceMeters != null))
            }).ToArrayAsync(ct);
        var active = await ActiveIds(rows.Select(x => x.a.RelationshipId).Distinct().ToArray(), ct);
        // Return scalar planned counts; never transfer complete prescription JSON into an activity list.
        var logged = rows.Where(x => x.e != null).Select(x => x.o.Id).ToArray();
        var planned = logged.Length == 0 ? new Dictionary<Guid, int>() : await db.Database.SqlQuery<PlannedSetSummary>($"""
            SELECT o."Id", COALESCE((
                SELECT SUM(CASE WHEN jsonb_typeof(s->'segments') = 'array' AND jsonb_array_length(s->'segments') > 0
                    THEN jsonb_array_length(s->'segments') ELSE 1 END)::integer
                FROM jsonb_array_elements(o."Prescription"->'workout'->'exercises') e
                CROSS JOIN LATERAL jsonb_array_elements(e->'sets') s
            ), 0) AS "Count"
            FROM training.workout_occurrences o WHERE o."Id" = ANY ({logged})
            """).ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        return new(rows.Select(x => OccurrenceDto(x.o, x.a, x.e, active.Contains(x.a.RelationshipId)) with
        {
            ExerciseCount = x.ExerciseCount,
            PerformedSets = x.PerformedSets,
            PlannedSets = planned.TryGetValue(x.o.Id, out var sets) ? sets : null,
            CompletedAt = x.e?.CompletedAt,
            SessionRpe = x.e?.Feedback?.SessionRpe,
            Rating = x.e?.Feedback?.Rating
        }).ToArray(), page, pageSize, count);
    }
    public async Task<WorkoutDetailDto> WorkoutAsync(Guid id, CancellationToken ct, Guid? relationshipId = null)
    {
        var (o, a) = await WorkoutContextAsync(id, RelationshipOperation.HistoricalSharedRead, ct);
        if (relationshipId != null && a.RelationshipId != relationshipId)
            throw ApiException.NotFound();
        var e = await ExecutionQuery().SingleOrDefaultAsync(x => x.OccurrenceId == id, ct);
        var active = (await relationships.GetAsync(a.RelationshipId, ct))?.Status == RelationshipStatus.Active;
        var prescription = e?.Prescription ?? o.Prescription;
        if (accounts.UserId != a.CoachId) prescription = prescription with { Annotations = prescription.Annotations?.Where(n => n.Visibility == AnnotationVisibility.Client).ToArray() };
        return new(OccurrenceDto(o, a, e, active), prescription, e == null ? null : ExecutionDto(e, active && (a.Status == AssignmentStatus.Active || e.Status == ExecutionStatus.Completed)));
    }
    public Task<ExecutionDto> StartAsync(Guid id, CancellationToken ct) => MutateAsync(async () =>
    {
        var (o, a) = await WorkoutContextAsync(id, RelationshipOperation.ProtectedWrite, ct);
        await LockAsync(id, ct);
        var existing = await ExecutionQuery().SingleOrDefaultAsync(x => x.OccurrenceId == id, ct);
        if (existing != null)
        {
            if (existing.Status == ExecutionStatus.Skipped)
            {
                Eligible(a);
                existing.Status = ExecutionStatus.InProgress;
                Touch(existing);
                await db.SaveChangesAsync(ct);
            }
            return ExecutionDto(existing, a.Status == AssignmentStatus.Active || existing.Status == ExecutionStatus.Completed);
        }
        Eligible(a);
        var e = NewExecution(o, a);
        db.Add(e);
        await db.SaveChangesAsync(ct);
        return ExecutionDto(e, true);
    }, ct);
    public Task<ExecutionDto> SkipAsync(Guid id, string? reason, CancellationToken ct) => MutateAsync(async () =>
    {
        var (o, a) = await WorkoutContextAsync(id, RelationshipOperation.ProtectedWrite, ct);
        await LockAsync(id, ct);
        Eligible(a);
        Text(reason, 4000);
        var e = await ExecutionQuery().SingleOrDefaultAsync(x => x.OccurrenceId == id, ct);
        if (e?.Status == ExecutionStatus.Skipped)
            return ExecutionDto(e, true);
        if (e != null)
            throw new ApiException(409, "WORKOUT_STARTED", "A started workout must be completed or corrected.");
        e = NewExecution(o, a);
        e.Status = ExecutionStatus.Skipped;
        e.Comment = reason ?? "";
        db.Add(e);
        await db.SaveChangesAsync(ct);
        return ExecutionDto(e, true);
    }, ct);
    public Task<ExecutionDto> SaveAsync(Guid id, SaveExecutionRequest request, long version, CancellationToken ct) => MutateAsync(async () =>
    {
        var (e, a) = await ExecutionContextAsync(id, ct);
        DeliveryRules.Version(e.Version, version);
        if (e.Status == ExecutionStatus.Skipped)
            throw new ApiException(409, "WORKOUT_SKIPPED", "Start a skipped workout again to log a late completion.");
        ValidateExecution(request, e.Prescription, a.TimeZone);
        var snapshots = await catalog.SnapshotAsync(request.Exercises.Select(x => x.ExerciseId).Distinct(), ct);
        if (request.Exercises.Any(x => !snapshots.ContainsKey(x.ExerciseId)))
            throw ApiException.Invalid("An actual exercise is unavailable.");
        // Sets keep their ids when they stay in the same place (same exercise slot and position), so links to a set
        // (video analyses) survive corrections. The old rows are deleted first so the ids can be reused.
        var previous = e.Exercises.OrderBy(x => x.Position).Select(x => (x.PrescribedInstanceId, x.ExerciseId, x.Id, Sets: x.Sets.OrderBy(s => s.Position).Select(s => s.Id).ToArray())).ToArray();
        db.RemoveRange(e.Exercises);
        e.Exercises.Clear();
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < request.Exercises.Length; i++)
        {
            var actual = request.Exercises[i];
            var kept = i < previous.Length && previous[i].PrescribedInstanceId == actual.PrescribedInstanceId && previous[i].ExerciseId == actual.ExerciseId ? previous[i] : default;
            var ex = new ExerciseExecution
            {
                Id = kept.Sets != null ? kept.Id : Guid.NewGuid(),
                ExecutionId = e.Id,
                PrescribedInstanceId = actual.PrescribedInstanceId,
                ExerciseId = actual.ExerciseId,
                IsSubstitution = actual.PrescribedInstanceId != null && e.Prescription.Workout.Exercises.Single(x => x.Id == actual.PrescribedInstanceId).ExerciseId != actual.ExerciseId,
                Name = snapshots[actual.ExerciseId].Name,
                Comment = actual.Comment ?? "",
                Position = i
            };
            ex.Sets = actual.Sets.Select((s, p) => new SetExecution
            {
                Id = kept.Sets != null && p < kept.Sets.Length ? kept.Sets[p] : Guid.NewGuid(),
                ExerciseExecutionId = ex.Id,
                PrescribedSetId = s.PrescribedSetId,
                PrescribedSegmentId = s.PrescribedSegmentId,
                Position = p,
                Skipped = s.Skipped,
                Reps = s.Reps,
                Load = s.Load,
                LoadUnit = s.LoadUnit,
                LoadMeaning = s.LoadMeaning,
                Rpe = s.Rpe,
                Rir = s.Rir,
                DurationSeconds = s.DurationSeconds,
                DistanceMeters = s.DistanceMeters,
                RestSeconds = s.RestSeconds,
                Tempo = s.Tempo,
                Comment = s.Comment ?? "",
                VolumeKg = DeliveryRules.Volume(s)
            }).ToList();
            e.Exercises.Add(ex);
            db.Add(ex);
        }
        e.PerformedDate = request.PerformedDate;
        e.Comment = request.Comment ?? "";
        e.DurationSeconds = request.DurationSeconds;
        Touch(e);
        await db.SaveChangesAsync(ct);
        return ExecutionDto(e, true);
    }, ct);
    public Task<ExecutionDto> CompleteAsync(Guid id, long version, CancellationToken ct) => MutateAsync(async () =>
    {
        var (e, a) = await ExecutionContextAsync(id, ct);
        if (e.Status == ExecutionStatus.Completed)
        {
            // A retry of the original finish is safe only while no subsequent correction exists.
            if (version != e.Version && !(version == e.Version - 1 && e.CompletedAt == e.UpdatedAt))
                DeliveryRules.Version(e.Version, version);
            return ExecutionDto(e, true);
        }
        DeliveryRules.Version(e.Version, version);
        Eligible(a);
        if (!e.Exercises.SelectMany(x => x.Sets).Any(s => !s.Skipped && (s.Reps > 0 || s.DurationSeconds > 0 || s.DistanceMeters > 0)))
            throw ApiException.Invalid("Record at least one performed set before completing, or explicitly skip the workout.");
        e.Status = ExecutionStatus.Completed;
        Touch(e);
        e.CompletedAt = e.UpdatedAt;
        await db.SaveChangesAsync(ct);
        await notifications.PublishAsync(new(a.CoachId, $"training-completed:{e.Id}", "training.completed", "Coaching", "Training", a.Id, $"/app/clients/{a.RelationshipId}"), ct);
        return ExecutionDto(e, true);
    }, ct);

    private async Task<T> MutateAsync<T>(Func<Task<T>> action, CancellationToken ct)
    {
        try
        {
            return await transaction.RunAsync(_ => action(), ct);
        }
        catch (DbUpdateConcurrencyException) { throw new ApiException(409, "VERSION_CONFLICT", "Training changed in another tab. Reload before saving."); }
    }
    private Task LockAsync(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 507))", ct);
    private async Task<TrainingRevision> PublishedAsync(Guid programId, Guid? revisionId, AccountIdentity account, CancellationToken ct)
    {
        if (!await db.Plans.AnyAsync(x => x.Id == programId && x.OwnerId == account.UserId && x.WorkspaceId == account.WorkspaceId && !x.Archived && x.Kind == DocumentKind.Program, ct))
            throw ApiException.NotFound();
        var revision = await db.Revisions.Where(x => x.PlanId == programId).OrderByDescending(x => x.Number).FirstOrDefaultAsync(ct)
            ?? throw ApiException.Invalid("Apply changes before assigning the program.");
        if (revisionId != null && revisionId != revision.Id) throw ApiException.Conflict("Use the latest applied version.");
        return revision;
    }
    private async Task<ProgramAssignment> AssignmentAsync(Guid id, RelationshipOperation operation, CancellationToken ct)
    {
        var write = operation is RelationshipOperation.ProtectedWrite or RelationshipOperation.Manage;
        var manage = operation == RelationshipOperation.Manage;
        if (write)
            await LockAsync(id, ct);
        var a = await Assignments.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.NotFound();
        if (write)
            await db.Entry(a).ReloadAsync(ct);
        if (a.CoachId != accounts.UserId && a.ClientId != accounts.UserId)
            throw ApiException.NotFound();
        var decision = await policy.DecideAsync(a.RelationshipId, operation, ct);
        if (!decision.Allowed)
            throw new ApiException(403, "RELATIONSHIP_ACCESS_DENIED", "This relationship does not permit training access.");
        await access.RequireAsync(manage ? "training.assignments.manage" : a.CoachId == accounts.UserId ? (write ? "training.executions.review" : "training.progress.view-clients") : (write ? "training.executions.log-own" : "training.progress.view-own"), ct);
        if (write && !manage)
            await ActiveRelationship(a, ct);
        return a;
    }
    private async Task<(WorkoutOccurrence, ProgramAssignment)> WorkoutContextAsync(Guid id, RelationshipOperation operation, CancellationToken ct)
    {
        var o = await Occurrences.SingleOrDefaultAsync(x => x.Id == id && !x.Superseded, ct) ?? throw ApiException.NotFound();
        var a = await AssignmentAsync(o.AssignmentId, operation, ct);
        if (operation is RelationshipOperation.ProtectedWrite or RelationshipOperation.Manage)
        {
            await db.Entry(o).ReloadAsync(ct);
            if (o.Superseded)
                throw ApiException.NotFound();
        }
        return (o, a);
    }
    private async Task<(WorkoutExecution, ProgramAssignment)> ExecutionContextAsync(Guid id, CancellationToken ct)
    {
        await LockAsync(id, ct);
        var e = await ExecutionQuery().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.NotFound();
        var (_, a) = await WorkoutContextAsync(e.OccurrenceId, RelationshipOperation.ProtectedWrite, ct);
        if (e.Status != ExecutionStatus.Completed)
            Eligible(a);
        return (e, a);
    }
    private IQueryable<WorkoutExecution> ExecutionQuery() => Executions.Include(x => x.Exercises).ThenInclude(x => x.Sets).AsSplitQuery();
    private async Task ActiveRelationship(ProgramAssignment a, CancellationToken ct)
    {
        if ((await relationships.GetAsync(a.RelationshipId, ct))?.Status != RelationshipStatus.Active)
            throw new ApiException(409, "RELATIONSHIP_INACTIVE", "Active coaching is required to change training.");
    }
    private async Task<Guid[]> VisibleAsync(Guid? relationshipId, Guid? groupId, CancellationToken ct, string? view = null)
    {
        if (view is not (null or "coach" or "client"))
            throw ApiException.Invalid("View must be coach or client.");
        var roles = await accounts.GetRolesAsync(ct);
        if (view == "coach" && !roles.Contains(AccountRole.Coach) || view == "client" && !roles.Contains(AccountRole.Client))
            throw new ApiException(403, "ROLE_REQUIRED", "This training view requires the corresponding account role.");
        var relationshipsForUser = new List<RelationshipRecipient>();
        if (view != "client" && roles.Contains(AccountRole.Coach))
            relationshipsForUser.AddRange(await relationships.GetForUserAsync(accounts.UserId, true, ct));
        if (view != "coach" && roles.Contains(AccountRole.Client))
            relationshipsForUser.AddRange(await relationships.GetForUserAsync(accounts.UserId, false, ct));
        var all = relationshipsForUser.DistinctBy(x => x.Id).Where(x => relationshipId == null || x.Id == relationshipId).ToArray();
        if (groupId != null)
        {
            var identity = await accounts.RequireCoachAsync(ct);
            var members = await relationships.ResolveActiveAsync(identity.UserId, identity.WorkspaceId, [], [groupId.Value], ct);
            all = all.Where(x => members.Any(m => m.Id == x.Id)).ToArray();
        }
        var defaultCoach = view == "coach" || view == null && roles.Contains(AccountRole.Coach);
        if (all.Any(x => x.CoachId == accounts.UserId) || all.Length == 0 && defaultCoach)
            await access.RequireAsync("training.progress.view-clients", ct);
        if (all.Any(x => x.ClientId == accounts.UserId) || all.Length == 0 && !defaultCoach)
            await access.RequireAsync("training.progress.view-own", ct);
        var decisions = await DecisionsAsync(all.Select(x => x.Id).ToArray(), RelationshipOperation.HistoricalSharedRead, ct);
        if (relationshipId != null && (!decisions.TryGetValue(relationshipId.Value, out var decision) || !decision.Allowed))
            throw ApiException.NotFound();
        return all.Where(x => decisions.TryGetValue(x.Id, out var d) && d.Allowed).Select(x => x.Id).ToArray();
    }
    private async Task<HashSet<Guid>> ActiveIds(Guid[] ids, CancellationToken ct)
    {
        var decisions = await DecisionsAsync(ids, RelationshipOperation.ProtectedWrite, ct);
        return decisions.Where(x => x.Value.Allowed && x.Value.Status == RelationshipStatus.Active).Select(x => x.Key).ToHashSet();
    }
    private async Task<Dictionary<Guid, RelationshipAccessDecision>> DecisionsAsync(Guid[] ids, RelationshipOperation operation, CancellationToken ct)
    {
        var result = new Dictionary<Guid, RelationshipAccessDecision>();
        foreach (var batch in ids.Chunk(1000))
            foreach (var decision in await policy.DecideManyAsync(batch, operation, ct))
                result[decision.Key] = decision.Value;
        return result;
    }
    private WorkoutExecution NewExecution(WorkoutOccurrence o, ProgramAssignment a) => new()
    {
        Id = Guid.NewGuid(),
        OccurrenceId = o.Id,
        Prescription = o.Prescription,
        PerformedDate = DeliveryRules.LocalDate(clock.GetUtcNow(), a.TimeZone),
        StartedAt = clock.GetUtcNow(),
        UpdatedAt = clock.GetUtcNow(),
        UpdatedBy = accounts.UserId
    };
    private void Touch(WorkoutExecution e)
    {
        e.Version++;
        var now = clock.GetUtcNow();
        // PostgreSQL timestamps have microsecond precision; corrections must remain distinguishable from completion even within one clock tick.
        e.UpdatedAt = now > e.UpdatedAt.AddTicks(10) ? now : e.UpdatedAt.AddTicks(10);
        e.UpdatedBy = accounts.UserId;
    }
    private static void Eligible(ProgramAssignment a)
    {
        if (a.Status != AssignmentStatus.Active)
            throw new ApiException(409, "ASSIGNMENT_INACTIVE", "Resume this assignment before starting or completing training.");
    }
    private static AssignmentDto Dto(ProgramAssignment a, bool coach, bool activeRelationship = true) => new(a.Id, a.RelationshipId, a.ProgramId, a.ProgramName, a.OriginalRevisionId, a.EffectiveRevisionId,
        a.StartDate, a.TimeZone, a.Status, a.GroupAssignmentId == null ? "Direct" : "Group", a.GroupAssignmentId, a.Version,
        coach && a.Status is AssignmentStatus.Active or AssignmentStatus.Paused ? activeRelationship ? ["status", "refresh"] : ["status"] : [], a.ClientId);
    private OccurrenceDto OccurrenceDto(WorkoutOccurrence o, ProgramAssignment a, WorkoutExecution? e, bool active) => new(o.Id, a.Id, a.RelationshipId, a.ProgramId,
        a.ProgramName, o.RevisionId, o.BlockId, o.CycleId, o.DayId, o.WorkoutId, o.Name, o.ScheduledDate, o.Deadline, DeliveryRules.Status(o, e, clock.GetUtcNow()), e?.Id,
        e?.CompletedAt >= o.Deadline, active && a.Status == AssignmentStatus.Active && e == null ? ["start", "skip"] : active && a.Status == AssignmentStatus.Active && e?.Status == ExecutionStatus.Skipped ? ["start"] : active && e != null ? ["view"] : [], e?.PerformedDate, e?.DurationSeconds, !string.IsNullOrWhiteSpace(e?.Comment));
    private static ExecutionDto ExecutionDto(WorkoutExecution e, bool active) => new(e.Id, e.OccurrenceId, e.Status, e.PerformedDate, e.StartedAt, e.CompletedAt, e.UpdatedAt,
        e.Comment, e.DurationSeconds, e.Version, e.Exercises.OrderBy(x => x.Position).Select(x => new ExerciseExecutionDto(x.Id, x.PrescribedInstanceId, x.ExerciseId, x.Name, x.Comment,
            x.Sets.OrderBy(s => s.Position).Select(s => new ActualSet(s.PrescribedSetId, s.PrescribedSegmentId, s.Skipped, s.Reps, s.Load, s.LoadUnit, s.LoadMeaning, s.Rpe, s.Rir, s.DurationSeconds,
                s.DistanceMeters, s.RestSeconds, s.Tempo, s.Comment, s.Id)).ToArray())).ToArray(), active ? e.Status == ExecutionStatus.Completed ? ["save"] : e.Status == ExecutionStatus.InProgress ? ["save", "complete"] : [] : [], e.Feedback);
    private static void Page(int page, int size)
    {
        if (page is < 1 or > 100000 || size is < 1 or > 100)
            throw ApiException.Invalid("Invalid pagination (maximum page size 100).");
    }
    private static void Range(DateOnly from, DateOnly to, int maximumDays = 366)
    {
        if (to < from || to.DayNumber - from.DayNumber > maximumDays)
            throw ApiException.Invalid($"Use an ordered date range of at most {maximumDays + 1} dates.");
    }
    private static void Text(string? text, int length)
    {
        if (text?.Length > length || text?.Contains('\0') == true)
            throw ApiException.Invalid("Text exceeds its limit or contains invalid characters.");
    }
    private static void ValidateAssignment(AssignProgramRequest r)
    {
        if (r.RelationshipIds == null || r.GroupIds == null || r.RelationshipIds.Length > 200 || r.GroupIds.Length > 20 || r.StartDate.Year is < 2000 or > 2090)
            throw ApiException.Invalid("Invalid assignment targets or start date.");
        DeliveryRules.Zone(r.TimeZone);
    }
    private void ValidateExecution(SaveExecutionRequest r, WorkoutPrescription p, string zone)
    {
        if (r.Exercises == null || r.Exercises.Length > 100 || r.DurationSeconds is < 0 or > 86400 || r.PerformedDate.Year < 2000 || r.PerformedDate > DeliveryRules.LocalDate(clock.GetUtcNow(), zone))
            throw ApiException.Invalid("Invalid execution date, duration, or exercise count.");
        Text(r.Comment, 4000);
        var instances = new HashSet<Guid>();
        var totalSets = 0;
        foreach (var ex in r.Exercises)
        {
            if (ex == null || ex.ExerciseId == Guid.Empty || ex.Sets == null || ex.Sets.Length > 100 || (totalSets += ex.Sets.Length) > 1000)
                throw ApiException.Invalid("Invalid actual exercise or more than 1000 actual sets.");
            Text(ex.Comment, 2000);
            var prescribed = p.Workout.Exercises.SingleOrDefault(x => x.Id == ex.PrescribedInstanceId);
            if (ex.PrescribedInstanceId != null && (prescribed == null || !instances.Add(ex.PrescribedInstanceId.Value)))
                throw ApiException.Invalid("Invalid or repeated prescribed exercise reference.");
            var sets = new HashSet<(Guid?, Guid?)>();
            foreach (var s in ex.Sets)
            {
                if (s == null)
                    throw ApiException.Invalid("Actual set cannot be null.");
                var original = prescribed?.Sets.SingleOrDefault(x => x.Id == s.PrescribedSetId);
                if (s.PrescribedSetId != null && (original == null || !sets.Add((s.PrescribedSetId, s.PrescribedSegmentId))))
                    throw ApiException.Invalid("Invalid or repeated prescribed set reference.");
                if (s.PrescribedSegmentId != null && original?.Segments?.Any(x => x.Id == s.PrescribedSegmentId) != true)
                    throw ApiException.Invalid("Invalid prescribed segment reference.");
                if (s.Reps is < 0 or > 10000 || s.Load is < 0 or > 100000 || (s.Load != null && s.LoadUnit is not ("kg" or "lb")) || (s.Load == null && s.LoadUnit != null)
                    || !Enum.IsDefined(s.LoadMeaning) || s.Rpe is < 0 or > 10 || s.Rir is < 0 or > 100 || s.DurationSeconds is < 0 or > 86400 || s.DistanceMeters is < 0 or > 1000000 || s.RestSeconds is < 0 or > 86400)
                    throw ApiException.Invalid("Invalid actual set value or unit.");
                Text(s.Comment, 2000);
                Text(s.Tempo, 40);
            }
        }
    }
}
