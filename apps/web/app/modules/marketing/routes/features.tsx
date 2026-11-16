import { ArrowRight } from "lucide-react";
import { LinkButton } from "@portable-ui/react";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicPageMeta } from "~/shared/i18n/site";
import type { Route } from "./+types/features";
import { CtaBand } from "../components/CtaBand";
import prose from "../components/Prose.module.css";
import { SubpageHero } from "../components/SubpageHero";
import { useInView } from "../lib/useInView";
import { publicMessages, usePublicMessages } from "../messages";
import styles from "./features.module.css";

export function meta({ location }: Route.MetaArgs) {
  const locale = localeFromPathname(location.pathname);
  return publicPageMeta({
    ...publicMessages(locale).features.meta,
    pathname: location.pathname,
    locale,
  });
}

function Group({
  index,
  title,
  items,
}: {
  index: number;
  title: string;
  items: string[];
}) {
  const [ref, inView] = useInView<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className={styles.group}
      data-inview={inView || undefined}
      style={{ "--i": index } as React.CSSProperties}
    >
      <h2 className={styles.groupTitle}>{title}</h2>
      <ul className={prose.bullets}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </li>
  );
}

export default function Features() {
  const m = usePublicMessages();
  const f = m.features;
  const locale = useLocale();
  return (
    <>
      <SubpageHero title={f.title} lead={f.lead} />
      <div className={styles.wrap}>
        <ul role="list" className={styles.groups}>
          {f.groups.map((group, i) => (
            <Group
              key={group.id}
              index={i}
              title={group.title}
              items={group.items}
            />
          ))}
        </ul>
        <div className={styles.details}>
          <LinkButton
            href={publicPath("programBuilder", locale)}
            variant="secondary"
            size="lg"
            iconEnd={<ArrowRight />}
          >
            {f.detailLinks.programBuilder}
          </LinkButton>
          <LinkButton
            href={publicPath("videoAnalysis", locale)}
            variant="secondary"
            size="lg"
            iconEnd={<ArrowRight />}
          >
            {f.detailLinks.videoAnalysis}
          </LinkButton>
        </div>
        <section className={styles.scope} aria-labelledby="scope-title">
          <h2 id="scope-title" className={styles.scopeTitle}>
            {f.scopeTitle}
          </h2>
          <p>{f.scopeBody}</p>
        </section>
      </div>
      <CtaBand />
    </>
  );
}
