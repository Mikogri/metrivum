import { useRef, useState } from "react";
import { Link } from "react-router";
import { Check, CreditCard, Repeat, Wallet } from "lucide-react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import type { Schema } from "@trainflow/api-client-web";
import {
    Alert,
    Badge,
    Button,
    DataTable,
    Dialog,
    DialogFooter,
    EmptyState,
    Option,
    PageHeader,
    Select,
    TextField,
} from "@trainflow/ui-web";
import {
    LockedReason,
    RequireFeature,
    useFeatureAccess,
    useFeatureReasonText,
} from "~/shared/access";
import { Panel, StatStrip, StatStripSkeleton } from "~/shared/ui/Panel";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import {
    Failure,
    ListPagination,
    Loading,
    MutationError,
    StatusBadge,
} from "../components";
import { money } from "../pricing";
import styles from "../coaching.module.css";
import pay from "./payments.module.css";

type Due = Schema<"PaymentDueDto">;
type Method = Schema<"PaymentMethodDto">;
interface ServiceSubscription {
    id: string;
    serviceId: string;
    autoRenew: boolean;
    paymentMethodId: string | null;
    nextPeriodAt: string;
    active: boolean;
}

const date = (value: string) => new Date(value).toLocaleDateString([], { dateStyle: "medium" });

/** Sums amounts per currency, so mixed currencies never add up into one number. */
function totals(dues: Due[]) {
    const sums = new Map<string, number>();
    for (const d of dues) sums.set(d.currency, (sums.get(d.currency) ?? 0) + Number(d.amount));
    return [...sums].map(([currency, amount]) => money(amount, currency)).join(" · ");
}

function Payments() {
    const canPay = useFeatureAccess("billing.pay-own");
    const reason = useFeatureReasonText();
    const [state, update] = useUrlState({
        page: "1",
        status: "",
        ordersPage: "1",
    });
    const dues = useCoachingQuery<Page<Due>>("/api/v1/me/payment-dues", {
        page: pageFromParam(state.page),
        pageSize: 20,
        status: state.status || undefined,
    });
    const open = useCoachingQuery<Page<Due>>("/api/v1/me/payment-dues", {
        page: 1,
        pageSize: 100,
        status: "AwaitingPayment",
    });
    const orders = useCoachingQuery<Page<Schema<"OrderDto">>>(
        "/api/v1/me/orders",
        { page: pageFromParam(state.ordersPage), pageSize: 20 },
    );
    const methods = useCoachingQuery<Method[]>("/api/v1/me/payment-methods");
    const subscriptions = useCoachingQuery<ServiceSubscription[]>(
        "/api/v1/me/service-subscriptions",
    );
    const [selected, setSelected] = useState<Due | null>(null);
    const [addMethod, setAddMethod] = useState(false);
    const remove = useCoachingMutation();
    const activeMethods = methods.data?.filter((m) => m.active) ?? [];
    const awaiting = open.data?.items ?? [];
    const overdue = awaiting.filter((d) => d.overdue);
    const renewing = subscriptions.data?.filter((s) => s.autoRenew).length ?? 0;
    return (
        <>
            <PageHeader
                title="My payments"
                description="What you owe, what you have paid and how future periods are paid."
                meta={<Badge size="sm">Simulated — no real money</Badge>}
            />
            <div className={styles.stack}>
                {!canPay.pending && !canPay.allowed && (
                    <Alert title="Payment actions are unavailable">
                        {reason(canPay)}
                    </Alert>
                )}
                {open.isPending ? (
                    <StatStripSkeleton labels={["To pay", "Overdue", "Saved methods", "Automatic renewal"]} />
                ) : (
                    <StatStrip
                        items={[
                            { label: "To pay", value: awaiting.length ? totals(awaiting) : "Nothing due", tone: awaiting.length ? "accent" : "default" },
                            { label: "Overdue", value: overdue.length ? `${overdue.length} · ${totals(overdue)}` : "None", tone: overdue.length ? "danger" : "default" },
                            { label: "Saved methods", value: methods.isPending ? "…" : activeMethods.length },
                            { label: "Automatic renewal", value: subscriptions.isPending ? "…" : `${renewing} of ${subscriptions.data?.length ?? 0} services` },
                        ]}
                    />
                )}
                <div className={pay.layout}>
                    <div className={styles.stack}>
                        <Panel
                            title="Payment dues"
                            description="Each service period you pay for."
                            flush
                            actions={
                                <Select
                                    aria-label="Payment status"
                                    className={pay.filter}
                                    selectedKey={state.status || "all"}
                                    onSelectionChange={(k) =>
                                        update({
                                            status: k === "all" ? "" : String(k),
                                            page: "1",
                                        })
                                    }
                                >
                                    <Option id="all">All statuses</Option>
                                    <Option id="AwaitingPayment">Awaiting payment</Option>
                                    <Option id="Paid">Paid</Option>
                                    <Option id="PaidExternally">Paid externally</Option>
                                    <Option id="Free">Free</Option>
                                </Select>
                            }
                        >
                            {dues.isPending ? (
                                <Loading />
                            ) : dues.isError ? (
                                <Failure error={dues.error} retry={() => void dues.refetch()} />
                            ) : !dues.data.items.length ? (
                                <EmptyState
                                    title={state.status ? "No dues with this status" : "No payment dues"}
                                    description="Your service payments will appear here."
                                />
                            ) : (
                                <>
                                    <DataTable
                                        label="Payment dues"
                                        rows={dues.data.items}
                                        rowKey={(d) => d.id}
                                        columns={[
                                            {
                                                id: "due",
                                                header: "Due date",
                                                cell: (d) => (
                                                    <span className={pay.due}>
                                                        <Link to={`/app/services/${d.serviceId}`}>{date(d.dueAt)}</Link>
                                                        {d.overdue ? <small className={styles.dangerText}>Overdue</small> : <small>Period {d.sequence}</small>}
                                                    </span>
                                                ),
                                            },
                                            {
                                                id: "amount",
                                                header: "Amount",
                                                cell: (d) => <strong>{money(Number(d.amount), d.currency)}</strong>,
                                            },
                                            {
                                                id: "status",
                                                header: "Status",
                                                cell: (d) => <StatusBadge status={d.status} />,
                                            },
                                            {
                                                id: "action",
                                                header: <span className="tf-visually-hidden">Payment</span>,
                                                align: "end",
                                                cell: (d) =>
                                                    d.status === "AwaitingPayment" ? (
                                                        d.settlementMode === "External" ? (
                                                            <span className={styles.note}>Arrange with your coach</span>
                                                        ) : (
                                                            <LockedReason access={canPay}>
                                                                <Button
                                                                    size="sm"
                                                                    variant="primary"
                                                                    isDisabled={!canPay.allowed}
                                                                    onPress={() => setSelected(d)}
                                                                >
                                                                    Pay
                                                                </Button>
                                                            </LockedReason>
                                                        )
                                                    ) : (
                                                        <span className={styles.note}>
                                                            {d.settledAt ? `Settled ${date(d.settledAt)}` : "No payment needed"}
                                                        </span>
                                                    ),
                                            },
                                        ]}
                                    />
                                    <ListPagination
                                        data={dues.data}
                                        onChange={(page) => update({ page: String(page) })}
                                    />
                                </>
                            )}
                        </Panel>
                        <Panel title="Orders" description="The terms you agreed to for each service." flush>
                            {orders.isPending ? (
                                <Loading />
                            ) : orders.isError ? (
                                <Failure error={orders.error} retry={() => void orders.refetch()} />
                            ) : !orders.data.items.length ? (
                                <p className={styles.emptyText}>No orders yet.</p>
                            ) : (
                                <>
                                    <DataTable
                                        label="Orders"
                                        rows={orders.data.items}
                                        rowKey={(o) => o.id}
                                        columns={[
                                            {
                                                id: "name",
                                                header: "Service",
                                                cell: (o) => <Link to={o.serviceId ? `/app/services/${o.serviceId}` : "/app/training-plans"}>{o.name}</Link>,
                                            },
                                            {
                                                id: "created",
                                                header: "Started",
                                                cell: (o) => date(o.createdAt),
                                            },
                                            {
                                                id: "mode",
                                                header: "Settlement",
                                                cell: (o) => (o.settlementMode === "External" ? "With your coach" : "In TrainFlow"),
                                            },
                                            {
                                                id: "amount",
                                                header: "Agreed amount",
                                                align: "end",
                                                cell: (o) => <strong>{money(Number(o.amount), o.currency)}</strong>,
                                            },
                                        ]}
                                    />
                                    <ListPagination
                                        data={orders.data}
                                        onChange={(ordersPage) => update({ ordersPage: String(ordersPage) })}
                                    />
                                </>
                            )}
                        </Panel>
                    </div>
                    <aside className={pay.aside} aria-label="Payment settings">
                        <Panel
                            title="Payment methods"
                            icon={<CreditCard />}
                            tone="blue"
                            actions={
                                <LockedReason access={canPay}>
                                    <Button size="sm" isDisabled={!canPay.allowed} onPress={() => setAddMethod(true)}>
                                        Add method
                                    </Button>
                                </LockedReason>
                            }
                        >
                            <MutationError error={remove.error} />
                            {methods.isPending ? (
                                <Loading />
                            ) : methods.isError ? (
                                <Failure error={methods.error} retry={() => void methods.refetch()} />
                            ) : !activeMethods.length ? (
                                <p className={styles.note}>
                                    No saved methods. You can confirm any payment without one — no card details are required.
                                </p>
                            ) : (
                                <ul className={pay.methods}>
                                    {activeMethods.map((m) => (
                                        <li className={pay.method} key={m.id}>
                                            <span className={pay.methodIcon} aria-hidden="true"><CreditCard /></span>
                                            <span className={pay.methodText}>
                                                <strong>{m.label}</strong>
                                                <small>Simulated · added {date(m.createdAt)}</small>
                                            </span>
                                            <LockedReason access={canPay}>
                                                <Button
                                                    size="sm"
                                                    variant="danger-ghost"
                                                    isDisabled={remove.isPending || !canPay.allowed}
                                                    onPress={() =>
                                                        remove.mutate({
                                                            method: "DELETE",
                                                            path: `/api/v1/me/payment-methods/${m.id}`,
                                                        })
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </LockedReason>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                        <Panel
                            title="Automatic renewal"
                            icon={<Repeat />}
                            tone="green"
                            description="A saved method never pays by itself. Each service needs your consent."
                        >
                            {subscriptions.isPending ? (
                                <Loading />
                            ) : subscriptions.isError ? (
                                <Failure error={subscriptions.error} retry={() => void subscriptions.refetch()} />
                            ) : !subscriptions.data.length ? (
                                <p className={styles.note}>No recurring services.</p>
                            ) : (
                                <ul className={pay.renewals}>
                                    {subscriptions.data.map((item) => (
                                        <ServiceRenewal key={item.id} subscription={item} methods={activeMethods} />
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    </aside>
                </div>
            </div>
            {canPay.allowed && addMethod && (
                <AddMethod close={() => setAddMethod(false)} />
            )}
            {canPay.allowed && selected && (
                <Pay due={selected} methods={activeMethods} close={() => setSelected(null)} />
            )}
        </>
    );
}

function ServiceRenewal({
    subscription,
    methods,
}: {
    subscription: ServiceSubscription;
    methods: Method[];
}) {
    const [method, setMethod] = useState(subscription.paymentMethodId ?? "");
    const mutation = useCoachingMutation();
    return (
        <li className={pay.renewal}>
            <div className={pay.renewalHead}>
                <span className={pay.methodText}>
                    <Link to={`/app/services/${subscription.serviceId}`}>Recurring service</Link>
                    <small>Next period {date(subscription.nextPeriodAt)}</small>
                </span>
                <Badge size="sm" tone={subscription.autoRenew ? "success" : "neutral"}>
                    {subscription.autoRenew ? "Automatic" : "Manual"}
                </Badge>
            </div>
            {!subscription.autoRenew && (
                <Select
                    aria-label="Renewal payment method"
                    placeholder={methods.length ? "Choose a saved method" : "Add a method first"}
                    isDisabled={!methods.length || mutation.isPending}
                    selectedKey={method || null}
                    onSelectionChange={(key) => setMethod(String(key))}
                >
                    {methods.map((item) => (
                        <Option key={item.id} id={item.id}>{item.label}</Option>
                    ))}
                </Select>
            )}
            <MutationError error={mutation.error} />
            <Button
                size="sm"
                variant={subscription.autoRenew ? "secondary" : "primary"}
                loading={mutation.isPending}
                isDisabled={!subscription.autoRenew && !method}
                onPress={() =>
                    mutation.mutate({
                        method: "POST",
                        path: `/api/v1/me/service-subscriptions/${subscription.id}/renewal`,
                        json: {
                            autoRenew: !subscription.autoRenew,
                            paymentMethodId: subscription.autoRenew ? null : method,
                        },
                    })
                }
            >
                {subscription.autoRenew ? "Turn off automatic payment" : "Pay automatically"}
            </Button>
        </li>
    );
}

function AddMethod({ close }: { close: () => void }) {
    const [label, setLabel] = useState("Test payment method");
    const [outcome, setOutcome] = useState("Success");
    // Closing through the dialog lets it play its exit animation before the parent unmounts it.
    const dismiss = useRef(close);
    const mutation = useCoachingMutation(() => dismiss.current());
    return (
        <Dialog
            isOpen
            onOpenChange={(open) => {
                if (!open && !mutation.isPending) close();
            }}
            isDismissable={!mutation.isPending}
            title="Add simulated payment method"
            description="Simulated methods never charge real money."
        >
            {(closeDialog) => {
                dismiss.current = closeDialog;
                return (
                    <form
                        className={styles.form}
                        onSubmit={(e) => {
                            e.preventDefault();
                            mutation.mutate({
                                method: "POST",
                                path: "/api/v1/me/payment-methods/simulated-card",
                                json: { label, outcome },
                            });
                        }}
                    >
                        <TextField
                            label="Label"
                            placeholder="e.g. Personal card"
                            isRequired
                            value={label}
                            onChange={setLabel}
                            isDisabled={mutation.isPending}
                            maxLength={80}
                        />
                        <Select
                            label="Test outcome"
                            selectedKey={outcome}
                            isDisabled={mutation.isPending}
                            onSelectionChange={(key) => setOutcome(String(key))}
                        >
                            <Option id="Success">Payment succeeds</Option>
                            <Option id="Decline">Payment is declined</Option>
                        </Select>
                        <MutationError error={mutation.error} />
                        <DialogFooter>
                            <Button isDisabled={mutation.isPending} onPress={closeDialog}>Cancel</Button>
                            <Button type="submit" variant="primary" loading={mutation.isPending}>
                                Save method
                            </Button>
                        </DialogFooter>
                    </form>
                );
            }}
        </Dialog>
    );
}

function Pay({
    due,
    methods,
    close,
}: {
    due: Due;
    methods: Method[];
    close: () => void;
}) {
    const [method, setMethod] = useState("");
    const [key, setKey] = useState(() => crypto.randomUUID());
    const mutation = useCoachingMutation<Schema<"PaymentResultDto">>();
    const result = mutation.data;
    const declined = result?.attempt?.status === "Failed";
    return (
        <Dialog
            isOpen
            onOpenChange={(open) => {
                if (!open && !mutation.isPending) close();
            }}
            isDismissable={!mutation.isPending}
            title={`Pay ${money(Number(due.amount), due.currency)}`}
            description={`Due ${date(due.dueAt)} · simulated payment, no real money is charged.`}
        >
            {(closeDialog) => (
                <form
                    className={styles.form}
                    onSubmit={(e) => {
                        e.preventDefault();
                        mutation.mutate({
                            method: "POST",
                            path: `/api/v1/me/payment-dues/${due.id}/pay`,
                            json: {
                                paymentMethodId: method || null,
                                idempotencyKey: key,
                            },
                        });
                    }}
                >
                    <div className={pay.summary}>
                        <span className={pay.summaryLabel}>Amount due</span>
                        <strong className={pay.summaryAmount}>{money(Number(due.amount), due.currency)}</strong>
                        <span className={pay.summaryMeta}>
                            Period {due.sequence} · due {date(due.dueAt)}
                            {due.overdue ? <Badge size="sm" tone="warning">Overdue</Badge> : null}
                        </span>
                    </div>
                    <RadioGroup
                        className={pay.choices}
                        value={method || "none"}
                        isDisabled={mutation.isPending || Boolean(result && !declined)}
                        onChange={(value) => {
                            setMethod(value === "none" ? "" : value);
                            setKey(crypto.randomUUID());
                            mutation.reset();
                        }}
                    >
                        <Label className={pay.choicesLabel}>Pay with</Label>
                        {[{ id: "none", label: "Confirm without a saved method", hint: "One-off simulated payment", icon: <Wallet /> }, ...methods.map((m) => ({ id: m.id, label: m.label, hint: "Saved simulated method", icon: <CreditCard /> }))].map((option) => (
                            <Radio key={option.id} value={option.id} className={pay.choice}>
                                <span className={pay.choiceIcon} aria-hidden="true">{option.icon}</span>
                                <span className={pay.methodText}><strong>{option.label}</strong><small>{option.hint}</small></span>
                                <span className={pay.choiceMark} aria-hidden="true"><Check /></span>
                            </Radio>
                        ))}
                    </RadioGroup>
                    <MutationError error={mutation.error} />
                    {result && (
                        <Alert
                            tone={declined ? "warning" : "success"}
                            title={declined ? "Payment declined" : "Payment recorded"}
                        >
                            {declined
                                ? "Choose another method or start a new attempt."
                                : "The simulated payment is complete. No real money was charged."}
                        </Alert>
                    )}
                    <DialogFooter>
                        {declined ? (
                            <Button
                                variant="primary"
                                onPress={() => {
                                    setKey(crypto.randomUUID());
                                    mutation.reset();
                                }}
                            >
                                Start new attempt
                            </Button>
                        ) : result ? (
                            <Button variant="primary" onPress={closeDialog}>Done</Button>
                        ) : (
                            <>
                                <Button isDisabled={mutation.isPending} onPress={closeDialog}>Cancel</Button>
                                <Button type="submit" variant="primary" loading={mutation.isPending}>
                                    Confirm payment
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </form>
            )}
        </Dialog>
    );
}

export default function PaymentsRoute() {
    return (
        <RequireFeature feature="billing.read-own">
            <Payments />
        </RequireFeature>
    );
}
