import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { CalendarDays, Clock, Link2, MapPin, RotateCcw, UserRound } from "lucide-react";
import { Avatar, Badge, Button, DialogFooter, LinkButton, toast } from "@metrivum/ui-web";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useCoachingQuery, useCoachingMutation, type Page, type Relationship } from "~/modules/coaching";
import { Failure, Loading, MutationError } from "~/modules/coaching";
import type { CalendarEvent } from "./api";
import styles from "./calendar.module.css";

const responseTone = (response: string) => (response === "Accepted" ? "success" : response === "Declined" ? "danger" : "neutral");

/** Meeting / event details in the side panel, with the organiser's or the invitee's actions at the bottom. */
export function EventDetail({ id, edit, close }: { id: string; edit: (event: CalendarEvent) => void; close: () => void }) {
  const uiCopy = useUiCopy();

  const { mode } = useWorkspace();
  const query = useCoachingQuery<CalendarEvent>(`/api/v1/calendar/events/${id}`, { role: mode });
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { pageSize: 100 }, mode === "coach");
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const event = query.data;
  const day = (v: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone }).format(new Date(v));
  const hour = (v: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: event.timeZone }).format(new Date(v));
  const sameDay = day(event.startsAtUtc) === day(event.endsAtUtc);
  const lastDay = event.endDateExclusive ? new Date(Date.parse(event.endDateExclusive) - 86_400_000).toISOString().slice(0, 10) : null;
  const allDay = (v: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(v));
  const name = (a: NonNullable<CalendarEvent["attendees"]>[number]) => clients.data?.items.find((r) => r.id === a.relationshipId)?.client.displayName || "Client";
  const noun = event.kind.toLowerCase();
  const invited = event.attendees?.length ?? 0;
  const cancel = async () => {
    const confirmed = await ask({
      title: `Cancel this ${noun}?`,
      body: invited ? `${invited === 1 ? "The invited client is" : `All ${invited} invited clients are`} told it is cancelled. You can restore it later.` : "It stays in your calendar, marked as cancelled. You can restore it later.",
      confirmLabel: `Cancel ${noun}`,
      cancelLabel: `Keep ${noun}`,
    });
    if (confirmed) mutation.mutate({ method: "POST", path: `/api/v1/calendar/events/${id}/cancel`, ifMatch: event.version }, { onSuccess: () => toast({ tone: "neutral", title: `${event.kind} cancelled` }) });
  };
  const restore = () => mutation.mutate({ method: "POST", path: `/api/v1/calendar/events/${id}/restore`, ifMatch: event.version }, {
    onSuccess: () => toast({ tone: "success", title: `${event.kind} restored`, description: invited ? "Invited clients are asked to answer again." : undefined }),
  });

  return (
    <div className={styles.detail}>
      <div className={styles.detailTitle}>
        <span className={styles.kind} data-kind={event.kind}>
          {event.kind}
        </span>
        <h2>{event.title}</h2>
        {event.cancelled ? <Badge tone="danger" dot>{uiCopy["video"]["statuses"]["Cancelled"]}</Badge> : null}
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
            {event.startDate ? uiCopy["ui"]["All day"] : `${hour(event.startsAtUtc)} – ${hour(event.endsAtUtc)}`}
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

                {uiCopy["ui"]["Join meeting"]}
              </LinkButton>
            </dd>
          </div>
        ) : null}
        <div className={styles.fact}>
          <UserRound aria-hidden="true" />
          <dd>
            <span>{event.organizerName || uiCopy["profile"]["roles"]["Coach"]}</span>
            <small>{uiCopy["ui"]["Organiser"]}</small>
          </dd>
        </div>
      </dl>

      {event.description ? <p className={styles.description}>{event.description}</p> : null}

      {mode === "coach" ? (
        <section className={styles.editorSection}>
          <h3>{uiCopy["ui"]["Invited"]}</h3>
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
            <p className={styles.muted}>{uiCopy["ui"]["Nobody is invited."]}</p>
          )}
        </section>
      ) : !event.cancelled ? (
        <section className={styles.editorSection}>
          <h3>{uiCopy["ui"]["Your answer"]}</h3>
          <p className={styles.muted}>
            {event.response === "Pending" ? uiCopy["ui"]["Let your coach know if you can make it. If the time changes, you'll be asked again."] : `You ${event.response?.toLowerCase()} this invitation.`}
          </p>
        </section>
      ) : null}

      {event.cancelled && mode === "coach" ? <p className={styles.muted}>{uiCopy["ui"]["This"]} {noun}  {uiCopy["ui"]["is cancelled. Restore it to put it back on the calendar; invited clients are asked to answer again."]}</p> : null}
      <MutationError error={mutation.error} />
      {confirmDialog}
      <DialogFooter>
        {event.cancelled ? (
          <>
            <Button onPress={close}>{uiCopy["common"]["close"]}</Button>
            {mode === "coach" ? <Button variant="primary" iconStart={<RotateCcw />} loading={mutation.isPending} onPress={restore}>{uiCopy["common"]["restore"]} {noun}</Button> : null}
          </>
        ) : mode === "coach" ? (
          <>
            <Button variant="danger" isDisabled={mutation.isPending} loading={mutation.isPending} onPress={() => void cancel()}>

              {uiCopy["common"]["cancel"]} {noun}
            </Button>
            <Button variant="primary" onPress={() => edit(event)}>

              {uiCopy["profile"]["showcase"]["edit"]}
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
              {status === "Accepted" ? uiCopy["ui"]["Accept"] : uiCopy["ui"]["Decline"]}
            </Button>
          ))
        )}
      </DialogFooter>
    </div>
  );
}
