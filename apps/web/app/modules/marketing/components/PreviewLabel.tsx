import { Eye } from "lucide-react";
import { usePublicMessages } from "../messages";
import styles from "./PreviewLabel.module.css";

/** Every drawn product visual is labelled so nobody mistakes it for live data. */
export function PreviewLabel({ className }: { className?: string }) {
  const m = usePublicMessages();
  return (
    <p
      className={[styles.label, className].filter(Boolean).join(" ")}
      title={m.common.illustrativePreviewNote}
    >
      <Eye aria-hidden="true" />
      <span>{m.common.illustrativePreview}</span>
      <span className="tf-visually-hidden">
        . {m.common.illustrativePreviewNote}
      </span>
    </p>
  );
}
