import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Button, DataTable, Dialog, EmptyState, TextField } from "@trainflow/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery } from "./api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "./components";
import { money } from "./pricing";
import styles from "./coaching.module.css";

export function RelationshipBilling({ relationshipId }: { relationshipId: string }) {
  const [page, setPage] = useState(1);
  const access = useFeatureAccess("billing.manage");
  const query = useCoachingQuery<Schema<"RelationshipBillingDto">>(`/api/v1/coaching/relationships/${relationshipId}/billing`, { page, pageSize: 20 }, access.allowed);
  const [selected, setSelected] = useState<Schema<"PaymentDueDto"> | null>(null);
  if (!access.allowed) return null;
  return <section className={styles.panel}><h2>Billing history</h2>{query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.dues.items.length ? <EmptyState title="No payment dues" description="Payment dues are created when a service begins." /> : <>
    <DataTable label="Relationship payment dues" rows={query.data.dues.items} rowKey={(d) => d.id} columns={[
      { id: "date", header: "Due", cell: (d) => <>{new Date(d.dueAt).toLocaleDateString()}{d.overdue && <span> · Overdue</span>}</> },
      { id: "amount", header: "Amount", cell: (d) => money(d.amount, d.currency) },
      { id: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
      { id: "settle", header: "Settlement", cell: (d) => d.status === "AwaitingPayment" ? <Button size="sm" onPress={() => setSelected(d)}>Mark paid externally</Button> : d.settlementSource || "—" },
    ]} /><ListPagination data={query.data.dues} onChange={setPage} />
    {query.data.payments.length > 0 && <><h3>Payments</h3><DataTable label="Settled payments" rows={query.data.payments} rowKey={(p) => p.id} columns={[
      { id: "date", header: "Settled", cell: (p) => new Date(p.settledAt).toLocaleString() },
      { id: "gross", header: "Gross", cell: (p) => money(p.grossAmount, p.currency) },
      { id: "fee", header: "Fee", cell: (p) => money(p.feeAmount, p.currency) },
      { id: "net", header: "Coach net", cell: (p) => money(p.coachNetAmount, p.currency) },
      { id: "source", header: "Source", cell: (p) => `${p.mode} · ${p.source}` },
    ]} /></>}
    {query.data.attempts.length > 0 && <details><summary>Payment attempts</summary><ul className={styles.list}>{query.data.attempts.map((a) => <li key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.status}{a.failureCode && ` · ${a.failureCode}`}</li>)}</ul></details>}
  </>}{selected && <ExternalSettlement due={selected} close={() => setSelected(null)} />}</section>;
}
function ExternalSettlement({ due, close }: { due: Schema<"PaymentDueDto">; close: () => void }) {
  const [source, setSource] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useCoachingMutation(close);
  return <Dialog isOpen onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }} title="Confirm external payment"><form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/coaching/payment-dues/${due.id}/mark-paid-externally`, json: { source, idempotencyKey: key } }); }}><p>Record receipt of {money(due.amount, due.currency)} outside TrainFlow. This action creates a permanent settlement record.</p><TextField label="Payment source or reference" placeholder="e.g. Bank transfer 2026/10/03" isRequired maxLength={200} value={source} isDisabled={mutation.isPending} onChange={setSource} /><MutationError error={mutation.error} /><Button type="submit" variant="primary" loading={mutation.isPending}>Confirm received payment</Button></form></Dialog>;
}
