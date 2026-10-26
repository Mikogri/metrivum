import { describe, expect, it } from "vitest";
import { catalogLimit, isWorkspacePlan, planChangeKind, type CatalogPlan } from "./catalog";

const plan = (id: string, amount: number, extra = {}): CatalogPlan => ({ id, name: id, amount, currency: "PLN", billingInterval: "Month", priceVersion: "test", termsVersion: "test", commissionRate: 0.1, priceConfigured: true, capabilities: [], simulated: true, priceScope: "Account", upgradePolicy: "Immediate new monthly period; no proration", tier: 1, topTier: 3, ...extra });

describe("subscription catalog", () => {
  it("preserves server unlimited, locked and missing limits distinctly", () => {
    const catalog = plan("Pro", 123, { limits: { local: null, cloud: 0, clients: "61" } });
    expect(catalogLimit(catalog, "local")).toBeNull();
    expect(catalogLimit(catalog, "cloud")).toBe(0);
    expect(catalogLimit(catalog, "clients")).toBe(61);
    expect(catalogLimit(catalog, "unknown")).toBeUndefined();
  });

  it("identifies workspace billing from API scope", () => {
    expect(isWorkspacePlan(plan("Future bundle", 456, { priceScope: "Workspace" }))).toBe(true);
    expect(isWorkspacePlan(plan("Team", 456, { priceScope: "Account" }))).toBe(false);
  });

  it("uses catalog amounts rather than hardcoded plan order for deferred downgrades", () => {
    const catalog = [plan("Starter", 40), plan("Pro", 100), plan("Free", 0)];
    expect(planChangeKind(catalog, "Pro", "Starter")).toBe("downgrade");
    expect(planChangeKind(catalog, "Starter", "Pro")).toBe("checkout");
    expect(planChangeKind(catalog, "Starter", "Free")).toBe("downgrade");
  });
});

describe("plan tiers", () => {
  it("treats the top tier of each kind as having no upgrade", async () => {
    const { isTopTier } = await import("~/shared/access/plan-catalog");
    expect(isTopTier(plan("Pro", 99, { tier: 3, topTier: 3 }))).toBe(true);
    expect(isTopTier(plan("Starter", 39, { tier: 2, topTier: 3 }))).toBe(false);
    expect(isTopTier(plan("Studio", 699, { tier: 2, topTier: 2, priceScope: "Workspace" }))).toBe(true);
    // Without tiers from the server, the most expensive plan of the same kind is the top one.
    const old = [plan("Free", 0, { tier: undefined, topTier: undefined }), plan("Pro", 99, { tier: undefined, topTier: undefined })];
    expect(isTopTier(old[1]!, old)).toBe(true);
    expect(isTopTier(old[0]!, old)).toBe(false);
  });
});
