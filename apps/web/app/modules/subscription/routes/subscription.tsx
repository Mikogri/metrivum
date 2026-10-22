import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Subscription — TrainFlow");

import { Offers } from "../SubscriptionPanel";
import { useState } from "react";
import { CreditCard, MoreHorizontal, Plus } from "lucide-react";
import type { Schema } from "@trainflow/api-client-web";
import { TeamBilling } from "../team-billing";
import {
    Alert,
    Badge,
    Button,
    DataTable,
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuTrigger,
    IconButton,
    Option,
    PageHeader,
    Select,
} from "@trainflow/ui-web";
import {
    useCoachingMutation,
    useCoachingQuery,
    Failure,
    Loading,
    MutationError,
    money,
} from "~/modules/coaching";
import { Facts, Panel, PanelGrid } from "~/shared/ui/Panel";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
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
    const { ask, dialog: confirmDialog } = useDangerConfirm();
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
    const paid = subscription.planId !== "Free";
    const planActions = paid && !subscription.pendingPlanId;

    return (
        <>
            <PageHeader
                title="Subscription"
                description="Your TrainFlow platform plan. Client service purchases are managed separately in My payments."
                meta={
                    <>
                        <Badge tone={paid ? "success" : "neutral"} dot>{subscription.planId}</Badge>
                        <span>{paid ? `Paid through ${date(subscription.periodEnd)}` : "No paid entitlement"}</span>
                    </>
                }
            />
            <div className={styles.stack}>
                {confirmDialog}
                <MutationError error={mutation.error ?? addMethod.error} />
                {notice && <Alert tone="success" title="Subscription updated">{notice}</Alert>}
                {due && (
                    <Panel
                        title="Outstanding platform payment"
                        description="Simulated payment — no real money is charged."
                        actions={
                            <>
                                <Button
                                    variant="danger-ghost"
                                    isDisabled={mutation.isPending}
                                    onPress={async () => {
                                        if (await ask({ title: "Cancel this checkout?", body: "The pending payment is dropped and Free remains active.", confirmLabel: "Cancel checkout", cancelLabel: "Keep checkout" }))
                                            update(
                                                "change-plan",
                                                { planId: "Free", version: subscription.version },
                                                "Checkout cancelled. Free remains active.",
                                            );
                                    }}
                                >
                                    Cancel checkout
                                </Button>
                                <Button
                                    variant="primary"
                                    loading={mutation.isPending}
                                    isDisabled={mutation.isPending}
                                    onPress={() =>
                                        update(
                                            "confirm-payment",
                                            { dueId: due.id, idempotencyKey: key, paymentMethodId: null },
                                            "Payment recorded. Your plan is active.",
                                        )
                                    }
                                >
                                    Confirm payment
                                </Button>
                            </>
                        }
                    >
                        <Facts
                            columns={2}
                            items={[
                                { label: "Amount", value: money(due.amount, due.currency) },
                                { label: "Due", value: date(due.dueAt) },
                                { label: "Status", value: due.status },
                                { label: "Activates through", value: date(due.periodEnd) },
                                { label: "Price version", value: subscription.acceptedPriceVersion },
                                { label: "Terms", value: subscription.acceptedTermsVersion },
                            ]}
                        />
                    </Panel>
                )}
                <Offers embedded />
                <PanelGrid>
                    <Panel
                        title="Current plan"
                        actions={
                            planActions ? (
                                <DropdownMenuTrigger>
                                    <IconButton label="Plan actions" icon={<MoreHorizontal />} variant="ghost" size="sm" isDisabled={mutation.isPending} />
                                    <DropdownMenu
                                        aria-label="Plan actions"
                                        onAction={async (id) =>
                                            id === "cancel" && !(await ask({ title: "Cancel automatic renewal?", body: "Your paid period continues until it ends; after that the plan will not renew.", confirmLabel: "Cancel renewal", cancelLabel: "Keep renewal" }))
                                                ? undefined
                                                : id === "free"
                                                ? update(
                                                      "change-plan",
                                                      { planId: "Free", version: subscription.version },
                                                      "Free is scheduled for the end of your paid period. Renewal is off.",
                                                  )
                                                : update(
                                                      "cancel-renewal",
                                                      { version: subscription.version },
                                                      "Renewal is cancelled. Your paid period continues until expiry.",
                                                  )
                                        }
                                    >
                                        <DropdownMenuItem id="free">Switch to Free at period end</DropdownMenuItem>
                                        <DropdownMenuItem id="cancel" tone="danger">Cancel renewal</DropdownMenuItem>
                                    </DropdownMenu>
                                </DropdownMenuTrigger>
                            ) : undefined
                        }
                    >
                        <Facts
                            items={[
                                { label: "Plan", value: subscription.planId },
                                { label: "Status", value: subscription.status },
                                { label: "Period", value: paid ? `${date(subscription.periodStart)} – ${date(subscription.periodEnd)}` : "—" },
                                { label: "Next due", value: date(subscription.nextDueAt) },
                                { label: "Automatic renewal", value: subscription.autoRenew ? "On" : "Off" },
                                ...(subscription.pendingPlanId ? [{ label: "Scheduled change", value: `${subscription.pendingPlanId} on ${date(subscription.periodEnd)}` }] : []),
                            ]}
                        />
                        {subscription.autoRenew && !subscription.renewalMethodEligible && (
                            <Alert tone="warning" title="Renewal method unavailable">
                                Your saved simulated method is inactive. The next payment will wait for manual confirmation.
                            </Alert>
                        )}
                    </Panel>
                    <Panel
                        title="Renewal and payment method"
                        description="Simulated methods only — no card details are needed."
                        actions={
                            <Button
                                size="sm"
                                variant="ghost"
                                iconStart={<Plus />}
                                loading={addMethod.isPending}
                                onPress={() =>
                                    addMethod.mutate({
                                        method: "POST",
                                        path: "/api/v1/me/payment-methods/simulated-card",
                                        json: { label: "Platform renewal simulator", outcome: "Success" },
                                    })
                                }
                            >
                                Add method
                            </Button>
                        }
                    >
                        {methods.data?.length ? (
                            <ul className={styles.methods}>
                                {methods.data.map((item) => (
                                    <li key={item.id}>
                                        <span className={styles.methodIcon} aria-hidden="true"><CreditCard /></span>
                                        <span>{item.label}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.muted}>No saved methods. Payments wait for your confirmation.</p>
                        )}
                        {paid && !subscription.autoRenew && (
                            <div className={styles.row}>
                                <Select aria-label="Automatic renewal method" placeholder="Select a simulated method" selectedKey={method || null} onSelectionChange={(k) => setMethod(String(k))} className={styles.grow}>
                                    {(methods.data ?? []).map((item) => (
                                        <Option key={item.id} id={item.id}>{item.label}</Option>
                                    ))}
                                </Select>
                                <Button
                                    variant="primary"
                                    isDisabled={!method || mutation.isPending}
                                    onPress={() =>
                                        update(
                                            "renewal",
                                            { version: subscription.version, autoRenew: true, paymentMethodId: method },
                                            "Automatic simulated renewal enabled.",
                                        )
                                    }
                                >
                                    Enable renewal
                                </Button>
                            </div>
                        )}
                    </Panel>
                </PanelGrid>
                {teams.data?.teams.map((team) => (
                    <Panel key={team.id} title={`Team access · ${team.name}`} description="Your personal subscription and Team membership are managed separately.">
                        <Facts
                            columns={2}
                            items={[
                                { label: "Role", value: team.role },
                                { label: "Status", value: team.status },
                                { label: "Seats", value: `${team.occupiedSeats} occupied / ${team.purchasedSeats} paid` },
                                { label: "Paid through", value: date(team.periodEnd) },
                            ]}
                        />
                        {team.allowedActions.includes("teams.billing") && <TeamBilling teamId={team.id} dissolutionAt={team.dissolutionAt} />}
                    </Panel>
                ))}
                <Panel title="Plan comparison" description="There is no plan-specific client limit. Ownership and role permissions still apply." flush>
                    <DataTable
                        label="Platform plan comparison"
                        rows={plans.data}
                        rowKey={(plan) => plan.id}
                        columns={[
                            { id: "plan", header: "Plan", cell: (plan) => <strong>{plan.name}</strong> },
                            {
                                id: "price",
                                header: "Price",
                                cell: (plan) =>
                                    plan.priceConfigured && plan.amount != null
                                        ? `${money(plan.amount, plan.currency)}${plan.id === "Team" ? " / person / month" : plan.id === "Pro" ? " / month" : ""}`
                                        : "Not configured",
                            },
                            { id: "commission", header: "Service commission", cell: (plan) => `${plan.commissionRate * 100}%` },
                            {
                                id: "features",
                                header: "Includes",
                                muted: true,
                                hideOnMobile: true,
                                cell: (plan) => (plan.id === "Team" ? "Individual tools, Team roles, seats, clients and analytics" : "Individual tools"),
                            },
                        ]}
                    />
                </Panel>
                <Panel title="Payment and plan history" description="The latest 100 records. Simulated payments — no real money charged." flush>
                    {history.isPending ? (
                        <Loading />
                    ) : history.isError ? (
                        <Failure error={history.error} retry={() => void history.refetch()} />
                    ) : history.data.payments.length === 0 && history.data.changes.length === 0 ? (
                        <p className={styles.empty}>No platform payments or plan changes yet.</p>
                    ) : (
                        <DataTable
                            label="Platform payment history"
                            rows={[
                                ...history.data.payments.map((p) => ({ id: p.id, at: p.settledAt, kind: "Payment", detail: `${p.source}`, amount: money(p.grossAmount, p.currency) })),
                                ...history.data.changes.map((c) => ({ id: c.id, at: c.createdAt, kind: c.type, detail: `${c.planId}${c.effectiveAt ? ` · effective ${date(c.effectiveAt)}` : ""}`, amount: "—" })),
                            ].sort((a, b) => String(b.at).localeCompare(String(a.at)))}
                            rowKey={(row) => row.id ?? `${row.kind}:${row.at}`}
                            columns={[
                                { id: "date", header: "Date", cell: (row) => date(row.at) },
                                { id: "kind", header: "Event", cell: (row) => row.kind },
                                { id: "detail", header: "Details", muted: true, cell: (row) => row.detail },
                                { id: "amount", header: "Amount", align: "end", cell: (row) => row.amount },
                            ]}
                        />
                    )}
                </Panel>
            </div>
        </>
    );
}
