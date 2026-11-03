import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Team — Metrivum");

import { UserAutocomplete } from "~/modules/accounts";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Building2, Crown, LogOut, Mail, Tag, UsersRound } from "lucide-react";
import { Link as RouterLink } from "react-router";
import { Alert, AlertDialog, Avatar, Badge, Button, Card, DataTable, Dialog, EmptyState, LinkButton, Option, PageHeader, Select, Tab, TabList, TabPanel, Tabs, TextArea, TextField, toast } from "@metrivum/ui-web";
import { Failure, Loading, MutationError, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useAccountContext, useAccountKey } from "~/shared/session/AccountScope";
import { ApiError } from "~/shared/http";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { TeamBilling } from "~/modules/subscription";
import { TEAM_PAGE_SIZE, TeamClients, TeamPageControls, TransferRequests } from "./team-clients";
import styles from "./team.module.css";

export type Team = Schema<"TeamDto">;
export type Member = Schema<"TeamMemberDto">;
type Request = Schema<"TeamRequestDto">;

export function useTeamMutation<T = unknown>(onSuccess?: (result: T) => void) {
  const account = useAccountKey();
  const cache = useQueryClient();
  return useCoachingMutation<T>((result) => {
    void cache.invalidateQueries({ queryKey: [account, "access"] });
    void cache.invalidateQueries({ queryKey: [account, "me"] });
    onSuccess?.(result);
  });
}

export function TeamMutationError({ error }: { error: unknown }) {
  const uiCopy = useUiCopy();

  const { account } = useAccountContext();
  return <><MutationError error={error} />{error instanceof ApiError && error.code === "REAUTHENTICATION_REQUIRED" && <Alert tone="warning" title={uiCopy["ui"]["Confirm your identity before continuing"]} actions={<LinkButton href={`/auth/login?slot=${account.slot}&returnTo=${encodeURIComponent("/app/team")}`}>{uiCopy["shell"]["signInAgain"]}</LinkButton>}><p>{uiCopy["ui"]["Sign in again, return to Team, and retry this action. Nothing has been changed."]}</p></Alert>}</>;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const statusTone = (status: string) => (status === "Active" ? "success" : status === "Pending" ? "info" : "warning");

export default function TeamRoute() {
  const uiCopy = useUiCopy();

  const home = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
  const mutation = useTeamMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  // The invitation being answered and how, so only its button spins.
  const [deciding, setDeciding] = useState<{ id: string; accept: boolean } | null>(null);
  if (home.isPending) return <Loading />;
  if (home.isError) return <Failure error={home.error} retry={() => void home.refetch()} />;
  const invites = home.data.requests.filter((request) => request.kind === "Invite" && request.canDecide);
  const decide = (request: Request, accept: boolean) => {
    setDeciding({ id: request.id, accept });
    mutation.mutate({ method: "POST", path: `/api/v1/teams/requests/${request.id}/decision`, json: { accept } }, {
      onSuccess: () => toast(accept ? { tone: "success", title: `You joined ${request.teamName}`, description: `You are now a ${request.role.toLowerCase()} of the Team.` } : { tone: "neutral", title: `Invitation to ${request.teamName} declined` }),
      onSettled: () => setDeciding(null),
    });
  };
  return <><PageHeader title={uiCopy["ui"]["Team"]} description={uiCopy["ui"]["Your organization, membership and shared coaching. Personal clients and resources remain private."]} />
    <div className={styles.page}>
      <TeamMutationError error={mutation.error} />
      {confirmDialog}
      {invites.length > 0 && <section aria-labelledby="team-invites" className={styles.invites}>
        <h2 id="team-invites" className={styles.sectionTitle}>{uiCopy["ui"]["Incoming invitations"]}</h2>
        {invites.map((request) => <Card key={request.id} padding="md" className={styles.invite}>
          <span className={styles.inviteIcon} aria-hidden="true"><Mail /></span>
          <div className={styles.grow}>
            <p className={styles.strong}>{request.teamName}</p>
            <p className={styles.muted}>{uiCopy["ui"]["Join as"]} {request.role}{request.expiresAt ? ` · expires ${new Date(request.expiresAt).toLocaleDateString()}` : ""}</p>
          </div>
          <Button variant="danger-ghost" isDisabled={mutation.isPending} loading={mutation.isPending && deciding?.id === request.id && !deciding.accept} onPress={async () => { if (await ask({ title: `Decline the invitation to ${request.teamName}?`, body: "The Team is told you declined. An admin can invite you again later.", confirmLabel: uiCopy["ui"]["Decline invitation"], cancelLabel: uiCopy["ui"]["Keep invitation"] })) decide(request, false); }}>{uiCopy["ui"]["Decline invitation"]}</Button>
          <Button variant="primary" isDisabled={mutation.isPending} loading={mutation.isPending && deciding?.id === request.id && deciding.accept} onPress={() => decide(request, true)}>{uiCopy["ui"]["Accept invitation"]}</Button>
        </Card>)}
      </section>}
      <TransferRequests />
      {!home.data.teams.length && <EmptyState icon={<Building2 />} title={uiCopy["ui"]["You have not joined a Team"]} description={uiCopy["ui"]["Accept an invitation to join an organization, or choose the Team plan to start your own."]} actions={<LinkButton href="/app/subscription" variant="primary">{uiCopy["ui"]["Choose Team plan"]}</LinkButton>} />}
      {home.data.teams.map((team) => <TeamWorkspace key={team.id} team={team} requests={home.data.requests.filter((request) => request.teamId === team.id)} />)}
    </div>
  </>;
}

function Seats({ team }: { team: Team }) {
 const uiCopy = useUiCopy();

  const used = Number(team.occupiedSeats);
  const total = Number(team.purchasedSeats);
  const ratio = total ? Math.min(1, used / total) : 0;
  return <div className={styles.seats}>
    <p className={styles.seatsValue}>{used}<small> / {total}  {uiCopy["ui"]["seats"]}</small></p>
    <span className={styles.meter} data-full={used >= total || undefined} aria-hidden="true"><span style={{ transform: `scaleX(${ratio})` }} /></span>
    <p className={styles.muted}>{used >= total ? uiCopy["ui"]["All seats are taken"] : `${total - used} free`}</p>
  </div>;
}

function TeamWorkspace({ team, requests }: { team: Team; requests: Request[] }) {
  const uiCopy = useUiCopy();

  const [tab, setTab] = useState("overview");
  const { account } = useAccountContext();
  const [memberPage, setMemberPage] = useState(1);
  const roster = useCoachingQuery<Member[]>(`/api/v1/teams/${team.id}/members`, tab === "members" ? { page: memberPage, pageSize: TEAM_PAGE_SIZE } : undefined, tab === "members" || tab === "clients");
  const mutation = useTeamMutation();
  const [leaving, setLeaving] = useState(false);
  const can = (action: string) => team.allowedActions.includes(`teams.${action}`);
  const links = [
    (team.status === "Active" || team.status === "DissolutionScheduled") && { href: "/app/offers?scope=team", icon: Tag, title: uiCopy["ui"]["Team offers"], body: "Offers sold under the organization's name." },
    can("clients") && { href: "/app/groups?scope=team", icon: UsersRound, title: uiCopy["ui"]["My Team groups"], body: "Groups of Team clients you can manage." },
    can("analyze") && { href: "/app/analyze?scope=Team", icon: BarChart3, title: uiCopy["ui"]["Team Analyze"], body: "Revenue, clients and check-ins across the Team." },
    team.role === "Member" && { href: "/app/analyze?scope=TeamMember", icon: BarChart3, title: uiCopy["ui"]["My Team activity"], body: "Your own work on Team clients." },
  ].filter(Boolean) as Array<{ href: string; icon: typeof Tag; title: string; body: string }>;
  return <Card as="section" padding="none" className={styles.workspace} aria-labelledby={`team-${team.id}`}>
    <header className={styles.hero}>
      <span className={styles.mark} aria-hidden="true">{initials(team.name)}</span>
      <div className={styles.grow}>
        <h2 id={`team-${team.id}`} className={styles.teamName}>{team.name}</h2>
        <div className={styles.badges}>
          <Badge size="sm" tone={team.isOwner ? "accent" : "neutral"}>{team.isOwner ? <><Crown aria-hidden="true" className={styles.crown} />  {uiCopy["ui"]["Owner"]}</> : team.role}</Badge>
          <Badge size="sm" tone={statusTone(team.status)} dot>{team.status}</Badge>
        </div>
        {team.description && <p className={styles.muted}>{team.description}</p>}
      </div>
      <Seats team={team} />
    </header>
    <div className={styles.body}>
      {team.status !== "Active" && <Alert tone="warning" title={formatInterfaceText(uiCopy["ui"]["Team is {0}"], [team.status])}>{uiCopy["ui"]["Team operations depend on organization status and paid entitlement. Your personal workspace remains available."]}</Alert>}
      {team.pendingOwnerId === account.userId && <Alert title={uiCopy["ui"]["Ownership transfer awaiting your acceptance"]} actions={<Button loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/ownership-transfer/accept`, json: { version: team.version } })}>{uiCopy["ui"]["Accept ownership"]}</Button>}><p>{uiCopy["ui"]["Accepting makes you responsible for Team administration and billing. Recent sign-in is required."]}</p></Alert>}
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <TabList aria-label={formatInterfaceText(uiCopy["ui"]["{0} sections"], [team.name])}><Tab id="overview">{uiCopy["exercises"]["detail"]["overview"]}</Tab><Tab id="members">{uiCopy["ui"]["Members"]}</Tab><Tab id="clients">{team.role === "Member" ? uiCopy["ui"]["Assigned clients"] : uiCopy["ui"]["Team clients"]}</Tab>{can("billing") && <Tab id="billing">{uiCopy["ui"]["Billing"]}</Tab>}{can("settings") && <Tab id="settings">{uiCopy["profile"]["editor"]["settings"]}</Tab>}</TabList>
        <TabPanel id="overview"><div className={styles.stack}>
          <p className={styles.note}>{uiCopy["ui"]["Your individual tools remain available. Team access covers only authorized organizational cases; joining does not share your private clients."]}</p>
          {links.length > 0 && <ul className={styles.links}>{links.map((link) => { const Icon = link.icon; return <li key={link.href}><RouterLink to={link.href} className={styles.link} aria-label={link.title}>
            <span className={styles.linkIcon} aria-hidden="true"><Icon /></span>
            <span className={styles.grow}><span className={styles.strong}>{link.title}</span><span className={styles.muted}>{link.body}</span></span>
            <ArrowRight aria-hidden="true" className={styles.linkArrow} />
          </RouterLink></li>; })}</ul>}
          {(can("leave") || team.isOwner) && <div className={styles.zone}>
            <div className={styles.grow}><p className={styles.strong}>{uiCopy["ui"]["Leave this Team"]}</p><p className={styles.muted}>{team.isOwner ? uiCopy["ui"]["The owner must transfer ownership before leaving the Team."] : uiCopy["ui"]["Team clients stay with the organization; your private work stays with you."]}</p></div>
            {can("leave") && <Button variant="secondary" iconStart={<LogOut />} onPress={() => setLeaving(true)}>{uiCopy["ui"]["Leave Team"]}</Button>}
          </div>}
        </div></TabPanel>
        <TabPanel id="members">{roster.isPending ? <Loading /> : roster.isError ? <Failure error={roster.error} retry={() => void roster.refetch()} /> : <><Members team={team} members={roster.data} requests={requests} /><TeamPageControls label={uiCopy["ui"]["Team members"]} page={memberPage} count={roster.data.length} loading={roster.isFetching || mutation.isPending} onChange={setMemberPage} /></>}</TabPanel>
        <TabPanel id="clients"><TeamClients teamId={team.id} members={roster.data ?? []} active={can("clients")} /></TabPanel>
        {can("billing") && <TabPanel id="billing"><div className={styles.stack}><TeamBilling teamId={team.id} dissolutionAt={team.dissolutionAt} /><TeamLifecycle team={team} /></div></TabPanel>}
        {can("settings") && <TabPanel id="settings"><TeamSettings key={`${team.id}:${team.version}`} team={team} /></TabPanel>}
      </Tabs>
      <TeamMutationError error={mutation.error} />
    </div>
    <AlertDialog isOpen={leaving} onOpenChange={setLeaving} title={formatInterfaceText(uiCopy["ui"]["Leave {0}?"], [team.name])} tone="danger" confirmLabel={uiCopy["ui"]["Leave Team"]} cancelLabel={uiCopy["ui"]["Stay in Team"]} isConfirming={mutation.isPending} onConfirm={() => { mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/leave`, json: { version: team.version } }, { onSuccess: () => setLeaving(false) }); }}>
      <p>{uiCopy["ui"]["You will lose Team access and Team-paid benefits. Team clients stay with the organization for reassignment. Your private clients, programs and personal history remain unchanged."]}</p><TeamMutationError error={mutation.error} />
    </AlertDialog>
  </Card>;
}

function TeamLifecycle({ team }: { team: Team }) {
  const uiCopy = useUiCopy();

  const [dissolve, setDissolve] = useState(false);
  const mutation = useTeamMutation();
  const date = team.dissolutionAt ?? team.periodEnd;
  const immediate = !team.dissolutionAt && !!date && new Date(date).getTime() <= Date.now();
  const effective = date ? new Date(team.dissolutionAt ? date : Math.max(Date.now(), new Date(date).getTime())).toLocaleString(undefined, { timeZoneName: "long" }) : "No paid period end available";
  return <section className={styles.stack}>
    <h3 className={styles.sectionTitle}>{uiCopy["ui"]["Organization lifecycle"]}</h3><TeamMutationError error={mutation.error} />
    {team.dissolutionAt ? <Alert tone="warning" title={uiCopy["ui"]["Team dissolution scheduled"]} actions={<Button loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/cancel-dissolution`, json: { version: team.version, resumeRenewal: false } })}>{uiCopy["ui"]["Cancel scheduled dissolution"]}</Button>}><p>{uiCopy["ui"]["Effective"]} {effective}{uiCopy["ui"][". Automatic renewal is off."]}</p><p>{uiCopy["ui"]["Cancelling dissolution keeps automatic renewal off. Enable it separately in Team billing if you choose."]}</p></Alert> : team.allowedActions.includes("teams.dissolve") && <div className={styles.zone} data-tone="danger"><div className={styles.grow}><p className={styles.strong}>{uiCopy["ui"]["Dissolve the organization"]}</p><p className={styles.muted}>{uiCopy["ui"]["Dissolving ends the organization and its Team coaching cases at the paid period end. Cancelling renewal alone preserves the organization."]}</p></div><Button variant="danger" isDisabled={!date} onPress={() => setDissolve(true)}>{uiCopy["ui"]["Schedule Team dissolution"]}</Button></div>}
    <Dialog role="alertdialog" size="lg" placement="center" isOpen={dissolve} onOpenChange={setDissolve} title={formatInterfaceText(uiCopy["ui"]["Dissolve {0}?"], [team.name])} isDismissable={!mutation.isPending} footer={() => <><Button autoFocus isDisabled={mutation.isPending} onPress={() => setDissolve(false)}>{uiCopy["ui"]["Keep Team"]}</Button><Button variant="danger" loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/schedule-dissolution`, json: { version: team.version, confirmed: true } }, { onSuccess: () => setDissolve(false) })}>{uiCopy["ui"]["Confirm scheduled dissolution"]}</Button></>}>
      <p><strong>{uiCopy["ui"]["Effective"]} {effective}.</strong> {immediate ? uiCopy["ui"]["The paid period has ended, so dissolution takes effect immediately after confirmation."] : uiCopy["ui"]["The Team remains usable until then."]}  {uiCopy["ui"]["This action requires recent sign-in."]}</p>
      <ul><li>{uiCopy["ui"]["Automatic renewal will be disabled."]}</li><li>{uiCopy["ui"]["Membership and organization-wide permissions will end at that date."]}</li><li>{uiCopy["ui"]["All Team-owned coaching cases and relationships will end. Future Team assignments, events and check-ins will stop."]}</li><li>{uiCopy["ui"]["Every coach's private clients and personal resources stay unchanged."]}</li><li>{uiCopy["ui"]["Former Team clients are not automatically converted into private coaching relationships."]}</li><li>{uiCopy["ui"]["Team resources and history are retained or archived under the applicable retention and access policies."]}</li><li>{uiCopy["ui"]["Ordinary end-of-period cancellation gives no automatic partial refund, subject to applicable law and contractual obligations."]}</li><li>{uiCopy["ui"]["Outstanding dues, prepaid service obligations and external settlements are preserved; dissolution does not erase them. Review and resolve client obligations."]}</li></ul>
      {!immediate && <p>{uiCopy["ui"]["You can cancel the scheduled dissolution before this time. Doing so will not automatically resume billing."]}</p>}<TeamMutationError error={mutation.error} />
    </Dialog>
  </section>;
}

function Members({ team, members, requests }: { team: Team; members: Member[]; requests: Request[] }) {
  const uiCopy = useUiCopy();

  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Member");
  const [remove, setRemove] = useState<Member | null>(null);
  const [successor, setSuccessor] = useState("");
  const [transfer, setTransfer] = useState(false);
  const mutation = useTeamMutation();
  const can = (action: string) => team.allowedActions.includes(`teams.${action}`);
  const full = Number(team.occupiedSeats) >= Number(team.purchasedSeats);
  const { ask: askMember, dialog: confirmDialog } = useDangerConfirm();
  return <div className={styles.stack}>
    <TeamMutationError error={mutation.error} />
    {confirmDialog}
    {can("invite") && <form className={styles.inviteForm} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/invitations`, json: { username: username.trim().replace(/^@/, ""), role } }, { onSuccess: () => setUsername("") }); }}>
      <UserAutocomplete label={uiCopy["ui"]["Invite by username"]} isRequired value={username} onChange={setUsername} className={styles.grow} isDisabled={mutation.isPending || full} />
      <Select label={uiCopy["ui"]["Invitation role"]} selectedKey={role} onSelectionChange={(key) => setRole(String(key))} className={styles.roleSelect}><Option id="Member">{uiCopy["ui"]["Member"]}</Option>{team.isOwner && <Option id="Admin">{uiCopy["ui"]["Admin"]}</Option>}</Select>
      <Button type="submit" variant="primary" iconStart={<Mail />} isDisabled={mutation.isPending || full || !username.trim()}>{uiCopy["ui"]["Send invitation"]}</Button>
      {full && <p className={styles.formNote}>{uiCopy["ui"]["Add paid seats before inviting another coach."]}</p>}
    </form>}
    <DataTable label={uiCopy["ui"]["Team members"]} rows={members} rowKey={(member) => member.userId} columns={[
      { id: "name", header: "Member", cell: (member) => <span className={styles.person}><Avatar name={member.displayName || member.username || "Member"} size="sm" decorative /><span className={styles.personText}><span>{member.displayName || member.username}</span>{member.username && <span className={styles.muted}>@{member.username}</span>}</span></span> },
      { id: "role", header: "Role", width: "8rem", cell: (member) => <Badge size="sm" tone={member.role === "Owner" ? "accent" : member.role === "Admin" ? "info" : "neutral"}>{member.role}</Badge> },
      { id: "joined", header: "Joined", width: "9rem", muted: true, hideOnMobile: true, cell: (member) => new Date(member.joinedAt).toLocaleDateString() },
      { id: "actions", header: <span className="tf-visually-hidden">{uiCopy["editor"]["sheet"]["contextLabel"]}</span>, align: "end", cell: (member) => <div className={styles.rowActions}>
        {team.isOwner && can("manage") && member.role !== "Owner" && <Button size="sm" variant="ghost" isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "PATCH", path: `/api/v1/teams/${team.id}/members/${member.userId}/role`, json: { role: member.role === "Admin" ? "Member" : "Admin", version: team.version } })}>{member.role === "Admin" ? uiCopy["ui"]["Demote to Member"] : uiCopy["ui"]["Promote to Admin"]}</Button>}
        {can("manage") && member.role !== "Owner" && (team.isOwner || member.role === "Member") && <Button size="sm" variant="danger-ghost" onPress={() => setRemove(member)}>{uiCopy["editor"]["remove"]}</Button>}
      </div> },
    ]} />
    {can("manage") && requests.length > 0 && <section className={styles.stack}><h3 className={styles.sectionTitle}>{uiCopy["ui"]["Invitations"]}</h3><ul className={styles.requestList}>{requests.map((request) => <li key={request.id}><Avatar name={request.displayName || "Invited coach"} size="sm" decorative /><span className={styles.inline}>{request.displayName} <span className={styles.muted}>· {request.role}</span></span><Badge size="sm" tone={statusTone(request.status)}>{request.status}</Badge>{request.status === "Pending" && <Button size="sm" variant="danger-ghost" isDisabled={mutation.isPending} onPress={async () => { if (await askMember({ title: uiCopy["ui"]["Revoke this invitation?"], body: "The coach can no longer join with it. You can invite them again later.", confirmLabel: uiCopy["ui"]["Revoke invitation"], cancelLabel: uiCopy["ui"]["Keep invitation"] })) mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/invitations/${request.id}/revoke` }); }}>{uiCopy["ui"]["Revoke invitation"]}</Button>}</li>)}</ul></section>}
    {can("transfer-ownership") && <div className={styles.zone}>
      <div className={styles.grow}><p className={styles.strong}>{uiCopy["ui"]["Transfer ownership"]}</p><p className={styles.muted}>{team.pendingOwnerId ? uiCopy["ui"]["Ownership transfer is awaiting the selected member's acceptance."] : uiCopy["ui"]["The new owner takes over billing and owner-only actions."]}</p></div>
      <Select aria-label={uiCopy["ui"]["New owner"]} placeholder={uiCopy["ui"]["Select a Team member"]} selectedKey={successor || null} onSelectionChange={(key) => setSuccessor(key ? String(key) : "")} className={styles.ownerSelect}>{members.filter((member) => member.role !== "Owner").map((member) => <Option key={member.userId} id={member.userId}>{member.displayName || member.username}</Option>)}</Select>
      <Button isDisabled={!successor || mutation.isPending} onPress={() => setTransfer(true)}>{uiCopy["ui"]["Transfer ownership"]}</Button>
    </div>}
    <AlertDialog isOpen={transfer} onOpenChange={setTransfer} title={uiCopy["ui"]["Transfer Team ownership?"]} confirmLabel={uiCopy["ui"]["Request ownership transfer"]} cancelLabel={uiCopy["ui"]["Keep ownership"]} isConfirming={mutation.isPending} onConfirm={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${team.id}/ownership-transfer`, json: { recipientUserId: successor, version: team.version } }, { onSuccess: () => setTransfer(false) })}><p>{uiCopy["ui"]["The selected member must accept. They will become responsible for Team billing and owner-only actions. Your owner permissions will end when they accept. Recent sign-in is required."]}</p><TeamMutationError error={mutation.error} /></AlertDialog>
    <AlertDialog isOpen={!!remove} onOpenChange={(open) => { if (!open) setRemove(null); }} title={formatInterfaceText(uiCopy["ui"]["Remove {0}?"], [remove?.displayName || remove?.username || "member"])} tone="danger" confirmLabel={uiCopy["ui"]["Remove member"]} cancelLabel={uiCopy["ui"]["Keep member"]} isConfirming={mutation.isPending} onConfirm={() => { if (remove) mutation.mutate({ method: "DELETE", path: `/api/v1/teams/${team.id}/members/${remove.userId}`, query: { version: team.version } }, { onSuccess: () => setRemove(null) }); }}>
      <p>{uiCopy["ui"]["The coach loses Team access. Team clients stay with the organization and may need reassignment with appropriate consent. Private clients and personal data remain unchanged."]}</p><TeamMutationError error={mutation.error} />
    </AlertDialog>
  </div>;
}

function TeamSettings({ team }: { team: Team }) {
  const uiCopy = useUiCopy();

  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const mutation = useTeamMutation();
  return <form className={styles.settings} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "PATCH", path: `/api/v1/teams/${team.id}`, json: { name: name.trim(), description, version: team.version } }); }}>
    <TeamMutationError error={mutation.error} />
    <TextField label={uiCopy["ui"]["Organization name"]} placeholder={uiCopy["ui"]["e.g. Peak Performance Studio"]} isRequired maxLength={80} value={name} onChange={setName} />
    <TextArea label={uiCopy["training"]["library"]["createDialog"]["description"]} placeholder={uiCopy["ui"]["What your team does and who it coaches"]} description={uiCopy["ui"]["Shown to Team members."]} maxLength={2000} rows={3} value={description} onChange={setDescription} />
    <div><Button type="submit" variant="primary" loading={mutation.isPending}>{uiCopy["ui"]["Save Team settings"]}</Button></div>
  </form>;
}
