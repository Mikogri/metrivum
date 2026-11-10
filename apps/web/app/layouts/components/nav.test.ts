import { describe, expect, it } from "vitest";
import { appEn } from "~/shared/i18n/messages/app.en";
import { appNavGroups } from "./nav";

describe("application navigation", () => {
  it("exposes Exercises instead of Anatomy in both workspaces", () => {
    for (const roles of [["Coach"], ["Client"]]) {
      const items = appNavGroups(appEn, roles).flatMap((group) => group.items);
      expect(items.filter((item) => item.to === "/app/anatomy")).toHaveLength(
        0,
      );
      expect(items.filter((item) => item.to === "/app/exercises")).toHaveLength(
        1,
      );
    }
  });
  it("places offers only in the coach library", () => {
    const groups = appNavGroups(appEn, ["Coach"]);
    expect(
      groups
        .filter((g) => g.items.some((i) => i.to === "/app/offers"))
        .map((g) => g.id),
    ).toEqual(["library"]);
    expect(
      appNavGroups(appEn, ["Client"])
        .flatMap((g) => g.items)
        .some((i) => i.to === "/app/offers"),
    ).toBe(false);
  });
});
