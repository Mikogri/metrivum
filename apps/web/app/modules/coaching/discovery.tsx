import {
  ArrowRight,
  ChevronDown,
  Globe,
  MapPin,
  MonitorSmartphone,
  Sparkles,
  Store,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  LinkButton,
  Option,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TextField,
} from "@metrivum/ui-web";
import { useProfile } from "~/modules/accounts";
import { useFeatureAccess } from "~/shared/access";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useDebounced } from "~/shared/lib/useDebounced";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery } from "./api";
import {
  SpecializationPicker,
  SpecializationBadges,
  CoachSpecializationsCard,
} from "./specializations";
import { Failure, Loading, MutationError } from "./components";
import styles from "./discovery.module.css";

type Listing = Schema<"DiscoveryProfileDto">;
type Coach = Schema<"DiscoveredCoachDto">;
type DiscoveryPage = Schema<"CoachDiscoveryPage">;
const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The Pro edge in Discovery, for page headers: Pro, Team and Studio coaches are listed first. Coaches who already have
 * it see that it is on; others get a link to the plans.
 */
export function ProEdge() {
  const t = useT().discovery;
  const priority = useFeatureAccess("discovery.ranking.priority");
  if (priority.pending) return null;
  if (priority.allowed)
    return (
      <span
        className={styles.edge}
        data-on=""
        title={`${t.proOnBody} ${t.proNote}`}
      >
        <Sparkles aria-hidden="true" />
        {t.proOn}
      </span>
    );
  return (
    <RouterLink
      to="/app/subscription"
      className={styles.edge}
      title={`${t.proBody} ${t.proNote}`}
    >
      <Sparkles aria-hidden="true" />
      {t.proTitle}
      <ArrowRight aria-hidden="true" className={styles.edgeArrow} />
    </RouterLink>
  );
}

/** The coach's own listing: a header with its state that opens into the editor. */
export function DiscoveryListing({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const t = useT().discovery;
  const listing = useCoachingQuery<Listing>("/api/v1/me/discovery");
  return (
    <Card padding="none" className={styles.listingCard}>
      <details open={defaultOpen || undefined}>
        <summary className={styles.summary}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <Store />
          </span>
          <span className={styles.summaryText}>
            <strong>{t.manage}</strong>
            <small>{t.listingSub}</small>
          </span>
          {listing.data ? (
            <Badge
              tone={listing.data.published ? "success" : "neutral"}
              size="sm"
            >
              {listing.data.published ? t.statusPublished : t.statusPrivate}
            </Badge>
          ) : null}
          <ChevronDown aria-hidden="true" className={styles.chevron} />
        </summary>
        <div className={styles.listingBody}>
          <CoachSpecializationsCard editable initialEditing />
          {listing.isPending ? (
            <Loading />
          ) : listing.isError ? (
            <Failure error={listing.error} retry={listing.refetch} />
          ) : (
            <ListingEditor key={listing.data.version} listing={listing.data} />
          )}
        </div>
      </details>
    </Card>
  );
}

function ListingEditor({ listing }: { listing: Listing }) {
  const t = useT().discovery;
  const [published, setPublished] = useState(listing.published);
  const [languages, setLanguages] = useState(listing.languages.join(", "));
  const [modes, setModes] = useState(listing.modes);
  const [location, setLocation] = useState(listing.location ?? "");
  const mutation = useCoachingMutation<Listing>();
  function save(publish: boolean) {
    mutation.mutate({
      path: "/api/v1/me/discovery",
      method: "PUT",
      json: {
        published: publish,
        specializations: listing.specializations,
        languages: split(languages),
        modes,
        location,
        version: listing.version,
      },
    });
  }
  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        save(published);
      }}
    >
      <Checkbox isSelected={published} onChange={setPublished}>
        {t.publish}
      </Checkbox>
      <div className={styles.fields}>
        <TextField
          label={t.language}
          description={t.languagesHint}
          value={languages}
          onChange={setLanguages}
          maxLength={410}
        />
        <TextField
          label={t.location}
          description={t.locationHint}
          value={location}
          onChange={setLocation}
          maxLength={160}
        />
      </div>
      <fieldset className={styles.modes}>
        <legend>{t.mode}</legend>
        <div className={styles.modeOptions}>
          {(["Online", "Offline", "Hybrid"] as const).map((mode) => (
            <Checkbox
              key={mode}
              isSelected={modes.includes(mode)}
              onChange={(selected) =>
                setModes((previous) =>
                  selected
                    ? [...previous, mode]
                    : previous.filter((value) => value !== mode),
                )
              }
            >
              {mode === "Online"
                ? t.online
                : mode === "Offline"
                  ? t.offline
                  : t.hybrid}
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <p className={styles.notice}>{t.privacy}</p>
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" isPending={mutation.isPending}>
          {t.save}
        </Button>
        {listing.published && (
          <Button isDisabled={mutation.isPending} onPress={() => save(false)}>
            {t.withdraw}
          </Button>
        )}
        <LinkButton href="/app/profile" variant="ghost">
          {t.editProfile}
        </LinkButton>
      </div>
      {mutation.isSuccess && (
        <p role="status" className={styles.success}>
          {t.saved}
        </p>
      )}
      <MutationError error={mutation.error} />
    </form>
  );
}

const EMPTY = {
  q: "",
  specialization: "",
  specializations: "",
  language: "",
  location: "",
  mode: "",
  hasOffers: "",
  offerCategory: "",
  page: "1",
};

export function DiscoverCoaches() {
  const t = useT().discovery;
  const profile = useProfile();
  const { mode } = useWorkspace();
  const [filters, update] = useUrlState(EMPTY);
  const textFilters = useDebounced(
    useMemo(
      () => ({
        search: filters.q || undefined,
        language: filters.language || undefined,
        location: filters.location || undefined,
        offerCategory: filters.offerCategory || undefined,
      }),
      [filters.q, filters.language, filters.location, filters.offerCategory],
    ),
  );
  const list = useCoachingQuery<DiscoveryPage>("/api/v1/discovery/coaches", {
    ...textFilters,
    specialization: filters.specialization || undefined,
    specializations: filters.specializations || undefined,
    mode: filters.mode || undefined,
    hasOffers: filters.hasOffers === "1",
    page: pageFromParam(filters.page),
    pageSize: 18,
  });
  const coach = profile.roles.includes("Coach") && mode === "coach";
  const filtered = Object.entries(filters).some(
    ([key, value]) => key !== "page" && value,
  );
  return (
    <div className={styles.page}>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={coach ? <ProEdge /> : undefined}
      />
      {coach && <DiscoveryListing />}
      <Card padding="none" className={styles.filterCard}>
        <div role="search" aria-label={t.filters}>
          <div className={styles.searchRow}>
            <SearchInput
              aria-label={t.search}
              placeholder={t.search}
              value={filters.q}
              onChange={(q) => update({ q, page: "1" })}
            />
          </div>
          <div className={styles.filters}>
            <TextField
              label={t.language}
              placeholder="en, pl…"
              value={filters.language}
              onChange={(language) => update({ language, page: "1" })}
              maxLength={40}
            />
            <TextField
              label={t.location}
              value={filters.location}
              onChange={(location) => update({ location, page: "1" })}
              maxLength={160}
            />
            <Select
              label={t.mode}
              selectedKey={filters.mode || "all"}
              onSelectionChange={(key) =>
                update({ mode: key === "all" ? "" : String(key), page: "1" })
              }
            >
              <Option id="all">{t.allModes}</Option>
              <Option id="Online">{t.online}</Option>
              <Option id="Offline">{t.offline}</Option>
              <Option id="Hybrid">{t.hybrid}</Option>
            </Select>
            <TextField
              label={t.category}
              value={filters.offerCategory}
              onChange={(offerCategory) => update({ offerCategory, page: "1" })}
              maxLength={60}
            />
          </div>
          <details className={styles.specializationFilter}>
            <summary>{t.specialization}</summary>
            <SpecializationPicker
              filter
              value={{
                selectedCodes: split(filters.specializations),
                primaryCodes: [],
              }}
              onChange={(next) =>
                update({
                  specializations: next.selectedCodes.join(","),
                  specialization: "",
                  page: "1",
                })
              }
            />
          </details>
          <div className={styles.filterFoot}>
            <Checkbox
              isSelected={filters.hasOffers === "1"}
              onChange={(checked) =>
                update({ hasOffers: checked ? "1" : "", page: "1" })
              }
            >
              {t.hasOffers}
            </Checkbox>
            {list.data ? (
              <span className={styles.count}>
                {t.results(Number(list.data.total))}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              isDisabled={!filtered}
              onPress={() => update(EMPTY)}
            >
              {t.clear}
            </Button>
          </div>
        </div>
      </Card>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Failure error={list.error} retry={list.refetch} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyBody} />
      ) : (
        <>
          <section className={styles.listing} aria-label={t.other}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{t.other}</h2>
              <p className={styles.sectionSub}>{t.priority}</p>
            </header>
            <div className={styles.grid}>
              {list.data.items.map((item) => (
                <CoachCard key={item.coachId} coach={item} />
              ))}
            </div>
          </section>
          <Pagination
            page={list.data.page}
            pageCount={Math.max(
              1,
              Math.ceil(list.data.total / list.data.pageSize),
            )}
            onPageChange={(page) => update({ page: String(page) })}
            labels={{
              previous: t.previous,
              next: t.next,
              status: t.page,
              navigation: t.pagination,
            }}
          />
        </>
      )}
    </div>
  );
}

function CoachCard({ coach }: { coach: Coach }) {
  const t = useT().discovery;
  const { locale } = useAppLocale();
  const modes = coach.modes
    .map((mode) =>
      mode === "Online" ? t.online : mode === "Offline" ? t.offline : t.hybrid,
    )
    .join(" · ");
  return (
    <article
      className={styles.card}
      data-featured={coach.featured || undefined}
    >
      <div className={styles.person}>
        <Avatar name={coach.displayName} size="lg" decorative />
        <div className={styles.personText}>
          <h3 className={styles.name}>{coach.displayName}</h3>
          <p className={styles.muted}>@{coach.username}</p>
        </div>
        {coach.featured && (
          <span className={styles.featuredTag}>
            <Sparkles aria-hidden="true" />
            {t.badge}
          </span>
        )}
      </div>
      {coach.bio && <p className={styles.bio}>{coach.bio}</p>}
      <SpecializationBadges selections={coach.specializationSelections} />
      <ul className={styles.facts}>
        {coach.location ? (
          <li>
            <MapPin aria-hidden="true" />
            {coach.location}
          </li>
        ) : null}
        {modes ? (
          <li>
            <MonitorSmartphone aria-hidden="true" />
            {modes}
          </li>
        ) : null}
        {coach.languages.length ? (
          <li>
            <Globe aria-hidden="true" />
            {coach.languages.join(", ").toUpperCase()}
          </li>
        ) : null}
      </ul>
      {coach.offer && (
        <div className={styles.offer} title={t.offerPrice}>
          <span>{coach.offer.name}</span>
          <strong>
            {t.from}{" "}
            {new Intl.NumberFormat(locale, {
              style: "currency",
              currency: coach.offer.currency,
            }).format(Number(coach.offer.minimumPrice))}
          </strong>
        </div>
      )}
      <div className={styles.actions}>
        <LinkButton
          href={`/app/people/${encodeURIComponent(coach.username)}`}
          variant="primary"
          size="sm"
        >
          {t.profile}
        </LinkButton>
        <LinkButton
          href={`/app/coaches/${coach.coachId}/offers`}
          size="sm"
          variant="secondary"
        >
          {t.offers}
        </LinkButton>
      </div>
    </article>
  );
}
