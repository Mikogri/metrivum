import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronDown, RotateCcw, Wallet } from "lucide-react";
import { useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Badge, Button, DataTable, Dialog, EmptyState, LinkButton, Option, PageHeader, SearchInput, Segment, SegmentedControl, Select, Skeleton, Tab, TabList, Tabs, TextField, Toolbar } from "@trainflow/ui-web";
import { ResponsiveFilters } from "~/shared/library/ResponsiveFilters";
import { UserAutocomplete } from "~/modules/accounts";
import { ApiError } from "~/shared/http/errors";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { privateMeta } from "~/shared/i18n/site";
import { useUrlState } from "~/shared/lib/useUrlState";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading } from "../components";
import { money } from "../pricing";
import coaching from "../coaching.module.css";
import styles from "./transactions.module.css";

export const meta = () => privateMeta("Transactions — Metrivum");
type Transaction = Schema<"FinancialHistoryItem">;
type Summary = Schema<"TransactionSummary">;
type View = "all" | "upcoming" | "overdue" | "completed" | "earned" | "paid";
const optional = (value: string) => value || undefined;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
const amount = (value: string) => value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
const DAY = 86_400_000;

/** Windows for the summary and the list: the last 30 or 90 days, the last 12 months or everything. */
function windowStart(period: string) {
  const days = period === "30" ? 30 : period === "90" ? 90 : period === "365" ? 365 : 0;
  return days ? new Date(Date.now() - days * DAY).toISOString().slice(0, 10) : "";
}

/** Several currencies are listed side by side; nothing is converted. */
function sums(items: { currency: string; value: number }[]) {
  const shown = items.filter((x) => x.value !== 0);
  return shown.length ? shown.map((x) => money(x.value, x.currency)).join(" · ") : money(0, items[0]?.currency ?? "EUR");
}

function TransactionDetails({ id, teamId, close }: { id: string; teamId?: string; close: () => void }) {
  const pl = useAppLocale().locale === "pl";
  const query = useCoachingQuery<Transaction>(`/api/v1/me/transactions/${id}`, { teamId });
  const value = query.data;
  const row = (label: string, content: React.ReactNode, mono = false) => <div className={styles.detailRow}><dt>{label}</dt><dd data-mono={mono || undefined}>{content}</dd></div>;
  return <Dialog isOpen placement="right" size="md" title={pl ? "Szczegóły operacji" : "Transaction details"} onOpenChange={open => !open && close()}>
    {query.isPending ? <Loading /> : query.error ? <Failure error={query.error} /> : value && <div className={styles.details}>
      {/* What it is and how much, first. */}
      <header className={styles.detailHead}>
        <span className={styles.detailDir} data-dir={value.direction} aria-hidden="true">{value.direction === "Incoming" ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
        <span className={styles.detailTitle}><strong>{value.name}</strong><span>{new Date(value.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span></span>
      </header>
      <p className={styles.detailAmount} data-dir={value.direction}>{value.direction === "Incoming" ? "+" : "−"}{money(Number(value.direction === "Incoming" ? value.netAmount : value.grossAmount), value.currency)}</p>
      <div className={styles.detailBadges}><Badge size="sm" tone={value.status === "Succeeded" ? "success" : value.status === "Pending" ? "warning" : value.status === "Failed" ? "danger" : "neutral"}>{value.status}</Badge><Badge size="sm">{value.type.replace(/([a-z])([A-Z])/g, "$1 $2")}</Badge>{value.mode === "Simulated" ? <Badge size="sm" tone="warning">{pl ? "Symulacja" : "Simulated"}</Badge> : null}</div>
      <section className={styles.detailSection}>
        <h3>{pl ? "Kwoty" : "Amounts"}</h3>
        <dl>
          {row(pl ? "Kwota usługi / planu" : "Service / plan amount", money(Number(value.grossAmount), value.currency))}
          {row(pl ? "Opłata platformowa (w kwocie)" : "Platform fee (included)", `${money(Number(value.feeAmount), value.currency)} · ${Number(value.feeRate) * 100}%`)}
          {row(pl ? "Kwota netto odbiorcy" : "Recipient net", <strong>{money(Number(value.netAmount), value.currency)}</strong>)}
          {value.dueAt ? row(pl ? "Termin płatności" : "Due date", new Date(value.dueAt).toLocaleDateString([], { dateStyle: "medium" })) : null}
        </dl>
      </section>
      <section className={styles.detailSection}>
        <h3>{pl ? "Strony" : "Parties"}</h3>
        <dl>
          {row(pl ? "Trener / odbiorca" : "Coach / recipient", value.type === "PlatformSubscription" ? "Metrivum" : value.coachName || value.coachId)}
          {row(pl ? "Klient / płatnik" : "Client / payer", value.clientName || value.clientId)}
        </dl>
      </section>
      <section className={styles.detailSection}>
        <h3>{pl ? "Identyfikatory" : "References"}</h3>
        <dl>
          {row("ID", value.id, true)}
          {value.paymentId ? row("Payment ID", value.paymentId, true) : null}
          {value.serviceId ? row("Service ID", value.serviceId, true) : null}
          {value.offerId ? row("Offer revision ID", value.offerId, true) : null}
          {value.planId ? row("Plan", value.planId) : null}
        </dl>
      </section>
      {value.failureCode ? <Alert tone="danger" title={value.failureCode} /> : null}
      <p className={styles.detailNote}>{value.mode === "Simulated" ? (pl ? "Płatność symulowana — bez rzeczywistego przepływu środków." : "Simulated payment — no real money moved.") : (pl ? "Rozliczenie zgłoszone ręcznie, niezweryfikowane przez operatora." : "Manually reported settlement, unverified by a provider.")}{!value.isSettlement ? (pl ? " To zdarzenie lub zobowiązanie, nie rozliczona płatność." : " This is an event or obligation, not a settled payment.") : ""}</p>
    </div>}
  </Dialog>;
}

function Tile({ tone, icon: Icon, label, value, note, alert }: { tone: string; icon: typeof Wallet; label: string; value: React.ReactNode; note?: React.ReactNode; alert?: boolean }) {
  return <div className={styles.tile} data-tone={tone} data-alert={alert || undefined}>
    <span className={styles.tileHead}><span className={styles.tileIcon} aria-hidden="true"><Icon /></span><span className={styles.tileLabel}>{label}</span></span>
    <strong className={styles.tileValue}>{value}</strong>
    {note ? <span className={styles.tileNote}>{note}</span> : null}
  </div>;
}

export default function Transactions() {
  const m = useT();
  const { locale } = useAppLocale();
  const pl = locale === "pl";
  const [filters, setFilters] = useUrlState({ view: "all", period: "90", direction: "", status: "", type: "", search: "", from: "", to: "", minimum: "", maximum: "", currency: "", personId: "", serviceId: "", offerId: "", subscriptionId: "", planId: "", teamId: "", page: "1", record: "" });
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [more, setMore] = useState(false);
  const search = useDebounced(filters.search);
  const update = (next: Partial<typeof filters>) => setFilters({ ...next, page: "1" });
  const team = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const plans = useCoachingQuery<Schema<"PlatformPlanDto">[]>("/api/v1/subscriptions/plans");
  const view = (["all", "upcoming", "overdue", "completed", "earned", "paid"].includes(filters.view) ? filters.view : "all") as View;
  const start = filters.from || windowStart(filters.period);
  const from = start ? `${start}T00:00:00Z` : undefined;
  const to = filters.to && Number.isFinite(Date.parse(filters.to)) ? new Date(Date.parse(`${filters.to}T00:00:00Z`) + DAY).toISOString() : undefined;
  const page = Math.max(1, Number(filters.page) || 1);
  const open = view === "upcoming" || view === "overdue";
  const summary = useCoachingQuery<Summary>("/api/v1/me/transactions/summary", { from, to, teamId: uuid(filters.teamId) });
  // Open dues ignore the window (an old unpaid due is still due); the other views follow it.
  const query = useCoachingQuery<Page<Transaction>>("/api/v1/me/transactions", {
    page: open ? 1 : page, pageSize: open ? 100 : 25,
    direction: view === "earned" ? "Incoming" : view === "paid" ? "Outgoing" : optional(filters.direction),
    status: open ? "Pending" : view === "completed" || view === "earned" || view === "paid" ? "Succeeded" : optional(filters.status),
    type: optional(filters.type), search: optional(search), from: open ? undefined : from, to: open ? undefined : to,
    minimum: amount(filters.minimum), maximum: amount(filters.maximum), currency: /^[A-Z]{3}$/.test(filters.currency.toUpperCase()) ? filters.currency.toUpperCase() : undefined, personId: uuid(filters.personId), serviceId: uuid(filters.serviceId), offerId: uuid(filters.offerId), subscriptionId: uuid(filters.subscriptionId), planId: optional(filters.planId), teamId: uuid(filters.teamId),
  });
  const rows = (query.data?.items ?? []).filter((row) => view === "overdue" ? row.overdue : view === "upcoming" ? !row.overdue && row.dueAt : true);
  const s = summary.data;
  // A server without the summary endpoint (an older API build) answers 404: the page then shows the list only.
  const noSummary = summary.error instanceof ApiError && summary.error.status === 404;
  // When nothing could be loaded, one error for the whole page (with one retry) instead of one per section.
  const allFailed = query.isError && (summary.isError || noSummary);
  const retryAll = () => { void query.refetch(); if (!noSummary) void summary.refetch(); };
  const periodName = filters.from || filters.to ? (pl ? "Wybrane daty" : "Selected dates") : filters.period === "30" ? (pl ? "Ostatnie 30 dni" : "Last 30 days") : filters.period === "365" ? (pl ? "Ostatnie 12 miesięcy" : "Last 12 months") : filters.period === "all" ? (pl ? "Od początku" : "All time") : (pl ? "Ostatnie 90 dni" : "Last 90 days");
  const overdue = s ? Number(s.overdueIncoming) + Number(s.overdueOutgoing) : 0;
  const currencies = s?.currencies ?? [];
  // Nothing earned, paid or due in the window: one calm message instead of four zero tiles.
  const quiet = Boolean(s) && !overdue && !Number(s!.upcoming) && currencies.every(c => !Number(c.earned) && !Number(c.paid) && !Number(c.toReceive) && !Number(c.toPay));
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const daysLate = (iso: string) => Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / DAY));
  const filtered = Boolean(filters.search || filters.type || filters.from || filters.to || filters.direction || filters.status || filters.minimum || filters.maximum || filters.currency || filters.personId || filters.planId || filters.serviceId || filters.offerId || filters.subscriptionId);
  const recordHref = (id: string) => { const next = new URLSearchParams(params); next.set("record", id); return `?${next}`; };
  const statusBadge = (row: Transaction) => row.overdue ? <Badge tone="danger" size="sm">{pl ? `Zaległe ${daysLate(row.dueAt!)} d` : `${daysLate(row.dueAt!)}d overdue`}</Badge>
    : row.status === "Succeeded" ? <Badge tone="success" size="sm">{pl ? "Rozliczone" : "Settled"}</Badge>
    : row.status === "Pending" ? <Badge tone="warning" size="sm">{row.dueAt ? (pl ? `Termin ${date(row.dueAt)}` : `Due ${date(row.dueAt)}`) : (pl ? "W toku" : "Processing")}</Badge>
    : row.status === "Failed" ? <Badge tone="danger" size="sm">{pl ? "Nieudane" : "Failed"}</Badge>
    : row.status === "Refunded" ? <Badge tone="info" size="sm">{pl ? "Zwrot" : "Refunded"}</Badge>
    : <Badge size="sm">{pl ? "Anulowane" : "Cancelled"}</Badge>;
  const tabs: { id: View; label: string; count?: number; danger?: boolean }[] = [
    { id: "all", label: pl ? "Wszystko" : "All" },
    { id: "upcoming", label: pl ? "Nadchodzące" : "Upcoming", count: s ? Number(s.upcoming) : undefined },
    { id: "overdue", label: pl ? "Zaległe" : "Overdue", count: overdue || undefined, danger: true },
    { id: "completed", label: pl ? "Rozliczone" : "Completed" },
    { id: "earned", label: pl ? "Zarobione" : "Earned" },
    { id: "paid", label: pl ? "Zapłacone" : "Paid" },
  ];

  return <section className={styles.page}>
    <PageHeader title={pl ? "Transakcje" : "Transactions"} description={pl ? "Wszystkie pieniądze w jednym miejscu: co wpłynęło, co zapłaciłeś i co jest do rozliczenia." : "All your money in one place: what came in, what you paid and what is still due."} meta={<Badge size="sm" tone="warning">{pl ? "Płatności symulowane" : "Simulated payments"}</Badge>} />
    {/* Views as section tabs, the same as on Clients and Programs. */}
    <Tabs className={styles.nav} selectedKey={view} onSelectionChange={key => update({ view: String(key) })}>
      <TabList aria-label={pl ? "Widok transakcji" : "Transaction views"}>
        {tabs.map(tab => <Tab key={tab.id} id={tab.id}><span className={styles.tabLabel}>{tab.label}{tab.count ? <span className={styles.tabCount} data-danger={tab.danger || undefined}>{tab.count > 99 ? "99+" : tab.count}</span> : null}</span></Tab>)}
      </TabList>
    </Tabs>

    {allFailed ? <div className={styles.pageError}><Failure error={query.error} retry={retryAll} /></div> : <>
    {noSummary ? null : <>
    <div className={styles.summaryHead}>
      <div>
        <h2 className={styles.summaryTitle}>{pl ? "Twoje pieniądze" : "Your money"} · {periodName}</h2>
        <p className={styles.summarySub}>{pl ? "Ile zarobiłeś i zapłaciłeś w tym okresie oraz co czeka na płatność." : "What you earned and paid in this period, and what is waiting to be paid."}</p>
      </div>
      <SegmentedControl size="sm" aria-label={pl ? "Okres" : "Period"} selectedKeys={[filters.period]} onSelectionChange={keys => update({ period: String([...keys][0] ?? "90"), from: "", to: "" })}>
        <Segment id="30">{pl ? "30 dni" : "30 days"}</Segment><Segment id="90">{pl ? "90 dni" : "90 days"}</Segment><Segment id="365">{pl ? "12 mies." : "12 months"}</Segment><Segment id="all">{pl ? "Wszystko" : "All time"}</Segment>
      </SegmentedControl>
    </div>
    <div className={styles.tiles}>
      {summary.isPending ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="6.5rem" radius="lg" />) : summary.isError ? (
        // Only the summary failed: one quiet line across the tiles, the list below still works.
        <div className={styles.summaryError} role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>{pl ? "Nie udało się wczytać podsumowania." : "The summary couldn't be loaded."} <span className={styles.summaryErrorDetail}>{errorText(m, summary.error)}</span></span>
          <Button size="sm" variant="secondary" onPress={() => void summary.refetch()}>{pl ? "Spróbuj ponownie" : "Try again"}</Button>
        </div>
      ) : quiet ? (
        <div className={styles.emptySummary}>
          <span className={styles.emptyIcon} aria-hidden="true"><Wallet /></span>
          <span className={styles.emptyText}>
            <strong>{filters.period === "all" ? (pl ? "Jeszcze nie ma żadnych pieniędzy" : "No money has moved yet") : (pl ? "Brak ruchu w tym okresie" : "Nothing moved in this period")}</strong>
            <span>{pl ? "Tu zobaczysz wpłaty od klientów, opłaty za plany i płatności, które czekają na termin." : "Payments from clients, what you pay for plans and dues waiting for their date will show up here."}</span>
          </span>
          {filters.period !== "all" ? <Button variant="secondary" size="sm" onPress={() => update({ period: "all", from: "", to: "" })}>{pl ? "Pokaż cały okres" : "Show all time"}</Button> : <LinkButton href="/app/offers" variant="secondary" size="sm">{pl ? "Twoje oferty" : "Your offers"}</LinkButton>}
        </div>
      ) : <>
        <Tile tone="green" icon={ArrowDownLeft} label={pl ? "Zarobione" : "Earned"} value={sums(currencies.map(c => ({ currency: c.currency, value: Number(c.earned) })))} note={pl ? `Po opłatach: ${sums(currencies.map(c => ({ currency: c.currency, value: Number(c.fees) })))}` : `After fees of ${sums(currencies.map(c => ({ currency: c.currency, value: Number(c.fees) })))}`} />
        <Tile tone="blue" icon={ArrowUpRight} label={pl ? "Zapłacone" : "Paid"} value={sums(currencies.map(c => ({ currency: c.currency, value: Number(c.paid) })))} note={pl ? "Plany i usługi trenerów" : "Plans and coaching you bought"} />
        <Tile tone="violet" icon={CalendarClock} label={pl ? "Nadchodzące" : "Upcoming"} value={sums(currencies.map(c => ({ currency: c.currency, value: Number(c.toReceive) + Number(c.toPay) })))} note={s?.nextDueAt ? (pl ? `Najbliższy termin ${date(s.nextDueAt)}` : `Next due ${date(s.nextDueAt)}`) : (pl ? "Nic nie czeka" : "Nothing scheduled")} />
        <Tile tone="rose" icon={AlertTriangle} alert={overdue > 0} label={pl ? "Zaległe" : "Overdue"} value={sums(currencies.map(c => ({ currency: c.currency, value: Number(c.overdueIncoming) + Number(c.overdueOutgoing) })))} note={overdue ? (pl ? `Płatności po terminie: ${overdue}` : `${overdue} ${overdue === 1 ? "payment" : "payments"} past due`) : (pl ? "Wszystko w terminie" : "Everything on time")} />
      </>}
    </div>
    </>}

    <div className={styles.list}>
      <Toolbar aria-label={pl ? "Filtry transakcji" : "Transaction filters"} className={coaching.toolbar}>
        <SearchInput aria-label={pl ? "Szukaj" : "Search"} placeholder={pl ? "Szukaj po nazwie" : "Search by name"} value={filters.search} onChange={search => update({ search })} className={coaching.search} />
        <ResponsiveFilters active={Boolean(filters.type || filters.direction || filters.status)}>
          <Select aria-label={pl ? "Typ" : "Type"} selectedKey={filters.type || "all"} onSelectionChange={key => update({ type: key === "all" ? "" : String(key) })}><Option id="all">{pl ? "Każdy typ" : "All types"}</Option><Option id="CoachingService">{pl ? "Usługi trenerskie" : "Coaching services"}</Option><Option id="CoachingSubscription">{pl ? "Abonament u trenera" : "Coaching subscription"}</Option><Option id="PlatformSubscription">{pl ? "Abonament Metrivum" : "Metrivum subscription"}</Option><Option id="TrainingPlan">{pl ? "Zakup planu treningowego" : "Training plan purchase"}</Option><Option id="Refund">{pl ? "Zwroty" : "Refunds"}</Option><Option id="SubscriptionChange">{pl ? "Zmiany abonamentu" : "Subscription changes"}</Option></Select>
          {view === "all" ? <Select aria-label={pl ? "Kierunek" : "Direction"} selectedKey={filters.direction || "all"} onSelectionChange={key => update({ direction: key === "all" ? "" : String(key) })}><Option id="all">{pl ? "Przychody i wydatki" : "In and out"}</Option><Option id="Incoming">{pl ? "Otrzymane" : "Incoming"}</Option><Option id="Outgoing">{pl ? "Wydane" : "Outgoing"}</Option></Select> : null}
          {view === "all" ? <Select aria-label="Status" selectedKey={filters.status || "all"} onSelectionChange={key => update({ status: key === "all" ? "" : String(key) })}><Option id="all">{pl ? "Każdy status" : "All statuses"}</Option>{["Succeeded", "Pending", "Failed", "Refunded", "Cancelled"].map(value => <Option id={value} key={value}>{value}</Option>)}</Select> : null}
        </ResponsiveFilters>
        <Button variant="ghost" iconEnd={<ChevronDown className={styles.chevron} data-open={more || undefined} />} onPress={() => setMore(value => !value)} aria-expanded={more}>{pl ? "Więcej filtrów" : "More filters"}</Button>
        {filtered ? <Button variant="ghost" onPress={() => { setUsername(""); update({ search: "", type: "", from: "", to: "", direction: "", status: "", minimum: "", maximum: "", currency: "", personId: "", planId: "", serviceId: "", offerId: "", subscriptionId: "" }); }}>{pl ? "Wyczyść" : "Clear"}</Button> : null}
      </Toolbar>
      <div className={styles.moreWrap} data-open={more || undefined} aria-hidden={!more || undefined} inert={!more || undefined}><div className={styles.moreInner}><div className={styles.more}>
        <TextField label={pl ? "Od" : "From"} type="date" value={filters.from} onChange={from => update({ from })} />
        <TextField label={pl ? "Do" : "To"} type="date" value={filters.to} onChange={to => update({ to })} />
        <UserAutocomplete label={pl ? "Klient lub trener" : "Client or coach"} value={username} onChange={name => { setUsername(name); if (!name) update({ personId: "" }); }} onSelect={person => update({ personId: person.userId })} />
        <TextField label={pl ? "Kwota od" : "Minimum amount"} placeholder="0" type="number" value={filters.minimum} onChange={minimum => update({ minimum })} />
        <TextField label={pl ? "Kwota do" : "Maximum amount"} placeholder={pl ? "Bez limitu" : "No limit"} type="number" value={filters.maximum} onChange={maximum => update({ maximum })} />
        <TextField label={pl ? "Waluta" : "Currency"} placeholder="EUR" maxLength={3} value={filters.currency} onChange={currency => update({ currency })} />
        <Select label={pl ? "Plan platformy" : "Platform plan"} placeholder={pl ? "Wszystkie" : "All"} selectedKey={filters.planId || "all"} onSelectionChange={key => update({ planId: key === "all" ? "" : String(key) })}><Option id="all">{pl ? "Wszystkie" : "All"}</Option>{plans.data?.map(plan => <Option key={plan.id} id={plan.id}>{plan.name}</Option>)}</Select>
        {team.data?.isActive && ["Owner", "Admin"].includes(team.data.role) && <Select label={pl ? "Zakres historii" : "History scope"} selectedKey={filters.teamId || "mine"} onSelectionChange={key => update({ teamId: key === "mine" ? "" : String(key) })}><Option id="mine">{pl ? "Moje operacje" : "My transactions"}</Option><Option id={team.data.teamId}>{team.data.name}</Option></Select>}
      </div></div></div>

      {query.isPending ? <Loading /> : query.error ? <Failure error={query.error} retry={() => void query.refetch()} /> : !rows.length ? (
        <EmptyState icon={view === "overdue" ? <RotateCcw /> : <Wallet />}
          title={filtered ? (pl ? "Brak pasujących transakcji" : "No matching transactions") : view === "overdue" ? (pl ? "Brak zaległych płatności" : "No overdue payments") : view === "upcoming" ? (pl ? "Nic nie czeka na płatność" : "Nothing due") : view === "earned" ? (pl ? "Jeszcze nic nie zarobiłeś" : "Nothing earned yet") : view === "paid" ? (pl ? "Jeszcze nic nie zapłaciłeś" : "Nothing paid yet") : (pl ? "Brak transakcji" : "No transactions yet")}
          description={filtered ? (pl ? "Żadna transakcja nie pasuje do filtrów. Zmień je albo wyczyść." : "No transaction matches these filters. Change or clear them.")
            : view === "overdue" ? (pl ? "Wszystkie płatności są w terminie." : "Every payment is on time.")
            : view === "upcoming" ? (pl ? "Gdy klient kupi usługę albo odnowi się abonament, termin pojawi się tutaj." : "When a client buys a service or a subscription renews, the due date shows up here.")
            : view === "paid" ? (pl ? "Tu pojawią się opłaty za plan Metrivum i usługi, które kupisz." : "Your Metrivum plan and services you buy will show up here.")
            : (pl ? "Gdy klient opłaci Twoją ofertę, wpłata pojawi się tutaj razem z opłatą platformy." : "When a client pays for one of your offers, the payment shows up here with the platform fee.")}
          actions={filtered ? <Button onPress={() => { setUsername(""); update({ search: "", type: "", from: "", to: "", direction: "", status: "", minimum: "", maximum: "", currency: "", personId: "", planId: "", serviceId: "", offerId: "", subscriptionId: "" }); }}>{pl ? "Wyczyść filtry" : "Clear filters"}</Button>
            : view === "paid" ? <LinkButton href="/app/subscription">{pl ? "Zobacz plany" : "See plans"}</LinkButton>
            : view === "all" || view === "earned" ? <LinkButton href="/app/offers" variant="primary">{pl ? "Twoje oferty" : "Your offers"}</LinkButton> : undefined} />
      ) : <>
        <DataTable label={pl ? "Transakcje" : "Transactions"} rows={rows} rowKey={row => row.id} rowProps={row => ({ "data-overdue": row.overdue || undefined })} className={styles.table} columns={[
          { id: "name", header: pl ? "Operacja" : "Operation", cell: row => <span className={styles.op}>
            <span className={styles.dir} data-dir={row.direction} data-status={row.status} aria-hidden="true">{row.direction === "Incoming" ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
            <span className={styles.opText}><RouterLink to={recordHref(row.id)} data-row-link className={styles.opName}>{row.name}</RouterLink>
              <span className={styles.opSub}>{row.type === "PlatformSubscription" ? "Metrivum" : row.direction === "Incoming" ? row.clientName || (pl ? "Klient" : "Client") : row.coachName || (pl ? "Trener" : "Coach")}{row.mode === "Simulated" ? <span className={styles.sim}>{pl ? "symulacja" : "simulated"}</span> : null}</span></span>
          </span> },
          { id: "date", header: pl ? "Data" : "Date", width: "9rem", muted: true, hideOnMobile: true, cell: row => date(row.dueAt ?? row.date) },
          { id: "status", header: "Status", width: "10rem", cell: statusBadge },
          { id: "amount", header: pl ? "Kwota" : "Amount", width: "9rem", align: "end", cell: row => <span className={styles.amount} data-dir={row.direction} data-muted={row.status === "Failed" || row.status === "Cancelled" || undefined}>{row.direction === "Incoming" ? "+" : "−"}{money(Number(row.direction === "Incoming" ? row.netAmount : row.grossAmount), row.currency)}</span> },
        ]} />
        {!open && query.data ? <ListPagination data={query.data} onChange={page => setFilters({ page: String(page) })} /> : null}
      </>}
    </div>
    </>}
    {filters.record && <TransactionDetails id={filters.record} teamId={optional(filters.teamId)} close={() => setFilters({ record: "" })} />}
  </section>;
}
