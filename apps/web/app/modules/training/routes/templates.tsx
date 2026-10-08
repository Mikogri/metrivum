import { RequireFeature } from "~/shared/access";
import { LibraryScreen } from "../library/LibraryScreen";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Templates — TrainFlow");

export default function TemplatesRoute() {
  return (
    <RequireFeature feature="training.programs.read">
      <LibraryScreen kind="Template" key="Template" />
    </RequireFeature>
  );
}
