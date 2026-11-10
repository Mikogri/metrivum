import { Lock, PencilLine } from "lucide-react";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicPageMeta } from "~/shared/i18n/site";
import type { Route } from "./+types/program-builder";
import { CtaBand } from "../components/CtaBand";
import prose from "../components/Prose.module.css";
import { SubpageHero } from "../components/SubpageHero";
import { SetKinds } from "../components/home/SetKinds";
import { useInView } from "../lib/useInView";
import { publicMessages, usePublicMessages } from "../messages";
import styles from "./program-builder.module.css";

export function meta({ location }: Route.MetaArgs) {
  const locale = localeFromPathname(location.pathname);
  return publicPageMeta({
    ...publicMessages(locale).programBuilder.meta,
    pathname: location.pathname,
    locale,
  });
}

function StructureLadder({
  items,
}: {
  items: Array<{ name: string; note: string }>;
}) {
  const [ref, inView] = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} className={styles.ladder} data-inview={inView || undefined}>
      {items.map((item, i) => (
        <li
          key={item.name}
          style={{ "--i": i } as React.CSSProperties}
          className={styles.rung}
        >
          <span className={styles.rungName}>{item.name}</span>
          <span className={styles.rungNote}>{item.note}</span>
        </li>
      ))}
    </ol>
  );
}

function RevisionStrip({ draftLabel }: { draftLabel: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={styles.revisions}
      data-inview={inView || undefined}
      aria-hidden="true"
    >
      {["R1", "R2", "R3"].map((label, i) => (
        <span
          key={label}
          className={styles.revision}
          style={{ "--i": i } as React.CSSProperties}
        >
          <Lock />
          {label}
        </span>
      ))}
      <span className={styles.draft}>
        <PencilLine />
        {draftLabel}
      </span>
    </div>
  );
}

export default function ProgramBuilder() {
  const m = usePublicMessages();
  const p = m.programBuilder;
  const locale = useLocale();
  return (
    <>
      <SubpageHero
        title={p.title}
        lead={p.lead}
        back={{ to: publicPath("features", locale), label: p.eyebrowBack }}
      />

      <section className={prose.section} aria-labelledby="structure">
        <div className={prose.heading}>
          <h2 id="structure" className={prose.title}>
            {p.structureTitle}
          </h2>
          <p className={prose.text}>{p.structureBody}</p>
        </div>
        <StructureLadder items={p.structure} />
      </section>

      <section className={prose.section} aria-labelledby="prescription">
        <div className={prose.heading}>
          <h2 id="prescription" className={prose.title}>
            {p.prescriptionTitle}
          </h2>
        </div>
        <dl className={prose.rows}>
          {p.prescription.map((row) => (
            <div key={row.label} className={prose.row}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.setsSection} aria-labelledby="set-kinds">
        <h2 id="set-kinds" className={prose.title}>
          {m.home.sets.title}
        </h2>
        <p className={prose.text}>{m.home.sets.body}</p>
        <SetKinds />
      </section>

      <section className={prose.section} aria-labelledby="editor">
        <div className={prose.heading}>
          <h2 id="editor" className={prose.title}>
            {p.editorTitle}
          </h2>
        </div>
        <dl className={styles.editorList}>
          {p.editor.map((item) => (
            <div key={item.title}>
              <dt>{item.title}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={prose.section} aria-labelledby="revisions">
        <div className={prose.heading}>
          <h2 id="revisions" className={prose.title}>
            {p.revisionsTitle}
          </h2>
        </div>
        <div className={styles.revisionCopy}>
          <p className={prose.text}>{p.revisionsBody}</p>
          <RevisionStrip draftLabel={p.draftLabel} />
        </div>
      </section>

      <section className={prose.section} aria-labelledby="files">
        <div className={prose.heading}>
          <h2 id="files" className={prose.title}>
            {p.filesTitle}
          </h2>
        </div>
        <p className={prose.text}>{p.filesBody}</p>
      </section>
      <CtaBand />
    </>
  );
}
