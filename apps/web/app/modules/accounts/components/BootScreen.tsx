import { useLocation } from "react-router";
import { useT } from "~/shared/i18n/AppLocale";
import {
  AuthBootSkeleton,
  BootSkeleton,
  authCardFor,
} from "~/shared/ui/BootSkeleton";

/** Neutral full-screen state while session/profile are resolved. Shows no private data. Sign-in pages keep their card shape. */
export function BootScreen() {
  const m = useT();
  const shape = authCardFor(useLocation().pathname);
  return shape.auth ? (
    <AuthBootSkeleton label={m.common.loading} width={shape.width} />
  ) : (
    <BootSkeleton label={m.common.loading} />
  );
}
