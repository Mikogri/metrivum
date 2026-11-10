import { usePublicMessages } from "../../messages";
import { RevealHeading } from "../RevealHeading";
import styles from "./Workflow.module.css";

export function Workflow() {
  const m = usePublicMessages();
  const w = m.home.workflow;
  return (
    <section aria-labelledby="workflow-title" className={styles.section}>
      <RevealHeading
        id="workflow-title"
        title={w.title}
        className={styles.title}
      />
      {/* A real sequence, so numbered steps are meaningful here. */}
      <ol className={styles.steps}>
        <span className={styles.track} aria-hidden="true">
          <span className={styles.fill} />
        </span>
        {w.steps.map((step, i) => (
          <li
            key={step.title}
            className={styles.step}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
