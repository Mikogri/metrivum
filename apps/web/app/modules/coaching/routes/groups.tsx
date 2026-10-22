import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Groups — TrainFlow");

import { RequireFeature } from "~/shared/access";
import { Groups } from "./clients";
export default function GroupsRoute() { return <RequireFeature feature="coaching.groups.manage"><Groups /></RequireFeature>; }
