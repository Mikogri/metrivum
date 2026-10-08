import { Navigate } from "react-router";

/** Coaching preferences moved into Settings; old links land there. */
export default function Preferences() {
  return <Navigate to="/app/settings?section=coaching" replace />;
}
