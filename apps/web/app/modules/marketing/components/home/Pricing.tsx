import { useEffect, useState } from "react";
import { Button, LinkButton, Skeleton } from "@metrivum/ui-web";
import type { CatalogPlan } from "~/shared/access/plan-catalog";
import { useSubscriptionMessages } from "~/shared/i18n/subscription-messages";
import { apiBaseUrl } from "~/shared/http/config";
import {
  PlanCard,
  PlanGrid,
  PlanSwitches,
  planKind,
  upgradeClass,
  type PlanKind,
} from "~/modules/subscription";
import { usePublicSession } from "../../usePublicSession";
import { RevealHeading } from "../RevealHeading";
import styles from "./Pricing.module.css";

/**
 * Public pricing: the same plan ladder the app shows (personal or workspace plans, monthly or yearly, the best plan
 * in the Upgrade look). Each plan's action starts an account on that plan, or opens the subscription page when signed in.
 */
export function Pricing() {
  const m = useSubscriptionMessages();
  const hasSession = usePublicSession();
  const [catalog, setCatalog] = useState<CatalogPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState<PlanKind>("Account");
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          apiBaseUrl() + "/api/v1/subscriptions/catalog",
          { signal: controller.signal, credentials: "omit" },
        );
        if (!response.ok) throw new Error("Catalog unavailable");
        const result = (await response.json()) as CatalogPlan[];
        if (!controller.signal.aborted) {
          setCatalog(result);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const shown = catalog?.filter((plan) => planKind(plan) === kind) ?? [];
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className={styles.section}
    >
      <RevealHeading
        id="pricing-title"
        title={m.publicTitle}
        subtitle={m.publicSubtitle}
        align="center"
      />
      <p className={styles.note}>{m.simulated}</p>
      {failed ? (
        <div role="status">
          <p>{m.publicError}</p>
          <Button
            onPress={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            {m.retry}
          </Button>
        </div>
      ) : (
        <div className={styles.ladder} aria-busy={!catalog}>
          <PlanSwitches
            kind={kind}
            onKind={setKind}
            yearly={yearly}
            onYearly={setYearly}
          />
          {!catalog ? (
            <PlanGrid count={3}>
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height="25rem" />
              ))}
            </PlanGrid>
          ) : (
            <PlanGrid count={shown.length}>
              {shown.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  plans={catalog}
                  yearly={yearly}
                  action={(best) => (
                    <LinkButton
                      href={
                        hasSession
                          ? "/app/subscription"
                          : "/auth/register?plan=" + encodeURIComponent(plan.id)
                      }
                      variant={best ? "primary" : "secondary"}
                      className={upgradeClass(best)}
                    >
                      {Number(plan.amount) === 0 ? m.freeCta : m.publicCta}
                    </LinkButton>
                  )}
                />
              ))}
            </PlanGrid>
          )}
        </div>
      )}
      <p className={styles.note}>
        {m.policy} {m.commissionNote}
      </p>
    </section>
  );
}
