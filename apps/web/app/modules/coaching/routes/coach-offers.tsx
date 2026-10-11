import { Tag } from "lucide-react";
import { useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, PageHeader, SearchInput, Toolbar } from "@trainflow/ui-web";
import { CardGrid, ListCard } from "~/shared/library/DataView";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading } from "../components";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function CoachOffers() {
  const { coachId } = useParams();
  const [state, update] = useUrlState({ page: "1", q: "" });
  const query = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined });
  return <><PageHeader title="Coach offers" description="Explore this coach's available services and application forms." /><div className={styles.stack}><Toolbar aria-label="Filter offers" className={styles.toolbar}><SearchInput aria-label="Search coach offers" value={state.q} onChange={(q) => update({ q })} placeholder="Search offers" className={styles.search} /></Toolbar>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No available offers" description="This coach has no matching active offers right now." /> : <><CardGrid label="Coach offers">{query.data.items.map((offer) => <ListCard key={offer.offerId} href={`/app/coaches/${coachId}/offers/${offer.offerId}`} title={offer.name} subtitle={offer.teamName ?? undefined} icon={<Tag />} tone="orange" description={offer.description || undefined} facts={[{ label: "Mode", value: offer.coachingMode === "Offline" ? "In person" : offer.coachingMode }, { label: "From", value: offer.billingOptions[0] ? priceDescription(offer.billingOptions[0], offer.currency) : "—" }]} meta={[`${offer.billingOptions.length} ${offer.billingOptions.length === 1 ? "price option" : "price options"}`]} />)}</CardGrid><ListPagination data={query.data} onChange={(page) => update({ page: String(page) })} /></>}
  </div></>;
}
