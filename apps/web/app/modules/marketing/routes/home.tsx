import { LightRays } from "~/shared/ui/effects/LightRays";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { LinkButton } from "@metrivum/ui-web";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicPageMeta } from "~/shared/i18n/site";
import { useLocale } from "~/shared/i18n/LocaleContext";
import type { Route } from "./+types/home";
import { CtaBand } from "../components/CtaBand";
import { PreviewLabel } from "../components/PreviewLabel";
import { CycleMap } from "../components/home/CycleMap";
import { Faq } from "../components/home/Faq";
import { Figure } from "../components/home/Figures";
import { FoldersDemo } from "../components/home/FoldersDemo";
import { FormulaDemo } from "../components/home/FormulaDemo";
import { HeroSheet } from "../components/home/HeroSheet";
import { LibraryDemo } from "../components/home/LibraryDemo";
import { Pricing } from "../components/home/Pricing";
import { SetKinds } from "../components/home/SetKinds";
import { TransferDiagram } from "../components/home/TransferDiagram";
import { VideoDemo } from "../components/home/VideoDemo";
import { publicMessages, usePublicMessages } from "../messages";
import { usePublicSession } from "../usePublicSession";
import styles from "./home.module.css";

export function meta({ location }: Route.MetaArgs) {
  const locale = localeFromPathname(location.pathname);
  const m = publicMessages(locale);
  return publicPageMeta({
    ...m.home.meta,
    pathname: location.pathname,
    locale,
  });
}

interface Part {
  title: string;
  body: ReactNode;
  visual: ReactNode;
  /** Takes the full width of the stage instead of one column. */
  wide?: boolean;
}

/**
 * One numbered chapter of the page: the claim on the left, what it means on the right, then the
 * product drawn below with a numbered note under each visual.
 */
function Chapter({
  id,
  index,
  title,
  lead,
  link,
  parts,
  footer,
}: {
  id: string;
  index: number;
  title: string;
  lead: string;
  link?: { to: string; label: string };
  parts: Part[];
  footer?: ReactNode;
}) {
  return (
    <section id={id} className={styles.chapter} aria-labelledby={`${id}-title`}>
      <header className={styles.chapterHead}>
        <h2 id={`${id}-title`} className={styles.chapterTitle}>
          {title}
        </h2>
        <div className={styles.chapterLead}>
          <p>{lead}</p>
          {link ? (
            <RouterLink to={link.to} className={styles.more}>
              {link.label}
              <ArrowRight aria-hidden="true" />
            </RouterLink>
          ) : null}
        </div>
      </header>
      <div className={styles.stage}>
        <PreviewLabel className={styles.stageLabel} />
        {parts.map((part, i) => (
          <article
            key={part.title}
            className={styles.part}
            data-wide={part.wide || undefined}
          >
            <div className={styles.partVisual}>{part.visual}</div>
            <div className={styles.partNote}>
              <span className={styles.partIndex} aria-hidden="true">
                {index}.{i + 1}
              </span>
              <h3>{part.title}</h3>
              <div className={styles.partBody}>{part.body}</div>
            </div>
          </article>
        ))}
      </div>
      {footer}
    </section>
  );
}

export default function Home() {
  const m = usePublicMessages();
  const locale = useLocale();
  const hasSession = usePublicSession();
  const h = m.home;
  const l = h.landing;

  const actions = hasSession ? (
    <LinkButton href="/app/dashboard" variant="primary" size="md">
      {h.hero.openApp}
    </LinkButton>
  ) : (
    <>
      <LinkButton href="/auth/register" variant="primary" size="md">
        {h.hero.primary}
      </LinkButton>
      <LinkButton href="/auth/login" variant="secondary" size="md">
        {h.hero.secondary}
      </LinkButton>
    </>
  );

  return (
    <>
      {/* Keep the decorative layer outside the clipped page so light can cross the header. */}
      {/* React Bits "Light Rays": soft neutral white from the top; it does not react to the pointer. */}
      <LightRays
        className={styles.rays}
        raysColor="#ffffff"
        lightSpread={0.8}
        rayLength={1.3}
        intensity={0.65}
        glow={0.3}
        haze={0.2}
        atmosphere={0}
        saturation={0}
        raysSpeed={0.45}
        followMouse={false}
        cursorShadow={false}
        clickPulse={false}
        opacity={0.8}
      />
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.badge}>
              <span aria-hidden="true" />
              {h.hero.badge}
            </p>
            <h1 id="hero-title" className={styles.heroTitle}>
              {h.hero.title}
            </h1>
            <div className={styles.heroRow}>
              <p className={styles.heroLead}>{h.hero.lead}</p>
              <RouterLink
                to={publicPath("videoAnalysis", locale)}
                className={styles.heroNote}
              >
                <span>{l.heroNoteLabel}</span>
                {l.heroNote}
                <ArrowRight aria-hidden="true" />
              </RouterLink>
            </div>
            <div className={styles.heroActions}>{actions}</div>
          </div>
          <div className={styles.heroStage}>
            <PreviewLabel className={styles.heroPreview} />
            <div className={styles.heroWindow}>
              <HeroSheet flat />
            </div>
            <p className="tf-visually-hidden">
              {`${h.sheet.program}, ${h.sheet.cycle}, ${h.sheet.day}, ${h.sheet.workout}: ${h.sheet.rows
                .map(
                  (row) =>
                    `${row.exercise} ${row.set} ${row.reps} ${row.load} ${row.effort}`,
                )
                .join("; ")}.`}
            </p>
          </div>
        </section>

        {/* The product in four facts, where a customer logo row would otherwise sit. */}
        <dl className={styles.facts}>
          {h.facts.map((fact) => (
            <div key={fact.value}>
              <dt>{fact.value}</dt>
              <dd>{fact.label}</dd>
            </div>
          ))}
        </dl>

        <section className={styles.statement} aria-labelledby="statement-title">
          <h2 id="statement-title" className={styles.statementText}>
            <strong>{l.statement.lead}</strong> {l.statement.rest}
          </h2>
          <div className={styles.pillars}>
            {l.pillars.map((pillar, i) => (
              <article key={pillar.title} className={styles.pillar}>
                <Figure
                  kind={(["cycle", "sets", "files"] as const)[i] ?? "cycle"}
                />
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        <Chapter
          id="structure"
          index={1}
          title={l.chapters.structure.title}
          lead={l.chapters.structure.lead}
          link={{
            to: publicPath("programBuilder", locale),
            label: h.hero.tertiary,
          }}
          parts={[
            {
              title: h.cycles.title,
              body: <p>{h.cycles.body}</p>,
              visual: <CycleMap />,
            },
            {
              title: h.folders.title,
              body: <p>{h.folders.body}</p>,
              visual: <FoldersDemo />,
            },
          ]}
        />

        <Chapter
          id="sets"
          index={2}
          title={l.chapters.sets.title}
          lead={l.chapters.sets.lead}
          link={{
            to: publicPath("features", locale),
            label: m.common.learnMore,
          }}
          parts={[
            {
              title: h.sets.title,
              wide: true,
              body: (
                <p>
                  {h.sets.body} <strong>{h.sets.groupsTitle}.</strong>{" "}
                  {h.sets.groupsBody}
                </p>
              ),
              visual: <SetKinds />,
            },
            {
              title: h.formulas.title,
              body: <p>{h.formulas.body}</p>,
              visual: <FormulaDemo />,
            },
            {
              title: h.library.title,
              body: <p>{h.library.body}</p>,
              visual: <LibraryDemo />,
            },
          ]}
        />

        <Chapter
          id="files"
          index={3}
          title={l.chapters.files.title}
          lead={l.chapters.files.lead}
          parts={[
            {
              title: h.transfer.title,
              wide: true,
              body: <p>{h.transfer.body}</p>,
              visual: <TransferDiagram />,
            },
          ]}
        />

        <Chapter
          id="video"
          index={4}
          title={l.chapters.video.title}
          lead={l.chapters.video.lead}
          link={{
            to: publicPath("videoAnalysis", locale),
            label: m.common.learnMore,
          }}
          parts={[
            {
              title: h.video.title,
              wide: true,
              body: <p>{h.video.body}</p>,
              visual: <VideoDemo />,
            },
          ]}
          footer={<p className={styles.honesty}>{h.video.honesty}</p>}
        />

        {/* A real sequence, so numbered steps are meaningful here. */}
        <section className={styles.steps} aria-labelledby="workflow-title">
          <h2 id="workflow-title" className={styles.stepsTitle}>
            {h.workflow.title}
          </h2>
          <ol className={styles.stepList}>
            {h.workflow.steps.map((step, i) => (
              <li key={step.title}>
                <span className={styles.stepIndex} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <Pricing />

        <section aria-labelledby="faq-title" className={styles.faq}>
          <h2 id="faq-title" className={styles.chapterTitle}>
            {h.faq.title}
          </h2>
          <Faq items={h.faq.items} />
        </section>

        <CtaBand />
      </div>
    </>
  );
}
