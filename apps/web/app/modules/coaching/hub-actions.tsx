import { CalendarClock, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, Dialog, DialogFooter, LinkButton, Option, Select, TextArea } from "@trainflow/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { UserAutocomplete, useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery, type Page } from "./api";
import { Failure, MutationError } from "./components";
import styles from "./coaching.module.css";

/**
 * The same two actions on every Clients hub tab (clients, leads, invitations, groups, check-ins):
 * check-in schedules and inviting a client. They don't change with the selected tab.
 */
export function ClientHubActions() {
  const canSend = useFeatureAccess("coaching.invitations.send");
  const canSchedule = useFeatureAccess("checkins.schedules.manage");
  const [open, setOpen] = useState(false);
  return (
    <>
      {canSchedule.allowed ? <LinkButton href="/app/check-in-schedules" iconStart={<CalendarClock />}>Check-in schedules</LinkButton> : null}
      {canSend.allowed ? <Button variant="primary" iconStart={<UserPlus />} onPress={() => setOpen(true)}>Invite client</Button> : null}
      {open && canSend.allowed ? <InvitationEditor close={() => setOpen(false)} /> : null}
    </>
  );
}

export function InvitationEditor({ close }: { close: () => void }) {
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
    <UserAutocomplete label="Client username" isRequired value={username} onChange={setUsername} autoFocus isDisabled={mutation.isPending} />
    {offers.isError ? <Failure error={offers.error} retry={() => void offers.refetch()} /> : <Select label="Offer" placeholder={offers.isPending ? "Loading offers…" : "Choose an active offer"} isRequired isDisabled={!offerItems.length} selectedKey={selectedOffer || null} onSelectionChange={(key) => { setOffer(String(key)); setOption(""); }}>{offerItems.map((o) => <Option key={o.id} id={o.id}>{o.name}</Option>)}</Select>}
    {revision.data ? <Select label="Billing option" selectedKey={option || "any"} onSelectionChange={(key) => setOption(key === "any" ? "" : String(key))}><Option id="any">Let the client choose</Option>{revision.data.billingOptions.map((o) => <Option key={o.id} id={o.id}>{o.name}</Option>)}</Select> : null}
    {offers.data?.items.length === 0 ? <Alert tone="warning" title="Activate an offer first" actions={<LinkButton href="/app/offers" size="sm">Open offers</LinkButton>}>Invitations are tied to an active offer.</Alert> : null}
    <TextArea label="Message" placeholder="Optional, a short note for the client" value={message} onChange={setMessage} maxLength={1000} />
    <MutationError error={mutation.error} />
    <DialogFooter><Button onPress={close}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!revision.data || !username.trim()}>Send invitation</Button></DialogFooter>
  </form></Dialog>;
}
