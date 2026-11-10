import { useLocale } from "~/shared/i18n/LocaleContext";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicPageMeta } from "~/shared/i18n/site";
import type { Route } from "./+types/video-analysis";
import { CtaBand } from "../components/CtaBand";
import { PreviewLabel } from "../components/PreviewLabel";
import prose from "../components/Prose.module.css";
import { SubpageHero } from "../components/SubpageHero";
import { VideoDemo } from "../components/home/VideoDemo";
import { useInView } from "../lib/useInView";
import { publicMessages, usePublicMessages } from "../messages";
import styles from "./video-analysis.module.css";

export function meta({ location }: Route.MetaArgs) {
  const locale = localeFromPathname(location.pathname);
  return publicPageMeta({
    ...publicMessages(locale).videoAnalysis.meta,
    pathname: location.pathname,
    locale,
  });
}

function Flow({ steps }: { steps: Array<{ title: string; body: string }> }) {
  const [ref, inView] = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} className={styles.flow} data-inview={inView || undefined}>
      {steps.map((step, i) => (
        <li
          key={step.title}
          className={styles.flowStep}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span className={styles.flowIndex} aria-hidden="true">
            {i + 1}
          </span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default function VideoAnalysis() {
  const m = usePublicMessages();
  const v = m.videoAnalysis;
  const locale = useLocale();
  return (
    <>
      <SubpageHero
        title={v.title}
        lead={v.lead}
        back={{ to: publicPath("features", locale), label: v.eyebrowBack }}
      />

      <section className={styles.flowSection} aria-labelledby="flow">
        <h2 id="flow" className={prose.title}>
          {v.flowTitle}
        </h2>
        <Flow steps={v.flow} />
      </section>

      <section className={prose.section} aria-labelledby="results">
        <div className={prose.heading}>
          <h2 id="results" className={prose.title}>
            {v.resultsTitle}
          </h2>
          <dl className={prose.rows}>
            {v.results.map((row) => (
              <div key={row.label} className={prose.row}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={styles.demo}>
          <PreviewLabel />
          <VideoDemo />
        </div>
      </section>

      <section className={prose.section} aria-labelledby="analyzer">
        <div className={prose.heading}>
          <h2 id="analyzer" className={prose.title}>
            {v.statusTitle}
          </h2>
        </div>
        <div className={prose.callout}>
          <p>{v.statusBody}</p>
        </div>
      </section>

      <section className={prose.section} aria-labelledby="privacy">
        <div className={prose.heading}>
          <h2 id="privacy" className={prose.title}>
            {v.privacyTitle}
          </h2>
        </div>
        <div className={styles.privacy}>
          <p className={prose.text}>{v.privacyBody}</p>
          <p className={prose.note}>{v.limitsNote}</p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
