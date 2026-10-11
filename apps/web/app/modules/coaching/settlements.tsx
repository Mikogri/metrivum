import { Link } from "react-router";
import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Button, DataTable, Dialog, DialogFooter, TextField } from "@trainflow/ui-web";
import { Panel } from "~/shared/ui/Panel";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery } from "./api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "./components";
import { money } from "./pricing";
import styles from "./coaching.module.css";

export function RelationshipBilling({ relationshipId, filters = {}, page: controlledPage, onPageChange }: { relationshipId: string; filters?: Record<string, string | undefined>; page?: number; onPageChange?: (page: number) => void }) {
  const [localPage, setLocalPage] = useState(1);
  const page = controlledPage ?? localPage;
  const setPage = onPageChange ?? setLocalPage;
  const access = useFeatureAccess("billing.manage");
  const query = useCoachingQuery<Schema<"RelationshipBillingDto">>(`/api/v1/coaching/relationships/${relationshipId}/billing`, { page, pageSize: 20, ...filters }, access.allowed);
  const [selected, setSelected] = useState<Schema<"PaymentDueDto"> | null>(null);
  if (!access.allowed) return null;
  return <Panel title="Billing history" description="Payment dues and settlements for this collaboration." flush>{query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.dues.items.length ? <p className={styles.emptyText}>No payment dues yet. Dues are created when a service begins.</p> : <>
    <DataTable label="Relationship payment dues" rows={query.data.dues.items} rowKey={(d) => d.id} columns={[
      { id: "date", header: "Due", cell: (d) => <>{new Date(d.dueAt).toLocaleDateString()}{d.overdue && <span className={styles.lateNote}> · Overdue</span>}</> },
      { id: "amount", header: "Amount", cell: (d) => money(d.amount, d.currency) },
      { id: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
      { id: "service", header: "Service", cell: (d) => <Link to={`/app/services/${d.serviceId}`}>{query.data.orders.find(order => order.id === d.orderId)?.name || "View service"}</Link> },
      { id: "source", header: "Source", muted: true, hideOnMobile: true, cell: (d) => d.settlementMode },
      { id: "settle", header: "Settlement", align: "end", cell: (d) => d.status === "AwaitingPayment" ? <Button size="sm" variant="ghost" onPress={() => setSelected(d)}>Mark paid externally</Button> : <span className={styles.none}>{d.settlementSource || "—"}</span> },
    ]} />{Number(query.data.dues.total) > Number(query.data.dues.pageSize) ? <ListPagination data={query.data.dues} onChange={setPage} /> : null}
    {query.data.payments.length > 0 && <><h3 className={styles.subTitle}>Payments</h3><DataTable label="Settled payments" rows={query.data.payments} rowKey={(p) => p.id} columns={[
      { id: "date", header: "Settled", cell: (p) => new Date(p.settledAt).toLocaleString() },
      { id: "gross", header: "Gross", cell: (p) => money(p.grossAmount, p.currency) },
      { id: "fee", header: "Fee", cell: (p) => money(p.feeAmount, p.currency) },
      { id: "net", header: "Coach net", cell: (p) => money(p.coachNetAmount, p.currency) },
      { id: "source", header: "Source", cell: (p) => `${p.mode} · ${p.source}` },
    ]} /></>}
    {query.data.attempts.length > 0 && <details className={styles.attempts}><summary>Payment attempts ({query.data.attempts.length})</summary><ul className={styles.list}>{query.data.attempts.map((a) => <li key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.status}{a.failureCode && ` · ${a.failureCode}`}</li>)}</ul></details>}
  </>}{selected && <ExternalSettlement due={selected} close={() => setSelected(null)} />}</Panel>;
}
export function ExternalSettlement({ due, close }: { due: Schema<"PaymentDueDto">; close: () => void }) {
  const [source, setSource] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useCoachingMutation(close);
  return <Dialog isOpen onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }} title="Confirm external payment"><form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/coaching/payment-dues/${due.id}/mark-paid-externally`, json: { source, idempotencyKey: key } }); }}><p>Record receipt of {money(due.amount, due.currency)} outside TrainFlow. This action creates a permanent settlement record.</p><TextField label="Payment source or reference" placeholder="e.g. Bank transfer 2026/10/03" isRequired maxLength={200} value={source} isDisabled={mutation.isPending} onChange={setSource} /><MutationError error={mutation.error} /><DialogFooter><Button onPress={close} isDisabled={mutation.isPending}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!source.trim()}>Confirm received payment</Button></DialogFooter></form></Dialog>;
}
