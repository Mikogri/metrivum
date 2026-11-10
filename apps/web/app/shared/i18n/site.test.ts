import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { privateMeta } from "./site";

describe("page metadata", () => {
  it("keeps private page titles alongside the indexing restriction", () => {
    expect(privateMeta("Calendar — Metrivum")).toEqual([
      { title: "Calendar — Metrivum" },
      { name: "robots", content: "noindex, nofollow" },
    ]);
  });

  it("gives every registered page its own metadata", () => {
    const app = resolve(import.meta.dirname, "../..");
    const routes = readFileSync(resolve(app, "routes.ts"), "utf8");
    const pages = [
      ...new Set(
        [
          ...routes.matchAll(
            /(?:index|route)\(\s*(?:"[^"]*"\s*,\s*)?"(modules\/[^"]+\.tsx)"/g,
          ),
        ].map((match) => match[1]!),
      ),
    ];
    expect(pages.length).toBeGreaterThan(60);
    for (const page of pages) {
      const source = readFileSync(resolve(app, page), "utf8");
      expect(source, `${page} needs browser-tab metadata`).toMatch(
        /export (?:const|function) meta\b/,
      );
      expect(source, `${page} needs a title`).toMatch(
        /privateMeta\(|publicPageMeta\(|\{\s*title:/,
      );
    }
  });
});
