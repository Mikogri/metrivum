import { Mail, UserPlus } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, DataTable, Dialog, DialogFooter, EmptyState, LinkButton, Option, PageHeader, Select, TextArea, TextField, Toolbar } from "@trainflow/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { useProfile } from "~/modules/accounts";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import styles from "../coaching.module.css";

export default function Invitations() {
  const coach = useWorkspace().mode === "coach";
  const canSend = useFeatureAccess("coaching.invitations.send");
  const [state, update] = useUrlState({ page: "1", status: "" });
  const [open, setOpen] = useState(false);
  const list = useCoachingQuery<Page<Schema<"InvitationDto">>>(`/api/v1/coaching/${coach ? "invitations" : "my-invitations"}`, { page: pageFromParam(state.page), pageSize: 20, status: state.status || undefined });
  return <><PageHeader title={coach ? "Invitations" : "My invitations"} description={coach ? "Invite an existing TrainFlow user to apply for your offer." : "Review the coach and terms before you accept an invitation."} actions={coach && canSend.allowed && <Button variant="primary" iconStart={<UserPlus />} onPress={() => setOpen(true)}>Invite client</Button>} /><HubNavigation />
    <Toolbar aria-label="Filter invitations" className={styles.toolbar}><Select aria-label="Invitation status" selectedKey={state.status || "all"} onSelectionChange={(k) => update({ status: k === "all" ? "" : String(k) })}><Option id="all">All invitations</Option>{["Pending", "Accepted", "Declined", "Revoked"].map((s) => <Option id={s} key={s}>{s}</Option>)}</Select></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<Mail />} title="No invitations" description={coach ? "Send an invitation using the person's exact username." : "Invitations from your coaches will appear here."} /> : <><DataTable label="Invitations" rows={list.data.items} rowKey={(i) => i.id} columns={[
      { id: "person", header: coach ? "Client" : "Coach", cell: (i) => <Link data-row-link to={`/app/invitations/${i.id}`}>{coach ? i.target.displayName : i.coach.displayName}</Link> },
      { id: "offer", header: "Offer", cell: (i) => i.offerRevision.name },
      { id: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {open && canSend.allowed && <InvitationEditor close={() => setOpen(false)} />}
  </>;
}

function InvitationEditor({ close }: { close: () => void }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [offerId, setOffer] = useState("");
  const [option, setOption] = useState("");
  const [message, setMessage] = useState("");
  const offers = useCoachingQuery<Page<Schema<"OfferDto">>>("/api/v1/offers", { status: "Active", pageSize: 100 });
  const selectedOffer = offerId || (offers.data?.items.length === 1 ? offers.data.items[0]!.id : "");
  const revision = useCoachingQuery<Schema<"OfferRevisionDto">>(`/api/v1/coaches/${profile.id}/offers/${selectedOffer}`, undefined, Boolean(selectedOffer));
  const mutation = useCoachingMutation<Schema<"InvitationDto">>((i) => navigate(`/app/invitations/${i.id}`));
  const offerItems = offers.data?.items ?? [];
  return <Dialog isOpen title="Invite a client" description="The invitation shows up in their TrainFlow account. No email or push notification is sent." onOpenChange={(v) => { if (!v) close(); }}><form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: "POST", path: "/api/v1/coaching/invitations", json: { username: username.trim().replace(/^@/, ""), offerId: selectedOffer, billingOptionId: option || null, message: message || null } }); }}>
    <TextField label="Exact username" placeholder="@username" isRequired value={username} onChange={setUsername} maxLength={30} autoFocus />
    {offers.isError ? <Failure error={offers.error} retry={() => void offers.refetch()} /> : <Select label="Offer" placeholder={offers.isPending ? "Loading offers…" : "Choose an active offer"} isRequired isDisabled={!offerItems.length} selectedKey={selectedOffer || null} onSelectionChange={(key) => { setOffer(String(key)); setOption(""); }}>{offerItems.map((o) => <Option key={o.id} id={o.id}>{o.name}</Option>)}</Select>}
    {revision.data ? <Select label="Billing option" selectedKey={option || "any"} onSelectionChange={(key) => setOption(key === "any" ? "" : String(key))}><Option id="any">Let the client choose</Option>{revision.data.billingOptions.map((o) => <Option key={o.id} id={o.id}>{o.name}</Option>)}</Select> : null}
    {offers.data?.items.length === 0 ? <Alert tone="warning" title="Activate an offer first" actions={<LinkButton href="/app/offers" size="sm">Open offers</LinkButton>}>Invitations are tied to an active offer.</Alert> : null}
    <TextArea label="Message" placeholder="Optional, a short note for the client" value={message} onChange={setMessage} maxLength={1000} />
    <MutationError error={mutation.error} />
    <DialogFooter><Button onPress={close}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!revision.data || !username.trim()}>Send invitation</Button></DialogFooter>
  </form></Dialog>;
}
