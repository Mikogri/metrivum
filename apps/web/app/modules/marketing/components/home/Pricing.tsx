import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button, LinkButton, Skeleton } from "@trainflow/ui-web";
import { catalogLimit, isWorkspacePlan, planLimitKeys, type CatalogPlan } from "~/shared/access/plan-catalog";
import { useSubscriptionMessages } from "~/shared/i18n/subscription-messages";
import { apiBaseUrl } from "~/shared/http/config";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useInView } from "../../lib/useInView";
import { usePublicSession } from "../../usePublicSession";
import { RevealHeading } from "../RevealHeading";
import styles from "./Pricing.module.css";

export function Pricing() {
  const m = useSubscriptionMessages();
  const locale = useLocale();
  const hasSession = usePublicSession();
  const [catalog, setCatalog] = useState<CatalogPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ref, inView] = useInView<HTMLDivElement>({ margin: "0px 0px -18% 0px" });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(apiBaseUrl() + "/api/v1/subscriptions/catalog", { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("Catalog unavailable");
        const result = await response.json() as CatalogPlan[];
        if (!controller.signal.aborted) { setCatalog(result); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  return <section id="pricing" aria-labelledby="pricing-title" className={styles.section}>
    <RevealHeading id="pricing-title" title={m.publicTitle} subtitle={m.publicSubtitle} align="center" />
    <p className={styles.note}>{m.simulated}</p>
    {failed ? <div role="status"><p>{m.publicError}</p><Button onPress={() => { setFailed(false); setAttempt(value => value + 1); }}>{m.retry}</Button></div> : <div ref={ref} className={styles.plans} data-inview={inView || undefined} aria-busy={!catalog}>
      {!catalog ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height="30rem" />) : catalog.map(plan => {
        const featured = plan.id === "Pro";
        const price = plan.amount == null ? m.notConfigured : new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.amount));
        return <article key={plan.id} className={styles.plan} data-featured={featured || undefined} style={{ "--order": 0 } as React.CSSProperties} aria-labelledby={"public-plan-" + plan.id}>
          <header className={styles.planHead}><h3 id={"public-plan-" + plan.id} className={styles.planName}>{plan.name}</h3>{featured && <span className={styles.badge}>{m.recommended}</span>}</header>
          <div className={styles.price}><span className={styles.figure}><span className={styles.amount}>{price}</span></span><span className={styles.per}>{isWorkspacePlan(plan) ? m.workspaceMonth : m.month}</span></div>
          <p className={styles.billed}>{m.simulated}</p>
          <LinkButton href={hasSession ? "/app/subscription" : "/auth/register?plan=" + encodeURIComponent(plan.id)} variant={featured ? "primary" : "secondary"} size="lg" block className={styles.cta}>{Number(plan.amount) === 0 ? m.freeCta : m.publicCta}</LinkButton>
          <div className={styles.included}><ul className={styles.features}>
            {planLimitKeys.map(key => { const value = catalogLimit(plan, key); return value === undefined ? null : <li key={key}><span className={styles.check}><Check aria-hidden="true" /></span>{m.labels[key]}: {value === null ? m.unlimited : value.toLocaleString()}</li>; })}
            <li><span className={styles.check}><Check aria-hidden="true" /></span>{m.basic}</li>
            {plan.capabilities.includes("training.builder.advanced") && <li><span className={styles.check}><Check aria-hidden="true" /></span>{m.professional}</li>}
            {plan.capabilities.includes("discovery.ranking.priority") && <li><span className={styles.check}><Check aria-hidden="true" /></span>{m.priority}</li>}
            <li>{m.commission}: {Number(plan.commissionRate) * 100}%</li>
          </ul></div>
        </article>;
      })}
    </div>}
    <p className={styles.note}>{m.policy} {m.commissionNote}</p>
  </section>;
}
