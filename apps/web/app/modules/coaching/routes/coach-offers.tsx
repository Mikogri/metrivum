import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Coach offers — Metrivum");

import { Tag } from "lucide-react";
import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { EmptyState, PageHeader, SearchInput, Toolbar } from "@metrivum/ui-web";
import { CardGrid, ListCard } from "~/shared/library/DataView";
import { CategoryTag, categoryTone } from "../offer-category";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading } from "../components";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function CoachOffers() {
  const uiCopy = useUiCopy();

  const { coachId } = useParams();
  const [state, update] = useUrlState({ page: "1", q: "" });
  const query = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined });
  return <><PageHeader title={uiCopy["ui"]["Coach offers"]} description={uiCopy["ui"]["Explore this coach's available services and application forms."]} /><div className={styles.stack}><Toolbar aria-label={uiCopy["ui"]["Filter offers"]} className={styles.toolbar}><SearchInput aria-label={uiCopy["ui"]["Search coach offers"]} value={state.q} onChange={(q) => update({ q })} placeholder={uiCopy["ui"]["Search offers"]} className={styles.search} /></Toolbar>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title={uiCopy["ui"]["No available offers"]} description={uiCopy["ui"]["This coach has no matching active offers right now."]} /> : <><CardGrid label={uiCopy["ui"]["Coach offers"]}>{query.data.items.map((offer) => <ListCard key={offer.offerId} href={`/app/coaches/${coachId}/offers/${offer.offerId}`} title={offer.name} subtitle={offer.teamName ?? undefined} icon={<Tag />} tone={categoryTone(offer.category)} description={offer.description || uiCopy["ui"]["The coach has not described this offer yet. Open it to see the terms and prices."]} meta={[<CategoryTag key="type" category={offer.category} />, offer.coachingMode === "Offline" ? "In person" : offer.coachingMode, offer.billingOptions[0] ? priceDescription(offer.billingOptions[0], offer.currency) : "No price"]} />)}</CardGrid><ListPagination data={query.data} onChange={(page) => update({ page: String(page) })} /></>}
  </div></>;
}
