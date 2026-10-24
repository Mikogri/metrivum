import { RequireFeature } from "~/shared/access";
import { LibraryScreen } from "../library/LibraryScreen";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Programs — Metrivum");

export default function ProgramsRoute() {
  return (
    <RequireFeature feature="training.programs.read">
      <LibraryScreen kind="Program" key="Program" />
    </RequireFeature>
  );
}
