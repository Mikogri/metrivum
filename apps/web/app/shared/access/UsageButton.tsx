import { ArrowRight, Gauge } from "lucide-react";
import { useState } from "react";
import { DialogTrigger } from "react-aria-components";
import { useNavigate } from "react-router";
import { Button, IconButton, Popover } from "@metrivum/ui-web";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { formatBytes } from "~/shared/i18n/format";
import { isCap, useUsage, type UsageItem } from "./usage";
import { UsageRing, limitIcon, usageState } from "./UsageRing";
import styles from "./UsageButton.module.css";

/** How many limits the quick view lists: this period's counters and anything nearly used up come first. */
const QUICK = 4;

/**
 * App bar usage button, styled like the other app bar buttons. It opens a short summary (the period's counters and
 * the fullest limits) with a link to the full usage page; a dot marks a limit that is nearly used up.
 */
export function UsageButton() {
  const m = useT();
  const t = m.usage;
  const { locale } = useAppLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const usage = useUsage();
  const near = usage.near.length > 0;
  const countable = usage.items.filter((item) => !isCap(item.key) && item.maximum !== null);
  const quick = [...countable].sort((a, b) => Number(b.period) - Number(a.period) || b.ratio - a.ratio).slice(0, QUICK);
  const reset = usage.period ? Math.max(0, Math.ceil((new Date(usage.period.end).getTime() - Date.now()) / 86_400_000)) : null;
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <IconButton
        className={styles.trigger}
        data-near={near || undefined}
        label={near ? t.nearLabel(usage.near.length) : t.title}
        variant="secondary"
        size="sm"
        showTooltip={false}
        icon={
          <>
            <Gauge strokeWidth={1.75} />
            {near ? <span className={styles.dot} /> : null}
          </>
        }
      />
      <Popover placement="bottom end" aria-label={t.title} className={styles.panel}>
        <header className={styles.head}>
          <strong>{t.title}</strong>
          {reset !== null ? <span>{t.resetsIn(reset)}</span> : null}
        </header>
        {near ? <p className={styles.warning}>{t.nearTitle(usage.near.length)}</p> : null}
        <ul className={styles.list}>
          {quick.length ? quick.map((item) => <Row key={item.key} item={item} locale={locale} label={m.access.limits[item.key] ?? item.key} />) : <li className={styles.muted}>{usage.pending ? t.loading : t.nothing}</li>}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          block
          iconEnd={<ArrowRight />}
          onPress={() => {
            setOpen(false);
            navigate("/app/usage");
          }}
        >
          {t.allDetails}
        </Button>
      </Popover>
    </DialogTrigger>
  );
}

function Row({ item, label, locale }: { item: UsageItem; label: string; locale: string }) {
  const Icon = limitIcon(item.key);
  const value = (n: number) => (/bytes/i.test(item.key) ? formatBytes(locale as never, n) : new Intl.NumberFormat(locale).format(n));
  return (
    <li className={styles.row} data-state={usageState(item)}>
      <UsageRing item={item} size="sm">
        <Icon />
      </UsageRing>
      <span className={styles.name}>{label}</span>
      <span className={styles.value}>
        {value(item.used)}
        <small> / {item.maximum === null ? "∞" : value(item.maximum)}</small>
      </span>
    </li>
  );
}
