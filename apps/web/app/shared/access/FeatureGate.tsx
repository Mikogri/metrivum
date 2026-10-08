import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { FeatureKey } from "@trainflow/api-client-web";
import { EmptyState, Skeleton, Tooltip, TooltipTrigger } from "@trainflow/ui-web";
import { Focusable } from "react-aria-components";
import { useT } from "~/shared/i18n/AppLocale";
import { useFeatureAccess, type FeatureAccess } from "./useFeatureAccess";
import styles from "./FeatureGate.module.css";

export function useFeatureReasonText() {
  const m = useT();
  return (access: FeatureAccess) => m.access.reasons[access.state] ?? m.access.reasons.unknown!;
}

/**
 * Renders children only when the API grants the feature. Otherwise renders `fallback`
 * (default: nothing). The UI gate never replaces the API's own check.
 */
export function FeatureGate({ feature, children, fallback = null }: { feature: FeatureKey; children: ReactNode; fallback?: ReactNode }) {
  const access = useFeatureAccess(feature);
  if (access.pending) return null;
  return <>{access.allowed ? children : fallback}</>;
}

/** Wraps a disabled control with a tooltip explaining why it is unavailable. */
export function LockedReason({ access, children }: { access: FeatureAccess; children: ReactNode }) {
  const reason = useFeatureReasonText();
  if (access.allowed) return <>{children}</>;
  return (
    <TooltipTrigger delay={200}>
      <Focusable>
        <span className={styles.lockedWrap} tabIndex={0} aria-label={reason(access)}>
          {children}
        </span>
      </Focusable>
      <Tooltip>{reason(access)}</Tooltip>
    </TooltipTrigger>
  );
}

/** Route-level guard: a locked feature shows an explanation instead of the screen. */
export function RequireFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const access = useFeatureAccess(feature);
  const m = useT();
  const reason = useFeatureReasonText();
  if (access.pending) {
    return (
      <div className={styles.pending} aria-busy="true">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="12rem" radius="lg" />
      </div>
    );
  }
  if (!access.allowed) {
    const name = m.access.features[feature] ?? feature;
    return <EmptyState icon={<Lock />} title={m.access.lockedTitle(name)} description={reason(access)} />;
  }
  return <>{children}</>;
}
