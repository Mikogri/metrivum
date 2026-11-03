import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { usePaymentActionId } from "~/shared/session/payment-action";
import { Link } from "react-router";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Button, DataTable, Dialog, DialogFooter, TextField } from "@metrivum/ui-web";
import { Panel } from "~/shared/ui/Panel";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery } from "./api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "./components";
import { money } from "./pricing";
import styles from "./coaching.module.css";

export function RelationshipBilling({ relationshipId, filters = {}, page: controlledPage, onPageChange, bare = false }: { relationshipId: string; filters?: Record<string, string | undefined>; page?: number; onPageChange?: (page: number) => void; /** Without its own panel: sections with headings, for a dialog that is already the frame. */ bare?: boolean }) {
  const uiCopy = useUiCopy();

  const [localPage, setLocalPage] = useState(1);
  const page = controlledPage ?? localPage;
  const setPage = onPageChange ?? setLocalPage;
  const access = useFeatureAccess("billing.manage");
  const query = useCoachingQuery<Schema<"RelationshipBillingDto">>(`/api/v1/coaching/relationships/${relationshipId}/billing`, { page, pageSize: 20, ...filters }, access.allowed);
  const [selected, setSelected] = useState<Schema<"PaymentDueDto"> | null>(null);
  if (!access.allowed) return null;
  const body = query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.dues.items.length ? <p className={styles.emptyText}>{uiCopy["ui"]["No payment dues yet. Dues are created when a service begins."]}</p> : <>
    <section className={styles.billingSection} aria-labelledby={`dues-${relationshipId}`}>
      {bare ? <h3 id={`dues-${relationshipId}`} className={styles.billingTitle}>{uiCopy["ui"]["Dues"]}</h3> : null}
      <DataTable label={uiCopy["ui"]["Relationship payment dues"]} rows={query.data.dues.items} rowKey={(d) => d.id} columns={[
        { id: "date", header: "Due", width: "10.5rem", cell: (d) => <>{new Date(d.dueAt).toLocaleDateString()}{d.overdue && <span className={styles.lateNote}>  {uiCopy["ui"]["· Overdue"]}</span>}</> },
        { id: "amount", header: "Amount", width: "7rem", cell: (d) => money(d.amount, d.currency) },
        { id: "status", header: "Status", width: "9.5rem", cell: (d) => <StatusBadge status={d.status} /> },
        { id: "service", header: "Service", cell: (d) => <Link to={`/app/services/${d.serviceId}`}>{query.data.orders.find(order => order.id === d.orderId)?.name || uiCopy["ui"]["View service"]}</Link> },
        { id: "source", header: "Source", width: "6rem", muted: true, hideOnMobile: true, cell: (d) => d.settlementMode },
        { id: "settle", header: "Settlement", width: "7.5rem", align: "end", cell: (d) => d.status === "AwaitingPayment" ? <Button size="sm" variant="ghost" onPress={() => setSelected(d)}>{uiCopy["ui"]["Mark paid"]}</Button> : <span className={styles.none}>{d.settlementSource || "—"}</span> },
      ]} />
      {Number(query.data.dues.total) > Number(query.data.dues.pageSize) ? <ListPagination data={query.data.dues} onChange={setPage} /> : null}
    </section>
    {query.data.payments.length > 0 && <section className={styles.billingSection} aria-labelledby={`payments-${relationshipId}`}>
      <h3 id={`payments-${relationshipId}`} className={bare ? styles.billingTitle : styles.subTitle}>{uiCopy["ui"]["Payments"]}</h3>
      <DataTable label={uiCopy["ui"]["Settled payments"]} rows={query.data.payments} rowKey={(p) => p.id} columns={[
        { id: "date", header: "Settled", width: "8.5rem", cell: (p) => new Date(p.settledAt).toLocaleDateString() },
        { id: "gross", header: "Gross", width: "7rem", cell: (p) => money(p.grossAmount, p.currency) },
        { id: "fee", header: "Fee", width: "7rem", muted: true, cell: (p) => money(p.feeAmount, p.currency) },
        { id: "net", header: "Coach net", width: "7rem", cell: (p) => money(p.coachNetAmount, p.currency) },
        { id: "source", header: "Source", muted: true, cell: (p) => `${p.mode} · ${p.source}` },
      ]} />
    </section>}
    {query.data.attempts.length > 0 && <details className={styles.attempts}><summary>{uiCopy["ui"]["Payment attempts ("]}{query.data.attempts.length})</summary><ul className={styles.attemptList}>{query.data.attempts.map((a) => <li key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.status}{a.failureCode && ` · ${a.failureCode}`}</li>)}</ul></details>}
  </>;
  const dialog = selected && <ExternalSettlement due={selected} close={() => setSelected(null)} />;
  if (bare) return <div className={styles.billingBare}>{body}{dialog}</div>;
  return <Panel title={uiCopy["ui"]["Billing history"]} description={uiCopy["ui"]["Payment dues and settlements for this collaboration."]} flush>{body}{dialog}</Panel>;
}
export function ExternalSettlement({ due, close }: { due: Schema<"PaymentDueDto">; close: () => void }) {
  const uiCopy = useUiCopy();

  const [source, setSource] = useState("");
  const [key] = usePaymentActionId(`external:${due.id}`);
  const mutation = useCoachingMutation(close);
  return <Dialog isOpen onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }} title={uiCopy["ui"]["Confirm external payment"]}><form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/coaching/payment-dues/${due.id}/mark-paid-externally`, json: { source, idempotencyKey: key } }); }}><p>{uiCopy["ui"]["Record receipt of"]} {money(due.amount, due.currency)}  {uiCopy["ui"]["outside Metrivum. This action creates a permanent settlement record."]}</p><TextField label={uiCopy["ui"]["Payment source or reference"]} placeholder={uiCopy["ui"]["e.g. Bank transfer 2026/10/03"]} isRequired maxLength={200} value={source} isDisabled={mutation.isPending} onChange={setSource} /><MutationError error={mutation.error} /><DialogFooter><Button onPress={close} isDisabled={mutation.isPending}>{uiCopy["common"]["cancel"]}</Button><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!source.trim()}>{uiCopy["ui"]["Confirm received payment"]}</Button></DialogFooter></form></Dialog>;
}
