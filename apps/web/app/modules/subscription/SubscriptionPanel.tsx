import { CreditCard, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProfileResponse, Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Button,
  Dialog,
  DialogTrigger,
  LinkButton,
  Skeleton,
} from "@portable-ui/react";
import {
  Failure,
  MutationError,
  useCoachingMutation,
  useCoachingQuery,
} from "~/modules/coaching";
import { profileKey, useProfile } from "~/modules/accounts";
import { useApi } from "~/shared/session/AccountScope";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { errorText } from "~/shared/lib/errorText";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey } from "~/shared/session/AccountScope";
import { isWorkspacePlan, planChangeKind, type CatalogPlan } from "./catalog";
import {
  BetaPlansNotice,
  PlanCard,
  PlanGrid,
  PlanSwitches,
  planKind,
  upgradeClass,
  type PlanKind,
} from "./PlanCards";
import { useSubscriptionMessages } from "./messages";
import { useUpgrade } from "./upgrade";
import styles from "./SubscriptionPanel.module.css";

type Subscription = Schema<"PlatformSubscriptionDto">;

// The card pieces live in PlanCards so the public pricing page can draw the same cards.
export { FEATURES, PlanHighlights, wholeMoney } from "./PlanCards";

/** The plans to choose from. Choosing a higher plan opens the checkout page; a lower one is scheduled for the period end. */
export function Offers({
  embedded = false,
  onLeave,
}: { embedded?: boolean; onLeave?: () => void } = {}) {
  const m = useSubscriptionMessages();
  const profile = useProfile();
  const scope = useWorkspace();
  // A client account is on no plan: choosing one first explains that the account grows into a coach account.
  const asClient = !profile.roles.includes("Coach") || scope.mode === "client";
  const [becoming, setBecoming] = useState<CatalogPlan | null>(null);
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const current = useCoachingQuery<Subscription>(
    "/api/v1/me/platform-subscription",
  );
  const team = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
  const account = useAccountKey();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  // One ladder at a time (personal or workspace plans), and monthly or yearly prices.
  const [kind, setKind] = useState<PlanKind | null>(null);
  const [yearly, setYearly] = useState(false);
  const mutation = useCoachingMutation<Subscription>(() => {
    void cache.invalidateQueries({ queryKey: [account, "access"] });
    void cache.invalidateQueries({ queryKey: [account, "usage"] });
  });
  if (plans.isPending || current.isPending)
    return (
      <div className={styles.offers} aria-busy="true" aria-label={m.loading}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height="25rem" />
        ))}
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
  const subscription = current.data;
  const currentPlan = plans.data.find(
    (plan) => plan.id === subscription.planId,
  );
  const shownKind = kind ?? (currentPlan ? planKind(currentPlan) : "Account");
  const shown = plans.data.filter((plan) => planKind(plan) === shownKind);

  return (
    <div className={styles.panel}>
      <BetaPlansNotice />
      <PlanSwitches
        kind={shownKind}
        onKind={setKind}
        yearly={yearly}
        onYearly={setYearly}
      />
      <MutationError error={mutation.error} />
      <PlanGrid count={shown.length}>
        {shown.map((plan) => {
          const isCurrent = subscription.planId === plan.id;
          const downgrade =
            planChangeKind(plans.data, subscription.planId, plan.id) ===
            "downgrade";
          const workspace = isWorkspacePlan(plan);
          // Yearly is shown as ten monthly payments (two months free); checkout is monthly only for now.
          if (asClient)
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                plans={plans.data}
                yearly={yearly}
                action={(best) => (
                  <Button
                    variant={best ? "primary" : "secondary"}
                    className={upgradeClass(best)}
                    isDisabled={
                      (yearly && Number(plan.amount) > 0) ||
                      !plan.priceConfigured ||
                      workspace
                    }
                    onPress={() => setBecoming(plan)}
                  >
                    {yearly && Number(plan.amount) > 0
                      ? m.yearlySoon
                      : m.select + " " + plan.name}
                  </Button>
                )}
              />
            );
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              plans={plans.data}
              yearly={yearly}
              current={isCurrent}
              action={(best) =>
                workspace && !!team.data?.teams.length ? (
                  <LinkButton href="/app/team" className={upgradeClass(false)}>
                    {m.manageWorkspace}
                  </LinkButton>
                ) : (
                  <Button
                    variant={best ? "primary" : "secondary"}
                    className={upgradeClass(best)}
                    isDisabled={
                      (yearly && Number(plan.amount) > 0 && !isCurrent) ||
                      isCurrent ||
                      !plan.priceConfigured ||
                      mutation.isPending ||
                      subscription.pendingPlanId === plan.id ||
                      (workspace &&
                        (!profile.roles.includes("Coach") ||
                          team.isPending ||
                          team.isError))
                    }
                    onPress={() => {
                      setNotice("");
                      if (downgrade)
                        mutation.mutate(
                          {
                            method: "POST",
                            path: "/api/v1/me/platform-subscription/change-plan",
                            json: {
                              planId: plan.id,
                              version: subscription.version,
                            },
                          },
                          { onSuccess: () => setNotice(m.changeScheduled) },
                        );
                      else {
                        onLeave?.();
                        navigate(
                          `/app/checkout?plan=${encodeURIComponent(plan.id)}`,
                        );
                      }
                    }}
                  >
                    {isCurrent
                      ? m.yourPlan
                      : yearly && Number(plan.amount) > 0
                        ? m.yearlySoon
                        : subscription.pendingPlanId === plan.id
                          ? m.scheduled
                          : downgrade
                            ? m.schedule + ": " + plan.name
                            : m.select + " " + plan.name}
                  </Button>
                )
              }
            />
          );
        })}
      </PlanGrid>
      {notice && <p role="status">{notice}</p>}
      {subscription.pendingPlanId && (
        <p role="status">
          {m.upcoming}: {subscription.pendingPlanId} ·{" "}
          {subscription.periodEnd &&
            new Date(subscription.periodEnd).toLocaleDateString()}
        </p>
      )}
      {!embedded && !asClient && (
        <LinkButton
          href="/app/subscription"
          variant="ghost"
          size="sm"
          className={styles.manage}
        >
          {m.historyLink}
        </LinkButton>
      )}
      <BecomeCoachDialog
        plan={becoming}
        onClose={() => setBecoming(null)}
        onLeave={onLeave}
      />
    </div>
  );
}

/**
 * Choosing a plan as a client: a client-only account first grows into a coach account (it keeps everything it has as a
 * client); a coach in the client view switches to the coach workspace. Then a paid plan opens the checkout.
 */
function BecomeCoachDialog({
  plan,
  onClose,
  onLeave,
}: {
  plan: CatalogPlan | null;
  onClose: () => void;
  onLeave?: () => void;
}) {
  const m = useSubscriptionMessages();
  const app = useT();
  const profile = useProfile();
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const { canCoach, switchMode } = useWorkspace();
  const [target, setTarget] = useState<string | null>(null);
  const activate = useMutation({
    mutationFn: async () =>
      (
        await api<ProfileResponse>({
          method: "PUT",
          path: "/api/v1/me/roles/coach/onboarding",
          json: {
            role: "Coach",
            username: profile.username,
            birthDate: profile.birthDate,
            displayName: profile.displayName,
            firstName: profile.firstName ?? null,
            lastName: profile.lastName ?? null,
            locale: profile.locale,
            timeZone: profile.timeZone,
            acceptedTerms: true,
          },
        })
      ).data,
    onSuccess: (updated) => cache.setQueryData(profileKey(account), updated),
  });
  // The coach workspace exists once the new role reaches the page: then switch to it and go on.
  useEffect(() => {
    if (!target || !canCoach) return;
    setTarget(null);
    onLeave?.();
    void switchMode("coach", target);
  }, [target, canCoach, switchMode, onLeave]);
  if (!plan) return null;
  const coach = profile.roles.includes("Coach");
  const proceed = async () => {
    if (!coach) await activate.mutateAsync();
    setTarget(
      Number(plan.amount) > 0
        ? `/app/checkout?plan=${encodeURIComponent(plan.id)}`
        : "/app/dashboard",
    );
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !activate.isPending) onClose();
      }}
      title={coach ? m.switchToCoachTitle : m.becomeCoachTitle}
      size="sm"
      footer={() => (
        <>
          <Button
            variant="secondary"
            isDisabled={activate.isPending}
            onPress={onClose}
          >
            {m.cancel}
          </Button>
          <Button
            variant="primary"
            loading={activate.isPending || !!target}
            onPress={() => void proceed().catch(() => undefined)}
          >
            {m.becomeCoachContinue}
          </Button>
        </>
      )}
    >
      <p>
        {coach ? m.switchToCoachBody(plan.name) : m.becomeCoachBody(plan.name)}
      </p>
      {!coach ? <p className={styles.terms}>{m.becomeCoachTerms}</p> : null}
      {activate.error ? (
        <Alert tone="danger" title={errorText(app, activate.error)} />
      ) : null}
    </Dialog>
  );
}

export function SubscriptionButton({ label }: { label: string }) {
  const m = useSubscriptionMessages();
  // "Upgrade to <top plan>" until the account (or its Team) is on the highest tier of its kind.
  const upgrade = useUpgrade();
  const navigate = useNavigate();
  const profile = useProfile();
  const { mode } = useWorkspace();
  const [open, setOpen] = useState(false);
  // A client is on no plan, so there is nothing to upgrade: a plain button to the plans.
  if (!profile.roles.includes("Coach") || mode === "client")
    return (
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <Button variant="secondary" size="sm" iconStart={<CreditCard />}>
          {m.plans}
        </Button>
        <Dialog title={m.plans} description={m.clientDescription} size="xl">
          <Offers onLeave={() => setOpen(false)} />
        </Dialog>
      </DialogTrigger>
    );
  // An action naming a specific personal plan must open that plan, not ask for the choice again.
  // Existing workspace subscriptions retain their workspace-management flow in the chooser.
  if (
    upgrade.available &&
    upgrade.target &&
    !isWorkspacePlan(upgrade.target) &&
    upgrade.target.priceConfigured &&
    Number(upgrade.target.amount) > 0
  )
    return (
      <Button
        onPress={() =>
          navigate(
            `/app/checkout?plan=${encodeURIComponent(upgrade.target!.id)}`,
          )
        }
        variant="primary"
        size="sm"
        className={styles.upgrade}
        iconStart={<Rocket />}
      >
        {m.upgradeTo(upgrade.target.name)}
      </Button>
    );
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        variant={upgrade.available ? "primary" : "secondary"}
        size="sm"
        className={upgrade.available ? styles.upgrade : undefined}
        iconStart={upgrade.available ? <Rocket /> : <CreditCard />}
      >
        {upgrade.available ? m.upgrade : label}
      </Button>
      <Dialog title={m.plans} description={m.choose} size="xl">
        <Offers onLeave={() => setOpen(false)} />
      </Dialog>
    </DialogTrigger>
  );
}
