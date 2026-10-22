import styles from "./coaching.module.css";

/** One line on a client's card: where the collaboration stands and what to do next. */
export function clientNote(status: string, hasPlan: boolean) {
  if (status === "Suspended") return "Collaboration paused. Resume it from the client page when you are ready.";
  if (status === "Completed") return "Collaboration finished. Their history, documents and check-ins stay available.";
  return hasPlan ? "Training on an assigned plan. Open for check-ins, documents and progress." : "No training plan assigned yet. Open the client to assign one.";
}

/** The assigned plan's status as plain coloured text: no badge, no box. */
export function PlanState({ status }: { status: string }) {
  const tone = status === "Active" ? "success" : ["Paused", "Suspended"].includes(status) ? "warning" : "neutral";
  return <span className={styles.planState} data-tone={tone}>{status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}</span>;
}
