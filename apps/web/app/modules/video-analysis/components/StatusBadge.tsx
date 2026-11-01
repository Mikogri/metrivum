import { Badge, type BadgeTone } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";

const tones: Record<string, BadgeTone> = { Queued: "neutral", Processing: "info", Completed: "success", Failed: "danger", Cancelled: "neutral" };

export function StatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const m = useT();
  return (
    <Badge tone={tones[status] ?? "neutral"} size={size} dot>
      {m.video.statuses[status] ?? status}
    </Badge>
  );
}
