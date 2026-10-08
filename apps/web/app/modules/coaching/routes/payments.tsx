import { useState } from "react";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import {
    Alert,
    Button,
    DataTable,
    Dialog,
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
    return (
        <>
            <PageHeader
                title="My payments"
                description="Your orders, payment dues and saved simulated methods."
            />
            <div className={styles.stack}>
                <Alert title="Simulated payments">
                    Simulated payment — no real money charged. Confirm any
                    service payment without saving a method. Saved methods are
                    optional.
                </Alert>
                {!canPay.pending && !canPay.allowed && (
                    <Alert title="Payment actions are unavailable">
                        {reason(canPay)}
                    </Alert>
                )}
                <section className={styles.panel}>
                    <h2>Payment dues</h2>
                    <Select
                        aria-label="Payment status"
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
                    {dues.isPending ? (
                        <Loading />
                    ) : dues.isError ? (
                        <Failure
                            error={dues.error}
                            retry={() => void dues.refetch()}
                        />
                    ) : !dues.data.items.length ? (
                        <EmptyState
                            title="No payment dues"
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
                                            <>
                                                {new Date(
                                                    d.dueAt,
                                                ).toLocaleDateString()}
                                                {d.overdue && " · Overdue"}
                                            </>
                                        ),
                                    },
                                    {
                                        id: "amount",
                                        header: "Amount",
                                        cell: (d) =>
                                            money(d.amount, d.currency),
                                    },
                                    {
                                        id: "status",
                                        header: "Status",
                                        cell: (d) => (
                                            <StatusBadge status={d.status} />
                                        ),
                                    },
                                    {
                                        id: "action",
                                        header: "Payment",
                                        cell: (d) =>
                                            d.status === "AwaitingPayment" ? (
                                                d.settlementMode ===
                                                "External" ? (
                                                    "Arrange with your coach"
                                                ) : (
                                                    <LockedReason
                                                        access={canPay}
                                                    >
                                                        <Button
                                                            size="sm"
                                                            isDisabled={
                                                                !canPay.allowed
                                                            }
                                                            onPress={() =>
                                                                setSelected(d)
                                                            }
                                                        >
                                                            Pay
                                                        </Button>
                                                    </LockedReason>
                                                )
                                            ) : d.settledAt ? (
                                                new Date(
                                                    d.settledAt,
                                                ).toLocaleDateString()
                                            ) : (
                                                "No payment needed"
                                            ),
                                    },
                                    {
                                        id: "service",
                                        header: "Service",
                                        cell: (d) => (
                                            <Link
                                                to={`/app/services/${d.serviceId}`}
                                            >
                                                View service
                                            </Link>
                                        ),
                                    },
                                ]}
                            />
                            <ListPagination
                                data={dues.data}
                                onChange={(page) =>
                                    update({ page: String(page) })
                                }
                            />
                        </>
                    )}
                </section>
                <section className={styles.panel}>
                    <div className={styles.row}>
                        <h2>Payment methods</h2>
                        <LockedReason access={canPay}>
                            <Button
                                isDisabled={!canPay.allowed}
                                onPress={() => setAddMethod(true)}
                            >
                                Add simulated method
                            </Button>
                        </LockedReason>
                    </div>
                    <MutationError error={remove.error} />
                    {methods.isPending ? (
                        <Loading />
                    ) : methods.isError ? (
                        <Failure
                            error={methods.error}
                            retry={() => void methods.refetch()}
                        />
                    ) : !methods.data.length ? (
                        <p className={styles.muted}>
                            No saved methods. No card details are required.
                        </p>
                    ) : (
                        <ul className={styles.list}>
                            {methods.data
                                .filter((m) => m.active)
                                .map((m) => (
                                    <li className={styles.row} key={m.id}>
                                        <span>{m.label}</span>
                                        <LockedReason access={canPay}>
                                            <Button
                                                size="sm"
                                                isDisabled={
                                                    remove.isPending ||
                                                    !canPay.allowed
                                                }
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
                </section>
                <section className={styles.panel}>
                    <h2>Service automatic renewal</h2>
                    <p>
                        A saved method never enables automatic payment by
                        itself. Each service requires explicit consent.
                    </p>
                    {subscriptions.isPending ? (
                        <Loading />
                    ) : subscriptions.isError ? (
                        <Failure
                            error={subscriptions.error}
                            retry={() => void subscriptions.refetch()}
                        />
                    ) : !subscriptions.data.length ? (
                        <p>No recurring services.</p>
                    ) : (
                        subscriptions.data.map((item) => (
                            <ServiceRenewal
                                key={item.id}
                                subscription={item}
                                methods={methods.data ?? []}
                            />
                        ))
                    )}
                </section>
                <section className={styles.panel}>
                    <h2>Orders</h2>
                    {orders.isPending ? (
                        <Loading />
                    ) : orders.isError ? (
                        <Failure
                            error={orders.error}
                            retry={() => void orders.refetch()}
                        />
                    ) : !orders.data.items.length ? (
                        <p className={styles.muted}>No orders yet.</p>
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
                                        cell: (o) => (
                                            <Link
                                                to={`/app/services/${o.serviceId}`}
                                            >
                                                {o.name}
                                            </Link>
                                        ),
                                    },
                                    {
                                        id: "created",
                                        header: "Created",
                                        cell: (o) =>
                                            new Date(
                                                o.createdAt,
                                            ).toLocaleDateString(),
                                    },
                                    {
                                        id: "amount",
                                        header: "Agreed amount",
                                        cell: (o) =>
                                            money(o.amount, o.currency),
                                    },
                                    {
                                        id: "mode",
                                        header: "Settlement",
                                        cell: (o) => o.settlementMode,
                                    },
                                ]}
                            />
                            <ListPagination
                                data={orders.data}
                                onChange={(ordersPage) =>
                                    update({ ordersPage: String(ordersPage) })
                                }
                            />
                        </>
                    )}
                </section>
            </div>
            {canPay.allowed && addMethod && (
                <AddMethod close={() => setAddMethod(false)} />
            )}
            {canPay.allowed && selected && (
                <Pay
                    due={selected}
                    methods={methods.data?.filter((m) => m.active) ?? []}
                    close={() => setSelected(null)}
                />
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
        <div className={styles.stack}>
            <Link to={`/app/services/${subscription.serviceId}`}>
                View recurring service
            </Link>
            <p>
                Next period:{" "}
                {new Date(subscription.nextPeriodAt).toLocaleDateString()} ·
                Automatic renewal {subscription.autoRenew ? "enabled" : "off"}
            </p>
            {!subscription.autoRenew && (
                <select
                    aria-label="Renewal payment method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                >
                    <option value="">Select a saved simulated method</option>
                    {methods
                        .filter((item) => item.active)
                        .map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                </select>
            )}
            <MutationError error={mutation.error} />
            <Button
                isDisabled={
                    mutation.isPending || (!subscription.autoRenew && !method)
                }
                onPress={() =>
                    mutation.mutate({
                        method: "POST",
                        path: `/api/v1/me/service-subscriptions/${subscription.id}/renewal`,
                        json: {
                            autoRenew: !subscription.autoRenew,
                            paymentMethodId: subscription.autoRenew
                                ? null
                                : method,
                        },
                    })
                }
            >
                {subscription.autoRenew
                    ? "Disable automatic payment"
                    : "Enable automatic simulated payment"}
            </Button>
        </div>
    );
}
function AddMethod({ close }: { close: () => void }) {
    const [label, setLabel] = useState("Test payment method");
    const [outcome, setOutcome] = useState("Success");
    const mutation = useCoachingMutation(close);
    return (
        <Dialog
            isOpen
            onOpenChange={(open) => {
                if (!open && !mutation.isPending) close();
            }}
            title="Add simulated payment method"
        >
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
                <label className={styles.field}>
                    Test outcome
                    <select
                        value={outcome}
                        disabled={mutation.isPending}
                        onChange={(e) => setOutcome(e.target.value)}
                    >
                        <option value="Success">Payment succeeds</option>
                        <option value="Decline">Payment is declined</option>
                    </select>
                </label>
                <MutationError error={mutation.error} />
                <Button
                    type="submit"
                    variant="primary"
                    loading={mutation.isPending}
                >
                    Save method
                </Button>
            </form>
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
            title={`Pay ${money(due.amount, due.currency)}`}
        >
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
                {methods.length > 0 && (
                    <label className={styles.field}>
                        Payment method
                        <select
                            disabled={
                                mutation.isPending ||
                                Boolean(result && !declined)
                            }
                            value={method}
                            onChange={(e) => {
                                setMethod(e.target.value);
                                setKey(crypto.randomUUID());
                                mutation.reset();
                            }}
                        >
                            <option value="">
                                Confirm without a saved method
                            </option>
                            {methods.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <MutationError error={mutation.error} />
                {result && (
                    <Alert
                        tone={declined ? "warning" : "success"}
                        title={
                            declined ? "Payment declined" : "Payment recorded"
                        }
                    >
                        {declined
                            ? "Choose another method or start a new attempt."
                            : "The simulated payment is complete. No real money was charged."}
                    </Alert>
                )}
                {declined ? (
                    <Button
                        onPress={() => {
                            setKey(crypto.randomUUID());
                            mutation.reset();
                        }}
                    >
                        Start new attempt
                    </Button>
                ) : result ? (
                    <Button onPress={close}>Done</Button>
                ) : (
                    <Button
                        type="submit"
                        variant="primary"
                        loading={mutation.isPending}
                    >
                        Confirm payment
                    </Button>
                )}
            </form>
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
