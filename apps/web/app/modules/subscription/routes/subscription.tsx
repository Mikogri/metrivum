import { Offers } from "../SubscriptionPanel";
import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { TeamBilling } from "../team-billing";
import {
    Alert,
    Button,
    DataTable,
    PageHeader,
} from "@trainflow/ui-web";
import {
    useCoachingMutation,
    useCoachingQuery,
    Failure,
    Loading,
    MutationError,
    money,
} from "~/modules/coaching";
import styles from "./subscription.module.css";

type Plan = Schema<"PlatformPlanDto">;
type Subscription = Schema<"PlatformSubscriptionDto">;
type History = Schema<"PlatformHistoryDto">;
type Method = Schema<"PaymentMethodDto">;
const date = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString() : "—";

export default function SubscriptionRoute() {
    const plans = useCoachingQuery<Plan[]>("/api/v1/subscriptions/plans");
    const current = useCoachingQuery<Subscription>(
        "/api/v1/me/platform-subscription",
    );
    const history = useCoachingQuery<History>(
        "/api/v1/me/platform-subscription/history",
    );
    const methods = useCoachingQuery<Method[]>("/api/v1/me/payment-methods");
    const teams = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
    const [method, setMethod] = useState("");
    const [key, setKey] = useState(() => crypto.randomUUID());
    const mutation = useCoachingMutation<Subscription>();
    const addMethod = useCoachingMutation<Method>((created) =>
        setMethod(created.id),
    );
    const [notice, setNotice] = useState<string | null>(null);
    const update = (path: string, json: object, success: string) => {
        setNotice(null);
        mutation.mutate(
            {
                method: "POST",
                path: `/api/v1/me/platform-subscription/${path}`,
                json,
            },
            {
                onSuccess: (result) => {
                    setNotice(
                        path === "confirm-payment" && result.planId === "Free"
                            ? "Payment was not completed. Review the status and retry."
                            : success,
                    );
                    if (path === "confirm-payment") setKey(crypto.randomUUID());
                },
            },
        );
    };
    if (plans.isPending || current.isPending) return <Loading />;
    if (plans.isError || current.isError)
        return (
            <Failure
                error={plans.error ?? current.error}
                retry={() => {
                    void plans.refetch();
                    void current.refetch();
                }}
            />
        );
    const subscription = current.data;
    const due = subscription.pendingDue;
    return (
        <>
            <PageHeader
                title="Subscription"
                description="Your TrainFlow platform plan. Client service purchases are managed separately in My payments."
            />
            <div className={styles.stack}>
                <Offers />
                {teams.data?.teams.map(team => <section key={team.id} className={styles.panel}>
                    <h2>Team access: {team.name}</h2>
                    <p>{team.role} · {team.status} · {team.occupiedSeats} occupied / {team.purchasedSeats} paid seats · Paid through {date(team.periodEnd)}</p>
                    <p>Your personal subscription and Team membership are managed separately. Team members keep individual Pro-level tools while their Team entitlement is active.</p>
                    {team.allowedActions.includes("teams.billing") && <TeamBilling teamId={team.id} dissolutionAt={team.dissolutionAt} />}
                </section>)}
                <Alert title="Simulated payment — no real money charged">
                    Payment confirmations persist a simulated settlement. No
                    card details are required. Team organization management is
                    available through a paid Team subscription.
                </Alert>
                <MutationError error={mutation.error ?? addMethod.error} />
                {notice && <Alert title="Subscription updated">{notice}</Alert>}
                <section className={styles.panel}>
                    <h2>Current plan: {subscription.planId}</h2>
                    <p>
                        Status: {subscription.status} · Paid through:{" "}
                        {subscription.planId !== "Free"
                            ? date(subscription.periodEnd)
                            : "No paid entitlement"}
                    </p>
                    <p>
                        Period: {date(subscription.periodStart)} –{" "}
                        {date(subscription.periodEnd)} · Next due:{" "}
                        {date(subscription.nextDueAt)}
                    </p>
                    <p>
                        Automatic renewal:{" "}
                        {subscription.autoRenew
                            ? "Enabled with a selected simulated method"
                            : "Off — payment requires confirmation"}
                    </p>
                    {subscription.autoRenew &&
                        !subscription.renewalMethodEligible && (
                            <Alert
                                tone="warning"
                                title="Renewal method unavailable"
                            >
                                Your saved simulated method is inactive. The
                                next payment will wait for manual confirmation.
                            </Alert>
                        )}
                    {subscription.pendingPlanId && (
                        <p>
                            Scheduled change: {subscription.pendingPlanId} at{" "}
                            {date(subscription.periodEnd)}. Your paid period
                            continues until then.
                        </p>
                    )}
                    {subscription.planId !== "Free" &&
                        !subscription.pendingPlanId && (
                            <div className={styles.row}>
                                <Button
                                    isDisabled={mutation.isPending}
                                    onPress={() =>
                                        update(
                                            "change-plan",
                                            {
                                                planId: "Free",
                                                version: subscription.version,
                                            },
                                            "Free is scheduled for the end of your paid period. Renewal is off.",
                                        )
                                    }
                                >
                                    Switch to Free at period end
                                </Button>
                                <Button
                                    isDisabled={mutation.isPending}
                                    onPress={() =>
                                        update(
                                            "cancel-renewal",
                                            { version: subscription.version },
                                            "Renewal is cancelled. Your paid period continues until expiry.",
                                        )
                                    }
                                >
                                    Cancel renewal
                                </Button>
                            </div>
                        )}
                    {subscription.planId !== "Free" &&
                        !subscription.autoRenew && (
                            <div className={styles.row}>
                                <select
                                    aria-label="Automatic renewal method"
                                    value={method}
                                    onChange={(event) =>
                                        setMethod(event.target.value)
                                    }
                                >
                                    <option value="">
                                        Select a simulated method
                                    </option>
                                    {methods.data?.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    isDisabled={!method || mutation.isPending}
                                    onPress={() =>
                                        update(
                                            "renewal",
                                            {
                                                version: subscription.version,
                                                autoRenew: true,
                                                paymentMethodId: method,
                                            },
                                            "Automatic simulated renewal enabled.",
                                        )
                                    }
                                >
                                    Enable automatic renewal
                                </Button>
                            </div>
                        )}
                    <Button
                        size="sm"
                        loading={addMethod.isPending}
                        onPress={() =>
                            addMethod.mutate({
                                method: "POST",
                                path: "/api/v1/me/payment-methods/simulated-card",
                                json: {
                                    label: "Platform renewal simulator",
                                    outcome: "Success",
                                },
                            })
                        }
                    >
                        Save optional simulated method
                    </Button>
                </section>
                <section className={styles.panel}>
                    <h2>Plans</h2>
                    <DataTable
                        label="Platform plan comparison"
                        rows={plans.data}
                        rowKey={(plan) => plan.id}
                        columns={[
                            {
                                id: "plan",
                                header: "Plan",
                                cell: (plan) => plan.name,
                            },
                            {
                                id: "price",
                                header: "Price",
                                cell: (plan) =>
                                    plan.priceConfigured && plan.amount != null
                                        ? `${money(plan.amount, plan.currency)}${plan.id === "Pro" ? " / month" : ""}`
                                        : "Price not configured",
                            },
                            {
                                id: "commission",
                                header: "Service commission",
                                cell: (plan) =>
                                    `${plan.commissionRate * 100}% (explicit coach policy may override)`,
                            },
                            {
                                id: "features",
                                header: "Product features",
                                cell: (plan) => plan.id === "Team" ? "Individual tools plus Team roles, seats, clients and analytics" : "Individual tools; Team management requires Team",
                            },
                        ]}
                    />
                    <p className={styles.muted}>
                        There is currently no plan-specific active client limit.
                        Resource ownership and account role permissions still
                        apply.
                    </p>
                    <details>
                        <summary>Individual capabilities</summary>
                        <ul>
                            {plans.data[0]?.capabilities.map((capability) => (
                                <li key={capability}>{capability}</li>
                            ))}
                        </ul>
                    </details>
                </section>
                {due && (
                    <section className={styles.panel}>
                        <h2>Outstanding platform payment</h2>
                        <p>
                            {money(due.amount, due.currency)} · Due{" "}
                            {date(due.dueAt)} · {due.status}
                        </p>
                        <p>
                            Accepted price version:{" "}
                            {subscription.acceptedPriceVersion} · Terms:{" "}
                            {subscription.acceptedTermsVersion}
                        </p>
                        <p>
                            Confirm payment to activate your selected plan through{" "}
                            {date(due.periodEnd)}. Simulated payment — no real
                            money charged.
                        </p>
                        <div className={styles.row}>
                            <Button
                                variant="primary"
                                loading={mutation.isPending}
                                isDisabled={mutation.isPending}
                                onPress={() =>
                                    update(
                                        "confirm-payment",
                                        {
                                            dueId: due.id,
                                            idempotencyKey: key,
                                            paymentMethodId: null,
                                        },
                                        "Payment recorded. Your plan is active.",
                                    )
                                }
                            >
                                Confirm payment
                            </Button>
                            <Button
                                isDisabled={mutation.isPending}
                                onPress={() =>
                                    update(
                                        "change-plan",
                                        {
                                            planId: "Free",
                                            version: subscription.version,
                                        },
                                        "Checkout cancelled. Free remains active.",
                                    )
                                }
                            >
                                Cancel checkout
                            </Button>
                        </div>
                    </section>
                )}
                <section className={styles.panel}>
                    <h2>Payment and plan history</h2>
                    {history.isPending ? (
                        <Loading />
                    ) : history.isError ? (
                        <Failure
                            error={history.error}
                            retry={() => void history.refetch()}
                        />
                    ) : (
                        <>
                            {history.data.payments.length === 0 ? (
                                <p>No platform payments yet.</p>
                            ) : (
                                <DataTable
                                    label="Platform payment history"
                                    rows={history.data.payments}
                                    rowKey={(payment) => payment.id}
                                    columns={[
                                        {
                                            id: "date",
                                            header: "Settled",
                                            cell: (payment) =>
                                                date(payment.settledAt),
                                        },
                                        {
                                            id: "amount",
                                            header: "Amount",
                                            cell: (payment) =>
                                                money(
                                                    payment.grossAmount,
                                                    payment.currency,
                                                ),
                                        },
                                        {
                                            id: "source",
                                            header: "Provider",
                                            cell: (payment) =>
                                                `${payment.source} — no real money charged`,
                                        },
                                    ]}
                                />
                            )}
                            <ul className={styles.list}>
                                {history.data.changes.map((change) => (
                                    <li key={change.id}>
                                        {date(change.createdAt)} · {change.type}{" "}
                                        · {change.planId}
                                        {change.effectiveAt &&
                                            ` · effective ${date(change.effectiveAt)}`}
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.muted}>
                                Showing up to the latest 100 payment and plan
                                records.
                            </p>
                        </>
                    )}
                </section>
            </div>
        </>
    );
}
