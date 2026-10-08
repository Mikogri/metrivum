import { describe, expect, it } from "vitest";
import { appEn } from "./messages/app.en";
import { appPl } from "./messages/app.pl";
import { publicEn } from "./messages/public.en";
import { publicPl } from "./messages/public.pl";

function keys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keys(item, `${prefix}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe("translations", () => {
  it("Polish app copy has exactly the English keys", () => {
    expect(keys(appPl).sort()).toEqual(keys(appEn).sort());
  });

  it("Polish public copy has exactly the English keys", () => {
    expect(keys(publicPl).sort()).toEqual(keys(publicEn).sort());
  });
});
