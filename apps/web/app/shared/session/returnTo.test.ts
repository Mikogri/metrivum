import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it.each([
    ["/app/programs?folder=1", "/app/programs?folder=1"],
    ["%2Fapp%2Fprograms%2Fabc%2Fedit", "/app/programs/abc/edit"],
    ["/onboarding", "/onboarding"],
    ["/onboarding/plan?returnTo=%2Fapp%2Fdashboard", "/onboarding/plan?returnTo=/app/dashboard"],
    ["/app/checkout?plan=Pro", "/app/checkout?plan=Pro"],
  ])("keeps in-app path %s", (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });

  it.each(["https://evil.test/app", "//evil.test/app", "/\\evil.test", "javascript:alert(1)", "/auth/login", "/", "/features", "%2F%2Fevil.test", "/app/../auth"])(
    "rejects %s (open redirect / loops)",
    (input) => {
      const result = sanitizeReturnTo(input);
      expect(result === "/app/dashboard" || result.startsWith("/app")).toBe(true);
      expect(result).not.toContain("evil");
      expect(result.startsWith("/auth")).toBe(false);
    },
  );
});
