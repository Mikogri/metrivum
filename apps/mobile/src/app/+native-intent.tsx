import { nativeIntentPath } from "../infrastructure/networking/native-intent";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return nativeIntentPath(path);
}
