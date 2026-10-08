import { useT } from "~/shared/i18n/AppLocale";
import { BootSkeleton } from "~/shared/ui/BootSkeleton";

/** Neutral full-screen state while session/profile are resolved. Shows no private data. */
export function BootScreen() {
  const m = useT();
  return <BootSkeleton label={m.common.loading} />;
}
