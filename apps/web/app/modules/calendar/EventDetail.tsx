import { CalendarDays, Clock, Link2, MapPin, UserRound } from "lucide-react";
import { Avatar, Badge, Button, DialogFooter, LinkButton } from "@trainflow/ui-web";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useCoachingQuery, useCoachingMutation, type Page, type Relationship } from "~/modules/coaching";
import { Failure, Loading, MutationError } from "~/modules/coaching";
import type { CalendarEvent } from "./api";
import styles from "./calendar.module.css";

const responseTone = (response: string) => (response === "Accepted" ? "success" : response === "Declined" ? "danger" : "neutral");

/** Meeting / event details in the side panel, with the organiser's or the invitee's actions at the bottom. */
export function EventDetail({ id, edit, close }: { id: string; edit: (event: CalendarEvent) => void; close: () => void }) {
  const { mode } = useWorkspace();
  const query = useCoachingQuery<CalendarEvent>(`/api/v1/calendar/events/${id}`, { role: mode });
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { pageSize: 100 }, mode === "coach");
  const mutation = useCoachingMutation();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const event = query.data;
  const day = (v: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone }).format(new Date(v));
  const hour = (v: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: event.timeZone }).format(new Date(v));
  const sameDay = day(event.startsAtUtc) === day(event.endsAtUtc);
  const lastDay = event.endDateExclusive ? new Date(Date.parse(event.endDateExclusive) - 86_400_000).toISOString().slice(0, 10) : null;
  const allDay = (v: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(v));
  const name = (a: NonNullable<CalendarEvent["attendees"]>[number]) => clients.data?.items.find((r) => r.id === a.relationshipId)?.client.displayName || "Client";

  return (
    <div className={styles.detail}>
      <div className={styles.detailTitle}>
        <span className={styles.kind} data-kind={event.kind}>
          {event.kind}
        </span>
        <h2>{event.title}</h2>
        {event.cancelled ? <Badge tone="danger" dot>Cancelled</Badge> : null}
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <CalendarDays aria-hidden="true" />
          <dd>
            {event.startDate ? (lastDay && lastDay !== event.startDate ? `${allDay(event.startDate)} – ${allDay(lastDay)}` : allDay(event.startDate)) : day(event.startsAtUtc)}
            {!event.startDate && !sameDay ? ` – ${day(event.endsAtUtc)}` : null}
          </dd>
        </div>
        <div className={styles.fact}>
          <Clock aria-hidden="true" />
          <dd>
            {event.startDate ? "All day" : `${hour(event.startsAtUtc)} – ${hour(event.endsAtUtc)}`}
            <small>{event.timeZone.replace(/_/g, " ")}</small>
          </dd>
        </div>
        {event.location ? (
          <div className={styles.fact}>
            <MapPin aria-hidden="true" />
            <dd>{event.location}</dd>
          </div>
        ) : null}
        {event.meetingUrl ? (
          <div className={styles.fact}>
            <Link2 aria-hidden="true" />
            <dd>
              <LinkButton href={event.meetingUrl} target="_blank" rel="noreferrer" size="sm" variant="secondary">
                Join meeting
              </LinkButton>
            </dd>
          </div>
        ) : null}
        <div className={styles.fact}>
          <UserRound aria-hidden="true" />
          <dd>
            <span>{event.organizerName || "Coach"}</span>
            <small>Organiser</small>
          </dd>
        </div>
      </dl>

      {event.description ? <p className={styles.description}>{event.description}</p> : null}

      {mode === "coach" ? (
        <section className={styles.editorSection}>
          <h3>Invited</h3>
          {event.attendees?.length ? (
            <ul className={styles.people}>
              {event.attendees.map((a) => (
                <li key={a.clientId} className={styles.person}>
                  <Avatar name={name(a)} size="sm" decorative />
                  <span>{name(a)}</span>
                  <Badge tone={responseTone(a.response)} size="sm" dot>
                    {a.response}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Nobody is invited.</p>
          )}
        </section>
      ) : !event.cancelled ? (
        <section className={styles.editorSection}>
          <h3>Your answer</h3>
          <p className={styles.muted}>
            {event.response === "Pending" ? "Let your coach know if you can make it. If the time changes, you'll be asked again." : `You ${event.response?.toLowerCase()} this invitation.`}
          </p>
        </section>
      ) : null}

      <MutationError error={mutation.error} />
      <DialogFooter>
        {event.cancelled ? (
          <Button onPress={close}>Close</Button>
        ) : mode === "coach" ? (
          <>
            <Button variant="ghost" isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/calendar/events/${id}/cancel`, ifMatch: event.version })}>
              Cancel {event.kind.toLowerCase()}
            </Button>
            <Button variant="primary" onPress={() => edit(event)}>
              Edit
            </Button>
          </>
        ) : (
          (["Declined", "Accepted"] as const).map((status) => (
            <Button
              key={status}
              variant={status === "Accepted" ? "primary" : "secondary"}
              isDisabled={mutation.isPending || event.response === status}
              onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/calendar/events/${id}/response`, ifMatch: event.responseVersion!, json: { status } })}
            >
              {status === "Accepted" ? "Accept" : "Decline"}
            </Button>
          ))
        )}
      </DialogFooter>
    </div>
  );
}
