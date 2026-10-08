import { ArrowRight } from "lucide-react";
import { Link as RouterLink } from "react-router";
import { LinkButton } from "@trainflow/ui-web";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicPageMeta } from "~/shared/i18n/site";
import { useLocale } from "~/shared/i18n/LocaleContext";
import type { Route } from "./+types/home";
import { CtaBand } from "../components/CtaBand";
import { FeatureSection } from "../components/FeatureSection";
import { PageFlow } from "../components/PageFlow";
import { PreviewLabel } from "../components/PreviewLabel";
import { RevealHeading } from "../components/RevealHeading";
import { SplitHeading } from "../components/SplitHeading";
import { CycleMap } from "../components/home/CycleMap";
import { Faq } from "../components/home/Faq";
import { FoldersDemo } from "../components/home/FoldersDemo";
import { FormulaDemo } from "../components/home/FormulaDemo";
import { HeroBurst } from "../components/home/HeroBurst";
import { HeroSheet } from "../components/home/HeroSheet";
import { LibraryDemo } from "../components/home/LibraryDemo";
import { Pricing } from "../components/home/Pricing";
import { SetKinds } from "../components/home/SetKinds";
import { Bento } from "../components/home/Bento";
import { TransferDiagram } from "../components/home/TransferDiagram";
import { VideoDemo } from "../components/home/VideoDemo";
import { Workflow } from "../components/home/Workflow";
import { publicMessages, usePublicMessages } from "../messages";
import { usePublicSession } from "../usePublicSession";
import styles from "./home.module.css";

export function meta({ location }: Route.MetaArgs) {
  const locale = localeFromPathname(location.pathname);
  const m = publicMessages(locale);
  return publicPageMeta({ ...m.home.meta, pathname: location.pathname, locale });
}

export default function Home() {
  const m = usePublicMessages();
  const locale = useLocale();
  const hasSession = usePublicSession();
  const h = m.home;

  return (
    <PageFlow>
      <section className={styles.hero} aria-labelledby="hero-title">
        <HeroBurst />
        <div className={styles.heroCopy}>
          <p className={styles.badge}>
            <span aria-hidden="true" />
            {h.hero.badge}
          </p>
          <SplitHeading id="hero-title" text={h.hero.title} className={styles.heroTitle} accentLast />
          <p className={styles.heroLead}>{h.hero.lead}</p>
          <div className={styles.heroActions}>
            {hasSession ? (
              <LinkButton href="/app/dashboard" variant="primary" size="lg">
                {h.hero.openApp}
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/auth/register" variant="primary" size="lg">
                  {h.hero.primary}
                </LinkButton>
                <LinkButton href="/auth/login" variant="secondary" size="lg">
                  {h.hero.secondary}
                </LinkButton>
              </>
            )}
            <RouterLink to={publicPath("programBuilder", locale)} className={styles.heroLink}>
              {h.hero.tertiary}
              <ArrowRight aria-hidden="true" />
            </RouterLink>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <PreviewLabel className={styles.heroPreview} />
          <HeroSheet flat />
          <p className="tf-visually-hidden">
            {`${h.sheet.program}, ${h.sheet.cycle}, ${h.sheet.day}, ${h.sheet.workout}: ${h.sheet.rows
              .map((row) => `${row.exercise} ${row.set} ${row.reps} ${row.load} ${row.effort}`)
              .join("; ")}.`}
          </p>
        </div>
      </section>

      <span className={styles.flowMark} data-flow="center" data-flow-x="0.97" aria-hidden="true" />
      {/* The product in four facts, set like a scoreboard under the hero. */}
      <dl className={styles.facts}>
        {h.facts.map((fact, i) => (
          <div key={fact.value} style={{ "--i": i } as React.CSSProperties}>
            <dt>{fact.value}</dt>
            <dd>{fact.label}</dd>
          </div>
        ))}
      </dl>
      <span className={styles.flowMark} data-flow="center" data-flow-x="0.04" aria-hidden="true" />

      <section className={styles.features} aria-labelledby="features-title" data-flow="center" data-flow-x="0.95" data-flow-at="0.1">
        <RevealHeading id="features-title" title={h.showcase.title} subtitle={h.showcase.subtitle} className={styles.featuresTitle} />
        <Bento
          tiles={[
            { id: "cycles", span: 7, title: h.cycles.title, body: <p>{h.cycles.body}</p>, visual: <CycleMap /> },
            { id: "formulas", span: 5, title: h.formulas.title, body: <p>{h.formulas.body}</p>, visual: <FormulaDemo /> },
            {
              id: "sets",
              span: 12,
              title: h.sets.title,
              body: (
                <p>
                  {h.sets.body} <strong className={styles.inlineTitle}>{h.sets.groupsTitle}.</strong> {h.sets.groupsBody}
                </p>
              ),
              visual: <SetKinds />,
            },
            { id: "library", span: 6, title: h.library.title, body: <p>{h.library.body}</p>, visual: <LibraryDemo /> },
            { id: "folders", span: 6, title: h.folders.title, body: <p>{h.folders.body}</p>, visual: <FoldersDemo /> },
            { id: "transfer", span: 12, title: h.transfer.title, body: <p>{h.transfer.body}</p>, visual: <TransferDiagram /> },
          ]}
        />
      </section>

      <span className={styles.flowMark} data-flow="center" data-flow-x="0.97" aria-hidden="true" />
      <FeatureSection
        id="video"
        title={h.video.title}
        body={<p>{h.video.body}</p>}
        footer={<p className={styles.honesty}>{h.video.honesty}</p>}
        visual={
          <div className={styles.labelled}>
            <PreviewLabel />
            <VideoDemo />
          </div>
        }
      />
      <span className={styles.flowMark} data-flow="center" data-flow-x="0.96" aria-hidden="true" />
      <Workflow />
      <span className={styles.flowMark} data-flow="center" data-flow-x="0.04" aria-hidden="true" />
      <Pricing />
      <span className={styles.flowMark} data-flow="center" data-flow-x="0.02" aria-hidden="true" />

      <section aria-labelledby="faq-title" className={styles.faq}>
        <RevealHeading id="faq-title" title={h.faq.title} className={styles.faqTitle} />
        <Faq items={h.faq.items} />
      </section>
      <span className={styles.flowMark} data-flow="center" data-flow-x="0.03" aria-hidden="true" />
      {/* The ribbon sweeps behind the final glass panel before leaving the page. */}
      <div data-flow="center" data-flow-x="0.72" data-flow-at="0.45">
        <CtaBand />
      </div>
    </PageFlow>
  );
}
