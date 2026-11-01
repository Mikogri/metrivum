import { Banknote } from "lucide-react";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { EmptyState, LinkButton, PageHeader, Segment, SegmentedControl } from "@metrivum/ui-web";
import { Failure, Loading, useCoachingQuery } from "~/modules/coaching";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { AreaChart, Kpi } from "./charts";
import { UpgradeBanner } from "~/shared/access";
import styles from "./analyze.module.css";

const copy = {
  en: { title: "Basic Analyze", description: "Client counts, recorded payments and check-ins for your personal coaching activity.", active: "Active clients", suspended: "Suspended clients", completed: "Completed clients", checkins: "Submitted check-ins", overdue: "Overdue check-ins", review: "Awaiting review", finance: "Payments", financeNote: "Settled client payments in this period, and what you kept after fees.", gross: "Gross", fees: "Fees", count: "Payments", simulated: "Simulated payments", paymentNote: "Platform payments are test transactions. External payments are recorded separately; no real funds are collected.", upgrade: "Advanced Analyze with Pro", advanced: "Retention, acquisition, period comparisons, simulated MRR and reports are available with Pro, Team and Studio.", plans: "View plans", upgradeAction: "Upgrade to Pro", net: "Net", pending: "Pending", empty: "No recorded payments in this period", emptyBody: "Payments from clients for your offers will show up here, with net income after fees.", days: (n: number) => `${n} days`, period: "Period" },
  pl: { title: "Podstawowe Analyze", description: "Liczba klientów, zapisane płatności i check-iny Twojej działalności indywidualnej.", active: "Aktywni klienci", suspended: "Wstrzymani klienci", completed: "Zakończone współprace", checkins: "Przesłane check-iny", overdue: "Zaległe check-iny", review: "Do sprawdzenia", finance: "Płatności", financeNote: "Rozliczone płatności klientów w tym okresie i to, co zostaje po opłatach.", gross: "Brutto", fees: "Opłaty", count: "Płatności", simulated: "Płatności symulowane", paymentNote: "Płatności na platformie są transakcjami testowymi. Płatności zewnętrzne są zapisywane osobno; nie pobieramy prawdziwych środków.", upgrade: "Zaawansowane Analyze z Pro", advanced: "Retencja, pozyskiwanie klientów, porównania okresów, symulowane MRR i raporty są dostępne w Pro, Team i Studio.", plans: "Zobacz plany", upgradeAction: "Przejdź na Pro", net: "Netto", pending: "Oczekujące", empty: "Brak zapisanych płatności w tym okresie", emptyBody: "Tu pojawią się płatności klientów za Twoje oferty, z przychodem netto po opłatach.", days: (n: number) => `${n} dni`, period: "Okres" },
};

export function BasicAnalyze() {
  const { locale } = useAppLocale();
  const t = copy[locale];
  const [days, setDays] = useState("30");
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - Number(days) + 1);
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const report = useCoachingQuery<Schema<"BasicAnalysis">>("/api/v1/analyze/basic", { from: date(from), to: date(to), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", scope: "personal" });
  const data = report.data;
  return <div className={styles.workspace}>
    <PageHeader title={t.title} description={t.description} actions={<SegmentedControl aria-label={t.period} selectedKeys={[days]} onSelectionChange={keys => setDays(String([...keys][0] ?? "30"))}>{[7, 30, 90].map(n => <Segment key={n} id={String(n)}>{t.days(n)}</Segment>)}</SegmentedControl>} />
    <UpgradeBanner title={t.upgrade} body={t.advanced} action={t.upgradeAction} />
    {report.isPending ? <Loading /> : report.isError ? <Failure error={report.error} retry={report.refetch} /> : data && <>
      <div className={styles.kpis}><Kpi label={t.active} value={data.clients.active} /><Kpi label={t.suspended} value={data.clients.suspended} /><Kpi label={t.completed} value={data.clients.completed} /><Kpi label={t.checkins} value={data.checkIns.submitted} /><Kpi label={t.overdue} value={data.checkIns.overdue} /><Kpi label={t.review} value={data.checkIns.pendingReview} /></div>
      {data.finance.totals.length === 0 ? <EmptyState icon={<Banknote />} title={t.empty} description={t.emptyBody} actions={<LinkButton href="/app/offers" variant="secondary" size="sm">Offers</LinkButton>} /> : data.finance.totals.map(total => {
        const points = data.finance.series.filter(point => point.currency === total.currency);
        const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: total.currency }).format(value);
        const facts = [
          { label: t.net, value: money(Number(total.net)), tone: "accent" },
          { label: t.gross, value: money(Number(total.gross)) },
          { label: t.fees, value: money(Number(total.fee)) },
          { label: t.pending, value: money(Number(total.pending)), tone: Number(total.pending) > 0 ? "warning" : undefined },
          { label: t.count, value: String(total.payments) },
        ];
        return <section key={total.currency} className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2 className={styles.payTitle}>{t.finance}<span className={styles.currency}>{total.currency}</span></h2>
              <p className={styles.muted}>{t.financeNote}</p>
            </div>
          </header>
          <dl className={styles.payStrip}>
            {facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd data-tone={f.tone}>{f.value}</dd></div>)}
          </dl>
          <AreaChart height={220} labels={points.map(point => point.date)} format={money} series={[{ label: t.net, values: points.map(point => Number(point.net)), tone: "accent" }]} />
        </section>;
      })}
    </>}
  </div>;
}
