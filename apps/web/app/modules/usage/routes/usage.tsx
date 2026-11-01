import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Badge, LinkButton, PageHeader, Skeleton } from "@metrivum/ui-web";
import { QuotaContextField, isCap, useUsage, type UsageItem } from "~/shared/access";
import { limitIcon, usageState } from "~/shared/access/UsageRing";
import { formatBytes } from "~/shared/i18n/format";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import styles from "./usage.module.css";

export const meta = () => privateMeta("Usage — Metrivum");

type Subscription = Schema<"PlatformSubscriptionDto">;

function useValue() {
  const { locale } = useAppLocale();
  return (item: UsageItem, n: number) => (/bytes/i.test(item.key) ? formatBytes(locale, n) : new Intl.NumberFormat(locale).format(n));
}

/**
 * Usage as quiet tables: what each limit allows and how much of it is used, with the reset date under the counters,
 * the plan in a footer row with a link to change it, and per-item caps in their own table.
 */
export default function UsageRoute() {
  const m = useT();
  const t = m.usage;
  const { locale } = useAppLocale();
  const api = useApi();
  const account = useAccountKey();
  const usage = useUsage();
  const plan = useQuery({
    queryKey: [account, "coaching", "/api/v1/me/platform-subscription"],
    queryFn: async ({ signal }) => (await api<Subscription>({ path: "/api/v1/me/platform-subscription", signal })).data,
  });
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso));
  const counted = usage.items.filter((item) => !isCap(item.key));
  const caps = usage.items.filter((item) => isCap(item.key));

  return (
    <div className={styles.page}>
      <PageHeader title={t.title} description={t.description} />
      <QuotaContextField context={usage.context} />
      {usage.near.length ? <Alert tone="warning" title={t.nearTitle(usage.near.length)}>{t.nearBody}</Alert> : null}
      {usage.error ? <Alert tone="danger" title={errorText(m, usage.error)} /> : null}

      <section className={styles.card} aria-labelledby="usage-limits">
        <div className={styles.cardHead}>
          <h2 id="usage-limits">{t.plan}</h2>
          <p>{t.planHint}</p>
        </div>
        <div className={styles.table} role="table" aria-label={t.plan}>
          <div className={styles.headRow} role="row">
            <span role="columnheader">{t.colLimit}</span>
            <span role="columnheader">{t.colUsage}</span>
            <span role="columnheader" className={styles.end}>
              {t.colState}
            </span>
          </div>
          {usage.pending ? (
            <div className={styles.loading}>
              <Skeleton height="9rem" />
            </div>
          ) : (
            counted.map((item) => <Row key={item.key} item={item} />)
          )}
        </div>
        <div className={styles.foot}>
          <span className={styles.footMain}>
            {t.planName(plan.data?.planId ?? "—")}
            {usage.period ? <small>{t.resetsOn(date(usage.period.end))}</small> : null}
          </span>
          <LinkButton href="/app/subscription" size="sm" iconEnd={<ArrowUpRight />}>
            {t.managePlan}
          </LinkButton>
        </div>
      </section>

      {caps.length ? (
        <section className={styles.card} aria-labelledby="usage-caps">
          <div className={styles.cardHead}>
            <h2 id="usage-caps">{t.caps}</h2>
            <p>{t.capsHint}</p>
          </div>
          <div className={styles.table} role="table" aria-label={t.caps}>
            <div className={styles.headRow} role="row">
              <span role="columnheader">{t.colLimit}</span>
              <span role="columnheader">{t.colAllowed}</span>
              <span role="columnheader" />
            </div>
            {caps.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A colour per kind of limit, in the dashboard's tones. */
function toneOf(key: string) {
  if (/client|seat/i.test(key)) return "green";
  if (/analys|gpu|video|duration/i.test(key)) return "violet";
  if (/formula|generator|generation|upload|bytes|size|pending/i.test(key)) return "blue";
  return "green";
}

function Row({ item }: { item: UsageItem }) {
  const m = useT();
  const t = m.usage;
  const value = useValue();
  const state = usageState(item);
  const label = m.access.limits[item.key] ?? item.key;
  const Icon = limitIcon(item.key);
  const metered = state === "ok" || state === "near" || state === "full";
  return (
    <div className={styles.row} role="row" data-state={state} data-tone={toneOf(item.key)}>
      <span role="cell" className={styles.name}>
        <span className={styles.icon} aria-hidden="true">
          <Icon />
        </span>
        <span className={styles.labelBox}>
          <span className={styles.label}>{label}</span>
          {item.period ? <span className={styles.periodTag}>{t.perPeriod}</span> : null}
        </span>
      </span>
      <span role="cell" className={styles.usage}>
        <span className={styles.amount}>
          {state === "cap" ? t.upTo(value(item, item.maximum ?? 0)) : state === "unlimited" ? `${value(item, item.used)} / ${t.unlimited}` : `${value(item, item.used)} / ${value(item, item.maximum ?? 0)}`}
        </span>
        {metered ? (
          <span className={styles.bar} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={item.maximum ?? 0} aria-valuenow={Math.min(item.used, item.maximum ?? 0)}>
            <span style={{ transform: `scaleX(${Math.max(item.ratio, item.used > 0 ? 0.015 : 0)})` }} />
          </span>
        ) : null}
      </span>
      <span role="cell" className={styles.end}>
        {state === "full" ? (
          <Badge tone="danger" size="sm">
            {t.full}
          </Badge>
        ) : state === "near" ? (
          <Badge tone="warning" size="sm">
            {t.near}
          </Badge>
        ) : state === "ok" ? (
          <span className={styles.percent}>{Math.round(item.ratio * 100)}%</span>
        ) : null}
      </span>
    </div>
  );
}
