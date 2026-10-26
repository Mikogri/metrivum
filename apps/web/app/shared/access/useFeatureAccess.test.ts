import { describe, expect, it } from "vitest";
import { decide } from "./useFeatureAccess";

describe("feature decisions", () => {
  it("is closed while loading and for unknown keys", () => {
    expect(decide(undefined, "training.export.pdf")).toEqual({ state: "loading", allowed: false, pending: true });
    expect(decide([], "training.export.pdf")).toEqual({ state: "unknown", allowed: false, pending: false });
  });

  it("opens only on an explicit 'available' decision", () => {
    expect(decide([{ key: "training.export.pdf", available: true, reason: "available" }], "training.export.pdf").allowed).toBe(true);
    expect(decide([{ key: "training.export.pdf", available: true, reason: "something_new" }], "training.export.pdf")).toMatchObject({ allowed: false, state: "unknown" });
  });

  it.each(["feature_not_in_plan", "not_granted", "explicit_deny", "operationally_disabled", "dependency_unavailable", "limit_reached"])("keeps reason %s", (reason) => {
    expect(decide([{ key: "video.analysis.run", available: false, reason }], "video.analysis.run")).toEqual({ state: reason, allowed: false, pending: false });
  });
});
