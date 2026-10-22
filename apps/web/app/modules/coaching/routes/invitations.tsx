import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Invitations — TrainFlow");

import { Mail } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, Option, PageHeader, Select, Toolbar } from "@trainflow/ui-web";
import { ClientHubActions } from "../hub-actions";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { DataView } from "~/shared/library/DataView";
import { elapsed } from "~/shared/lib/elapsed";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

/** One line on the card when the invitation carries no message: where it stands for each side. */
const sentNote: Record<string, string> = {
  Pending: "Waiting for an answer. You can still revoke it.",
  Accepted: "Accepted. They can now fill out the application form.",
  Declined: "They declined this invitation.",
  Revoked: "You revoked this invitation.",
};
const receivedNote: Record<string, string> = {
  Pending: "Review the coach and the terms, then accept or decline.",
  Accepted: "Accepted. Fill out the application form to continue.",
  Declined: "You declined this invitation.",
  Revoked: "The coach revoked this invitation.",
};

export default function Invitations() {
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ view: "list", page: "1", status: "" });
  const list = useCoachingQuery<Page<Schema<"InvitationDto">>>(`/api/v1/coaching/${coach ? "invitations" : "my-invitations"}`, { page: pageFromParam(state.page), pageSize: 20, status: state.status || undefined });
  return <><PageHeader title={coach ? "Invitations" : "My invitations"} description={coach ? "Invite an existing TrainFlow user to apply for your offer." : "Review the coach and terms before you accept an invitation."} actions={coach ? <ClientHubActions /> : undefined} /><HubNavigation />
    <Toolbar aria-label="Filter invitations" className={styles.toolbar}><Select aria-label="Invitation status" selectedKey={state.status || "all"} onSelectionChange={(k) => update({ status: k === "all" ? "" : String(k) })}><Option id="all">All invitations</Option>{["Pending", "Accepted", "Declined", "Revoked"].map((s) => <Option id={s} key={s}>{s}</Option>)}</Select><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<Mail />} title="No invitations" description={coach ? "Send an invitation by searching for the person's username." : "Invitations from your coaches will appear here."} /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(i) => ({ href: `/app/invitations/${i.id}`, title: coach ? i.target.displayName : i.coach.displayName, icon: <Mail />, tone: "blue", badge: <StatusBadge status={i.status} />, subtitle: i.offerRevision.name, description: i.message?.trim() || (coach ? sentNote : receivedNote)[i.status], meta: [`Sent ${elapsed(i.createdAt)}`, ...(i.respondedAt ? [`Answered ${elapsed(i.respondedAt)}`] : [])] })} label="Invitations" rows={list.data.items} rowKey={(i) => i.id} columns={[
      { id: "person", header: coach ? "Client" : "Coach", cell: (i) => <Link data-row-link to={`/app/invitations/${i.id}`}>{coach ? i.target.displayName : i.coach.displayName}</Link> },
      { id: "offer", header: "Offer", cell: (i) => i.offerRevision.name },
      { id: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
