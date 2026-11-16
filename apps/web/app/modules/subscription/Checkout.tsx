import { usePaymentActionId } from "~/shared/session/payment-action";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  LinkButton,
  Skeleton,
} from "@portable-ui/react";
import {
  Failure,
  MutationError,
  useCoachingMutation,
  useCoachingQuery,
} from "~/modules/coaching";
import { isTopTier } from "~/shared/access/plan-catalog";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import {
  useAccountContext,
  useAccountKey,
} from "~/shared/session/AccountScope";
import { BrandMark } from "~/shared/ui/BrandMark";
import {
  catalogLimit,
  isWorkspacePlan,
  planLimitKeys,
  type CatalogPlan,
} from "./catalog";
import { useSubscriptionMessages } from "./messages";
import { FEATURES, PlanHighlights, wholeMoney } from "./SubscriptionPanel";
import { BetaPlansNotice, shownAmount } from "./PlanCards";
import { TeamCheckout } from "./team-billing";
import panel from "./SubscriptionPanel.module.css";
import styles from "./Checkout.module.css";

type Subscription = Schema<"PlatformSubscriptionDto">;

/**
 * Checkout as a full-screen layer over the app, with an arrow back to where the person came from. It shows what the
 * new plan adds over the current one, everything it includes, and the order summary with the confirmation.
 */
export function Checkout({ planId }: { planId: string }) {
  const m = useSubscriptionMessages();
  const navigate = useNavigate();
  const [step, setStep] = useState(2);
  const back = () =>
    window.history.length > 1 ? navigate(-1) : navigate("/app/subscription");
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
    // The layer binds Escape once for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const layer = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <header className={styles.bar}>
        <IconButton
          label={m.back}
          icon={<ArrowLeft />}
          variant="ghost"
          onPress={back}
        />
        <h1 id="checkout-title" className={styles.barTitle}>
          {m.checkoutTitle}
        </h1>
        <ol className={styles.steps} aria-label={m.checkoutTitle}>
          {[m.stepPlan, m.stepPayment, m.stepDone].map((label, index) => (
            <li
              key={label}
              data-state={
                index + 1 < step
                  ? "done"
                  : index + 1 === step
                    ? "current"
                    : undefined
              }
              aria-current={index + 1 === step ? "step" : undefined}
            >
              {/* The first step goes back to choosing the plan. */}
              {index === 0 && step < 4 ? (
                <button
                  type="button"
                  className={styles.stepBack}
                  onClick={() => navigate("/app/subscription")}
                  title={m.backToPlans}
                >
                  <span className={styles.stepDot} aria-hidden="true">
                    <Check />
                  </span>
                  {label}
                </button>
              ) : (
                <>
                  <span className={styles.stepDot} aria-hidden="true">
                    {index + 1 < step ? <Check /> : index + 1}
                  </span>
                  {label}
                </>
              )}
            </li>
          ))}
        </ol>
        <span className={styles.secure}>
          <Lock aria-hidden="true" />
          {m.secure}
        </span>
        <BrandMark className={styles.mark} />
      </header>
      <div className={styles.scroll}>
        <div className={styles.content}>
          <CheckoutBody planId={planId} onDone={() => setStep(4)} />
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined"
    ? layer
    : createPortal(layer, document.body);
}

function CheckoutBody({
  planId,
  onDone,
}: {
  planId: string;
  onDone: () => void;
}) {
  const m = useSubscriptionMessages();
  const { locale } = useAppLocale();
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const current = useCoachingQuery<Subscription>(
    "/api/v1/me/platform-subscription",
  );
  const account = useAccountKey();
  const { lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const [key, setKey] = usePaymentActionId(`checkout:${planId}`);
  const [checkoutDue, setCheckoutDue] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // What the purchase unlocked, kept from before the plan changes under us.
  const [gained, setGained] = useState<string[]>([]);
  const mutation = useCoachingMutation<Subscription>(() => {
    void cache.invalidateQueries({ queryKey: [account, "access"] });
    void cache.invalidateQueries({ queryKey: [account, "usage"] });
  });

  if (plans.isPending || current.isPending)
    return (
      <div className={styles.layout}>
        <Skeleton height="28rem" radius="lg" />
        <Skeleton height="22rem" radius="lg" />
      </div>
    );
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
  const plan = plans.data.find((item) => item.id === planId);
  if (
    !plan ||
    !plan.priceConfigured ||
    plan.amount == null ||
    Number(plan.amount) <= 0
  )
    return (
      <EmptyState
        title={m.notFound}
        description={m.notFoundBody}
        actions={
          <LinkButton href="/app/subscription" iconStart={<ArrowLeft />}>
            {m.backToPlans}
          </LinkButton>
        }
      />
    );
  const subscription = current.data;
  const from = plans.data.find((item) => item.id === subscription.planId);
  const workspace = isWorkspacePlan(plan);
  const best = isTopTier(plan, plans.data);
  const price = wholeMoney(shownAmount(Number(plan.amount)), plan.currency);
  const renews = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.now() + 30 * 86_400_000));
  const pendingDue =
    subscription.pendingPlanId === plan.id
      ? subscription.pendingDue?.id
      : undefined;
  const show = (key: string, value: number | null | undefined) =>
    value === null
      ? m.unlimited
      : value === undefined
        ? "—"
        : /gpu_seconds/.test(key)
          ? m.hours(Math.round(value / 360) / 10)
          : value.toLocaleString(locale);
  // What changes against the current plan: bigger limits and features that switch on.
  const raised = planLimitKeys
    .filter((key) => key !== "organization.coach_seats" || workspace)
    .map((key) => ({
      key,
      now: from ? catalogLimit(from, key) : undefined,
      next: catalogLimit(plan, key),
    }))
    .filter(
      ({ now, next }) =>
        next !== undefined &&
        next !== now &&
        (next === null || now === undefined || (now !== null && next > now)),
    );
  const unlocked = FEATURES.filter(
    ([id, capability]) =>
      capability !== null &&
      (id !== "workspace" || workspace) &&
      plan.capabilities.includes(capability) &&
      !from?.capabilities.includes(capability),
  );

  const pay = async () => {
    setFailed(false);
    let dueId = checkoutDue ?? pendingDue;
    if (!dueId) {
      const checkout = await mutation.mutateAsync({
        method: "POST",
        path: "/api/v1/me/platform-subscription/checkout",
        json: { planId: plan.id, priceVersion: plan.priceVersion },
      });
      if (!lifecycle.isCurrent() || !checkout.pendingDue) return;
      dueId = checkout.pendingDue.id;
      setCheckoutDue(dueId);
    }
    const paid = await mutation.mutateAsync({
      method: "POST",
      path: "/api/v1/me/platform-subscription/confirm-payment",
      json: { dueId, idempotencyKey: key },
    });
    if (!lifecycle.isCurrent()) return;
    if (paid.planId === plan.id && paid.status === "Active") {
      setGained(unlocked.map(([id]) => id));
      setDone(true);
      onDone();
      setKey(crypto.randomUUID());
    } else setFailed(true);
  };

  if (done)
    return (
      <div className={styles.success} role="status">
        {/* The plan's head, as on the plan card, with a check that draws itself in. */}
        <div className={styles.successHead}>
          <span className={styles.successMark} aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
          </span>
          <p className={styles.successEyebrow}>{m.successEyebrow}</p>
          <h2 className={styles.successTitle}>{m.successTitle(plan.name)}</h2>
          <p className={styles.successBody}>{m.successBody}</p>
        </div>
        {gained.length ? (
          <ul className={styles.successList} aria-label={m.unlocks(plan.name)}>
            {gained.map((id, index) => (
              <li key={id} style={{ "--i": index } as React.CSSProperties}>
                <span aria-hidden="true">
                  <Check />
                </span>
                {m.feature[id]}
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.successActions}>
          <LinkButton href="/app/dashboard" variant="primary">
            {m.toDashboard}
          </LinkButton>
          <LinkButton href="/app/usage" variant="secondary">
            {m.seeUsage}
          </LinkButton>
        </div>
      </div>
    );

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <BetaPlansNotice />
        <section
          className={styles.hero}
          data-kind={workspace ? "workspace" : "personal"}
          aria-labelledby="checkout-plan"
        >
          <div className={styles.heroTop}>
            <div>
              <p className={styles.eyebrow}>
                {from ? m.switching(from.name) : m.youChose}
              </p>
              <h2 id="checkout-plan" className={styles.planName}>
                {plan.name}
                {best ? (
                  <span className={styles.bestTag}>
                    <Sparkles aria-hidden="true" />
                    {m.best}
                  </span>
                ) : null}
              </h2>
              <p className={styles.tagline}>
                {workspace ? m.teamsSub : m.individualSub}
              </p>
            </div>
            <p className={styles.planPrice}>
              <strong>{price}</strong>
              <span>{workspace ? m.workspaceMonth : m.month}</span>
            </p>
          </div>
          {raised.length ? (
            <ul className={styles.raised} aria-label={m.moreRoom}>
              {raised.map(({ key, now, next }) => (
                <li key={key}>
                  <span className={styles.raisedLabel}>{m.labels[key]}</span>
                  <span className={styles.raisedValues}>
                    {now !== undefined ? (
                      <>
                        <span className={styles.was}>{show(key, now)}</span>
                        <ArrowRight aria-hidden="true" />
                      </>
                    ) : null}
                    <strong>{show(key, next)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {unlocked.length ? (
          <section className={styles.block} aria-labelledby="checkout-unlocks">
            <h3 id="checkout-unlocks" className={styles.blockTitle}>
              {m.unlocks(plan.name)}
            </h3>
            <ul className={styles.unlocks}>
              {unlocked.map(([id]) => (
                <li key={id}>
                  <span aria-hidden="true">
                    <Check />
                  </span>
                  {m.feature[id]}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* The full list folds open smoothly: the panel grows from no height to its own. */}
        <section className={styles.disclosure} data-open={allOpen || undefined}>
          <button
            type="button"
            className={styles.disclosureHead}
            aria-expanded={allOpen}
            aria-controls="checkout-all"
            onClick={() => setAllOpen((value) => !value)}
          >
            <span>{m.included}</span>
            <ChevronDown aria-hidden="true" className={styles.chevron} />
          </button>
          <div
            id="checkout-all"
            className={styles.disclosureBody}
            inert={!allOpen}
          >
            <div className={styles.disclosureInner}>
              <div className={styles.allFeatures}>
                <PlanHighlights plan={plan} />
              </div>
            </div>
          </div>
        </section>

        {workspace ? (
          <section className={styles.block} aria-label={m.checkout}>
            <TeamCheckout
              plan={plan}
              onCancel={() => window.history.back()}
              onComplete={() => {
                setGained(unlocked.map(([id]) => id));
                setDone(true);
                onDone();
              }}
            />
          </section>
        ) : null}
      </div>

      {!workspace ? (
        <aside className={styles.summary} aria-labelledby="checkout-summary">
          <h2 id="checkout-summary" className={styles.summaryTitle}>
            {m.orderSummary}
          </h2>
          <div className={styles.method}>
            <span className={styles.methodIcon} aria-hidden="true">
              <ShieldCheck />
            </span>
            <span className={styles.methodText}>
              <strong>{m.simulatedCard}</strong>
              <small>{m.test}</small>
            </span>
            <Badge tone="warning" size="sm">
              {m.testMode}
            </Badge>
          </div>
          <dl className={styles.lines}>
            <div>
              <dt>
                {plan.name} · {m.monthly}
              </dt>
              <dd>{price}</dd>
            </div>
            <div>
              <dt>{m.proration}</dt>
              <dd>{wholeMoney(0, plan.currency)}</dd>
            </div>
            <div className={styles.total}>
              <dt>{m.totalToday}</dt>
              <dd>{price}</dd>
            </div>
          </dl>
          <p className={styles.renews}>{m.renewsOn(renews)}</p>
          <form
            className={styles.confirm}
            onSubmit={(event) => {
              event.preventDefault();
              void pay().catch(() => undefined);
            }}
          >
            <Checkbox isSelected={agreed} onChange={setAgreed}>
              {m.agree}
            </Checkbox>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              className={agreed ? panel.upgrade : undefined}
              isDisabled={!agreed || mutation.isPending}
              loading={mutation.isPending}
            >
              {m.confirm}
            </Button>
          </form>
          {failed ? <Alert tone="danger" title={m.failed} /> : null}
          <MutationError error={mutation.error} />
          <p className={styles.fine}>
            {m.simulated} {m.policy}
          </p>
        </aside>
      ) : null}
    </div>
  );
}
