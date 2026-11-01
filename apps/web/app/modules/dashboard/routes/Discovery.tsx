import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Compass, Eye, MapPin, Store, UserRound } from "lucide-react";
import { Link as RouterLink } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Badge, Card, LinkButton, Skeleton } from "@metrivum/ui-web";
import { detailsFromValues, profileFieldsKey, useProfile } from "~/modules/accounts";
import { DiscoveryListing, ProEdge, useCoachingQuery, type Page } from "~/modules/coaching";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import styles from "./discovery.module.css";

/** The coach's Discovery presence: the Pro edge, what is left to finish, and the listing itself. */
export function Discovery() {
  const m = useT();
  const t = m.dashboard.discovery;
  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <div>
          <h2 className={styles.topTitle}>{t.presence}</h2>
          <p className={styles.sub}>{t.presenceSub}</p>
        </div>
        <div className={styles.topActions}>
          <ProEdge />
          <LinkButton href="/app/discover" variant="secondary" size="sm" iconStart={<Compass />}>
            {t.browse}
          </LinkButton>
        </div>
      </header>
      <div className={styles.grid}>
        <Readiness />
        <DiscoveryListing defaultOpen />
      </div>
    </div>
  );
}

function Readiness() {
  const t = useT().dashboard.discovery;
  const profile = useProfile();
  const api = useApi();
  const account = useAccountKey();
  const fields = useQuery({
    queryKey: profileFieldsKey(account),
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  const offers = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${profile.id}/offers`, { page: 1, pageSize: 1 });
  const details = detailsFromValues(fields.data?.values as Record<string, unknown> | undefined);
  const items = [
    { id: "location", tone: "blue", icon: MapPin, done: Boolean(details.Country && details.City.trim()), title: t.location, body: t.locationBody, href: "/app/settings?section=body" },
    { id: "bio", tone: "violet", icon: UserRound, done: Boolean(profile.bio?.trim()), title: t.bio, body: t.bioBody, href: "/app/profile" },
    { id: "offers", tone: "orange", icon: Store, done: Number(offers.data?.total ?? 0) > 0, title: t.offers, body: t.offersBody, href: "/app/offers" },
  ];
  const loading = fields.isPending || offers.isPending;
  const done = items.filter((item) => item.done).length;
  return (
    <Card as="section" padding="none" aria-labelledby="discovery-ready" className={styles.card}>
      <header className={styles.head}>
        <div>
          <h2 id="discovery-ready" className={styles.title}>{t.readyTitle}</h2>
          <p className={styles.sub}>{t.readySub}</p>
        </div>
        {loading ? <Skeleton width="3rem" height="1.5rem" /> : <span className={styles.score} data-complete={done === items.length || undefined}>{done}/{items.length}</span>}
      </header>
      <div className={styles.progress}>
        <span className={styles.bar} aria-hidden="true">
          <span style={{ transform: `scaleX(${loading ? 0 : done / items.length})` }} />
        </span>
        <span className={styles.note}>{loading ? "" : t.progress(done, items.length)}</span>
      </div>
      <ul className={styles.checklist}>
        {items.map((item) => {
          const Icon = item.icon;
          const ready = !loading && item.done;
          return (
            <li key={item.id} data-done={ready || undefined} data-tone={item.tone}>
              <span className={styles.itemIcon} aria-hidden="true">{ready ? <Check /> : <Icon />}</span>
              <span className={styles.itemText}>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </span>
              {loading ? (
                <Skeleton width="4rem" height="1.25rem" />
              ) : item.done ? (
                <Badge tone="success" size="sm">{t.done}</Badge>
              ) : (
                <RouterLink to={item.href} className={styles.fix}>
                  {t.fix}
                  <ArrowRight aria-hidden="true" />
                </RouterLink>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.footer}>
        <LinkButton href={`/app/coaches/${profile.id}/offers`} size="sm" variant="ghost" iconStart={<Eye />}>
          {t.preview}
        </LinkButton>
      </div>
    </Card>
  );
}
