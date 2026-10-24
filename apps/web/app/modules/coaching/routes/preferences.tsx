import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Coaching preferences — Metrivum");

import { Navigate } from "react-router";

/** Coaching preferences moved into Settings; old links land there. */
export default function Preferences() {
  return <Navigate to="/app/settings?section=coaching" replace />;
}
