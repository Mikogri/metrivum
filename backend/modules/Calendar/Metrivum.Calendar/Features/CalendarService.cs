using Metrivum.Notifications.Contracts;
using Microsoft.EntityFrameworkCore;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Calendar.Domain;
using Metrivum.Calendar.Infrastructure;
using Metrivum.Coaching.Contracts;

namespace Metrivum.Calendar.Features;

public sealed class CalendarService(CalendarDbContext db, IAccountContext accounts, IFeatureAccessService access,
    IRelationshipRecipients recipients, IAccountDirectory directory, ModuleTransaction transaction, TimeProvider clock, INotificationPublisher notifications, ITeamContext? teams = null, IRelationshipAccessPolicy? policy = null)
{
    private async Task<AccountIdentity> Identity(string role, CancellationToken ct)
    {
        if (role is not ("coach" or "client"))
            throw ApiException.Invalid("Role must be coach or client.");
        var identity = role == "coach" ? await accounts.RequireCoachAsync(ct) : await accounts.RequireClientAsync(ct);
        await access.RequireAsync(role == "coach" ? "calendar.events.manage" : "calendar.events.read-own", ct);
        return identity;
    }
    private async Task<IQueryable<CalendarEvent>> Visible(AccountIdentity identity, string role, CancellationToken ct)
    {
        if (role == "client")
            return db.Events.Where(e => db.Attendees.Any(a => a.EventId == e.Id && a.ClientId == identity.UserId));
        var team = teams == null ? null : await teams.GetForUserAsync(identity.UserId, ct);
        var teamId = team is { IsActive: true } ? team.TeamId : (Guid?)null;
        return db.Events.Where(e => e.TeamId == null && e.CoachId == identity.UserId && e.WorkspaceId == identity.WorkspaceId
            || teamId != null && e.TeamId == teamId && e.CoachId == identity.UserId);
    }

    public async Task<CalendarPage<EventDto>> List(string role, DateTimeOffset from, DateTimeOffset to, string zone, int page, int size, CancellationToken ct)
    {
        var owner = await Identity(role, ct);
        CalendarRules.Range(from, to, page, size);
        CalendarRules.Zone(zone);
        var query = (await Visible(owner, role, ct)).AsNoTracking().Where(e => e.StartsAtUtc < to && e.EndsAtUtc > from);
        var total = await query.LongCountAsync(ct);
        var rows = await query.OrderBy(e => e.StartsAtUtc).ThenBy(e => e.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        var ids = rows.Select(e => e.Id).ToArray();
        var attendees = await db.Attendees.AsNoTracking().Where(a => ids.Contains(a.EventId) && (role == "coach" || a.ClientId == owner.UserId)).ToArrayAsync(ct);
        var organizers = await directory.GetAccountsAsync(rows.Select(e => e.CoachId).Distinct().ToArray(), ct);
        return new(rows.Select(e => Dto(e, role, attendees.Where(a => a.EventId == e.Id).ToArray(), organizers.GetValueOrDefault(e.CoachId)?.DisplayName ?? "Coach")).ToArray(), page, size, total);
    }
    public async Task<EventDto> Detail(Guid id, string role, CancellationToken ct)
    {
        var owner = await Identity(role, ct);
        var e = await (await Visible(owner, role, ct)).AsNoTracking().SingleOrDefaultAsync(e => e.Id == id, ct) ?? throw ApiException.NotFound();
        var organizer = (await directory.GetAccountsAsync([e.CoachId], ct)).GetValueOrDefault(e.CoachId)?.DisplayName ?? "Coach";
        return Dto(e, role, await db.Attendees.AsNoTracking().Where(a => a.EventId == id && (role == "coach" || a.ClientId == owner.UserId)).ToArrayAsync(ct), organizer);
    }
    public async Task<EventDto> Write(Guid? id, EventWrite request, long version, CancellationToken ct)
    {
        var owner = await Identity("coach", ct);
        var times = CalendarRules.Validate(request);
        return await transaction.RunAsync(async token =>
        {
            await LockCurrentTeam(owner.UserId, token);
            var e = id.HasValue ? await Locked(id.Value, token) : new CalendarEvent { CoachId = owner.UserId, WorkspaceId = owner.WorkspaceId };
            if (e.CoachId != owner.UserId || e.WorkspaceId != owner.WorkspaceId)
                throw ApiException.NotFound();
            if (id.HasValue)
            {
                await RequireTeam(e.TeamId, owner.UserId, token);
                CalendarRules.Version(e.Version, version);
            }
            if (e.Cancelled)
                throw ApiException.Conflict("Cancelled events cannot be edited.");
            var existing = await db.Attendees.Where(a => a.EventId == e.Id).ToListAsync(token);
            // An edit preserves retained historical invitees; only newly invited relationships must be active.
            var retained = existing.Where(a => request.RelationshipIds.Contains(a.RelationshipId)).ToArray();
            var additions = request.RelationshipIds.Except(retained.Select(a => a.RelationshipId)).ToArray();
            var active = additions.Length + request.GroupIds.Count == 0 ? [] : await recipients.ResolveActiveAsync(owner.UserId, owner.WorkspaceId, additions, request.GroupIds, token);
            if (additions.Except(active.Select(r => r.Id)).Any())
                throw ApiException.Conflict("New invitees must have an active relationship.");
            var retainedPeople = new List<RelationshipRecipient>();
            foreach (var attendee in retained)
                retainedPeople.Add(await recipients.GetAsync(attendee.RelationshipId, token) ?? throw ApiException.NotFound());
            var allRecipients = active.Concat(retainedPeople).ToArray();
            var scopes = allRecipients.Select(x => x.TeamId).Distinct().ToArray();
            if (scopes.Length > 1)
                throw ApiException.Invalid("Personal and Team clients cannot share one calendar event.");
            var scope = scopes.Length == 0 ? e.TeamId : scopes[0];
            if (id.HasValue && scope != e.TeamId)
                throw ApiException.Conflict("An existing event cannot change between Personal and Team ownership.");
            if (!id.HasValue && scope is { } organization)
                await TeamLock(organization, token);
            await RequireTeam(scope, owner.UserId, token);
            foreach (var person in allRecipients.Where(x => x.TeamId != null))
                if (person.Status != RelationshipStatus.Active || policy == null || !(await policy.DecideAsync(person.Id, RelationshipOperation.ProtectedWrite, token)).Allowed)
                    throw ApiException.NotFound();
            e.TeamId = scope;
            var resolved = allRecipients.DistinctBy(r => r.ClientId).ToArray();
            var timingChanged = id.HasValue && (e.StartsAtUtc != times.Start || e.EndsAtUtc != times.End || e.TimeZone != request.TimeZone || e.StartDate != request.StartDate || e.EndDateExclusive != request.EndDateExclusive);
            e.Kind = request.Kind;
            e.Title = request.Title.Trim();
            e.Description = request.Description ?? "";
            e.TimeZone = request.TimeZone;
            e.StartsAtUtc = times.Start;
            e.EndsAtUtc = times.End;
            e.StartDate = request.StartDate;
            e.EndDateExclusive = request.EndDateExclusive;
            e.Location = request.Location;
            e.MeetingUrl = request.MeetingUrl;
            if (id.HasValue)
                e.Version++;
            else
                db.Events.Add(e);
            var selected = resolved.Select(r => r.ClientId).ToHashSet();
            db.Attendees.RemoveRange(existing.Where(a => !selected.Contains(a.ClientId)));
            foreach (var r in resolved.DistinctBy(r => r.ClientId))
            {
                var a = existing.SingleOrDefault(a => a.ClientId == r.ClientId);
                if (a == null)
                    db.Attendees.Add(new CalendarAttendee { EventId = e.Id, ClientId = r.ClientId, RelationshipId = r.Id, CoachId = owner.UserId, WorkspaceId = owner.WorkspaceId });
                else if (timingChanged)
                {
                    a.Response = "Pending";
                    a.Version++;
                }
            }
            Audit(e.Id, id.HasValue ? "Updated" : "Created");
            await db.SaveChangesAsync(token);
            foreach (var recipient in resolved.Select(r => r.ClientId).Distinct())
                await notifications.PublishAsync(new(recipient, "calendar:" + e.Id + ":" + e.Version, id.HasValue ? "CalendarChanged" : "CalendarInvitation", "System", "Calendar", e.Id, "/app/calendar"), token);
            return await Detail(e.Id, "coach", token);
        }, ct);
    }
    public async Task<EventDto> Cancel(Guid id, long version, CancellationToken ct)
    {
        var owner = await Identity("coach", ct);
        return await transaction.RunAsync(async token =>
        {
            await LockCurrentTeam(owner.UserId, token);
            var e = await Locked(id, token);
            await RequireTeam(e.TeamId, owner.UserId, token);
            if (e.CoachId != owner.UserId || e.WorkspaceId != owner.WorkspaceId)
                throw ApiException.NotFound();
            CalendarRules.Version(e.Version, version);
            if (!e.Cancelled)
            {
                e.Cancelled = true;
                e.Version++;
                Audit(id, "Cancelled");
                await db.SaveChangesAsync(token);
                foreach (var user in await db.Attendees.Where(a => a.EventId == id).Select(a => a.ClientId).Distinct().ToArrayAsync(token))
                    await notifications.PublishAsync(new(user, "calendar:" + id + ":" + e.Version, "CalendarCancelled", "System", "Calendar", id, "/app/calendar"), token);
            }
            return await Detail(id, "coach", token);
        }, ct);
    }
    /// <summary>
    /// Brings a cancelled event back. Invitees answer again (their earlier answer was given before the cancellation)
    /// and are told it is on; Team events still need an active Team and active relationships, as for an edit.
    /// </summary>
    public async Task<EventDto> Restore(Guid id, long version, CancellationToken ct)
    {
        var owner = await Identity("coach", ct);
        return await transaction.RunAsync(async token =>
        {
            await LockCurrentTeam(owner.UserId, token);
            var e = await Locked(id, token);
            await RequireTeam(e.TeamId, owner.UserId, token);
            if (e.CoachId != owner.UserId || e.WorkspaceId != owner.WorkspaceId)
                throw ApiException.NotFound();
            CalendarRules.Version(e.Version, version);
            if (e.Cancelled)
            {
                var attendees = await db.Attendees.Where(a => a.EventId == id).ToListAsync(token);
                if (e.TeamId != null)
                    foreach (var attendee in attendees)
                    {
                        var person = await recipients.GetAsync(attendee.RelationshipId, token);
                        if (person == null || person.TeamId != e.TeamId || person.Status != RelationshipStatus.Active || policy == null || !(await policy.DecideAsync(person.Id, RelationshipOperation.ProtectedWrite, token)).Allowed)
                            throw ApiException.Conflict("A Team client on this event is no longer available. Create a new event instead.");
                    }
                e.Cancelled = false;
                e.Version++;
                foreach (var attendee in attendees)
                {
                    attendee.Response = "Pending";
                    attendee.Version++;
                }
                Audit(id, "Restored");
                await db.SaveChangesAsync(token);
                foreach (var user in attendees.Select(a => a.ClientId).Distinct())
                    await notifications.PublishAsync(new(user, "calendar:" + id + ":" + e.Version, "CalendarChanged", "System", "Calendar", id, "/app/calendar"), token);
            }
            return await Detail(id, "coach", token);
        }, ct);
    }
    public async Task<EventDto> Respond(Guid id, EventResponse request, long version, CancellationToken ct)
    {
        var owner = await Identity("client", ct);
        await access.RequireAsync("calendar.invitations.respond-own", ct);
        if (request.Status is not ("Accepted" or "Declined"))
            throw ApiException.Invalid("Choose Accepted or Declined.");
        return await transaction.RunAsync(async token =>
        {
            // Team closure and event edits use the same lock order.
            var teamId = await db.Events.AsNoTracking().Where(x => x.Id == id).Select(x => x.TeamId).SingleOrDefaultAsync(token);
            if (teamId is { } organization)
                await TeamLock(organization, token);
            var e = await Locked(id, token);
            var a = await db.Attendees.SingleOrDefaultAsync(a => a.EventId == id && a.ClientId == owner.UserId, token) ?? throw ApiException.NotFound();
            CalendarRules.Version(a.Version, version);
            if (e.Cancelled)
                throw ApiException.Conflict("This event was cancelled.");
            var relationship = await recipients.GetAsync(a.RelationshipId, token);
            if (relationship?.Status != RelationshipStatus.Active)
                throw ApiException.Conflict("The relationship is no longer active.");
            if (e.TeamId != null && (relationship.TeamId != e.TeamId || policy == null || !(await policy.DecideAsync(relationship.Id, RelationshipOperation.ProtectedWrite, token)).Allowed))
                throw ApiException.NotFound();
            if (a.Response != request.Status)
            {
                a.Response = request.Status;
                a.Version++;
                Audit(id, request.Status);
                await db.SaveChangesAsync(token);
                await notifications.PublishAsync(new(e.CoachId, "calendar:" + id + ":" + a.ClientId + ":" + a.Version, "Calendar" + request.Status, "System", "Calendar", id, "/app/calendar"), token);
            }
            return await Detail(id, "client", token);
        }, ct);
    }
    private async Task LockCurrentTeam(Guid user, CancellationToken ct)
    {
        var team = teams == null ? null : await teams.GetForUserAsync(user, ct);
        if (team != null)
            await TeamLock(team.TeamId, ct);
    }
    private Task TeamLock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"team:" + id}, 0))", ct);
    private async Task RequireTeam(Guid? id, Guid user, CancellationToken ct)
    {
        if (id == null)
            return;
        if (teams == null)
            throw ApiException.NotFound();
        await teams.RequireAsync(id.Value, user, false, ct);
    }
    private async Task<CalendarEvent> Locked(Guid id, CancellationToken ct)
    {
        var item = (await db.Events.FromSqlInterpolated($"SELECT * FROM calendar.\"Events\" WHERE \"Id\" = {id} FOR UPDATE").ToArrayAsync(ct)).SingleOrDefault() ?? throw ApiException.NotFound();
        await db.Entry(item).ReloadAsync(ct);
        return item;
    }
    private void Audit(Guid id, string action) => db.Audit.Add(new CalendarAudit { EventId = id, ActorId = accounts.UserId, Action = action, At = clock.GetUtcNow() });
    private static EventDto Dto(CalendarEvent e, string role, CalendarAttendee[] rows, string organizer)
    {
        var own = role == "client" ? rows.SingleOrDefault() : null;
        return new(e.Id, e.CoachId, organizer, e.Kind, e.Title, e.Description, e.TimeZone, e.StartsAtUtc, e.EndsAtUtc, e.StartDate, e.EndDateExclusive,
            e.Location, e.MeetingUrl, e.Cancelled, e.Version, own?.Response, own?.Version,
            role == "coach" ? rows.Select(a => new AttendeeDto(a.RelationshipId, a.ClientId, a.Response, a.Version)).ToArray() : null, e.TeamId);
    }
}
