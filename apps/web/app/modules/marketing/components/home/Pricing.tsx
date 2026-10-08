import { Check } from "lucide-react";
import { useState, type PointerEvent } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { LinkButton } from "@trainflow/ui-web";
import { useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import { usePublicSession } from "../../usePublicSession";
import { RevealHeading } from "../RevealHeading";
import styles from "./Pricing.module.css";

type Period = "monthly" | "yearly";

// Center card first, then its neighbours, so the row opens outwards from the recommendation.
const ORDER: Record<string, number> = { pro: 0, free: 1, team: 1 };

/** Light that follows the pointer across a card. Written to one leaf element, no React state. */
function followPointer(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const card = event.currentTarget;
  const glow = card.querySelector<HTMLElement>("[data-glow]");
  if (!glow) return;
  const rect = card.getBoundingClientRect();
  glow.style.opacity = "1";
  glow.style.background = `radial-gradient(22rem circle at ${event.clientX - rect.left}px ${event.clientY - rect.top}px, rgb(62 224 154 / 0.06), transparent 65%)`;
}

function hidePointer(event: PointerEvent<HTMLElement>) {
  const glow = event.currentTarget.querySelector<HTMLElement>("[data-glow]");
  if (glow) glow.style.opacity = "0";
}

export function Pricing() {
  const m = usePublicMessages();
  const p = m.home.pricing;
  const hasSession = usePublicSession();
  const [period, setPeriod] = useState<Period>("monthly");
  const [ref, inView] = useInView<HTMLDivElement>({ margin: "0px 0px -18% 0px" });
  const money = new Intl.NumberFormat(p.numberLocale, { style: "currency", currency: p.currency, maximumFractionDigits: 0 });

  return (
    <section id="pricing" aria-labelledby="pricing-title" className={styles.section}>
      <RevealHeading id="pricing-title" title={p.title} subtitle={p.subtitle} align="center" />

      <RadioGroup aria-label={p.billingLabel} orientation="horizontal" value={period} onChange={(value) => setPeriod(value as Period)} className={styles.billing} data-period={period}>
        <span className={styles.billingThumb} aria-hidden="true" />
        <Radio value="monthly" className={styles.billingOption}>
          {p.monthly}
        </Radio>
        <Radio value="yearly" className={styles.billingOption}>
          {p.yearly}
          {p.yearlySaving ? <span className={styles.saving}>{p.yearlySaving}</span> : null}
        </Radio>
      </RadioGroup>

      <div ref={ref} className={styles.plans} data-inview={inView || undefined}>
        {p.plans.map((plan) => {
          const featured = plan.id === "pro";
          const price = period === "yearly" ? plan.yearly : plan.monthly;
          const parts = money.formatToParts(price);
          const amount = parts.filter((part) => part.type !== "currency" && part.type !== "literal").map((part) => part.value).join("");
          const symbol = parts.find((part) => part.type === "currency")?.value ?? "";
          const symbolFirst = parts.findIndex((part) => part.type === "currency") < parts.findIndex((part) => part.type === "integer");
          const note = plan.monthly === 0 ? p.freeForever : period === "yearly" ? p.billedYearly(money.format(plan.yearly * 12)) : p.billedMonthly;
          return (
            <article
              key={plan.id}
              className={styles.plan}
              data-featured={featured || undefined}
              style={{ "--order": ORDER[plan.id] ?? 1 } as React.CSSProperties}
              aria-labelledby={`plan-${plan.id}`}
              onPointerMove={followPointer}
              onPointerLeave={hidePointer}
            >
              <span className={styles.glow} data-glow aria-hidden="true" />
              {featured ? <span className={styles.dots} aria-hidden="true" /> : null}
              <header className={styles.planHead}>
                <h3 id={`plan-${plan.id}`} className={styles.planName}>
                  {plan.name}
                </h3>
                {featured ? <span className={styles.badge}>{p.recommended}</span> : null}
              </header>
              <p className={styles.description}>{plan.description}</p>

              <div className={styles.price}>
                <span className={styles.figure}>
                  {/* Keyed by value so a new price rolls in instead of snapping. */}
                  <span key={`${period}-${price}`} className={styles.amount}>
                    {symbolFirst ? <span className={styles.symbol}>{symbol}</span> : null}
                    {amount}
                    {symbolFirst ? null : (
                      <span className={styles.symbol} data-after>
                        {symbol}
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.per}>{plan.id === "team" ? p.perPersonMonth : p.perMonth}</span>
              </div>
              <p className={styles.billed} aria-live="polite">
                {note}
              </p>

              <LinkButton href={hasSession ? "/app/settings" : `/auth/register?plan=${plan.id}`} variant={featured ? "primary" : "secondary"} size="lg" block className={styles.cta}>
                {plan.cta}
              </LinkButton>

              <div className={styles.included}>
                <p className={styles.lead}>{plan.lead}</p>
                <ul className={styles.features}>
                  {plan.features.map((feature, i) => (
                    <li key={feature} style={{ "--i": i } as React.CSSProperties}>
                      <span className={styles.check} aria-hidden="true">
                        <Check />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
      <p className={styles.note}>{p.note}</p>
    </section>
  );
}
