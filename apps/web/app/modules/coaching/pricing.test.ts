import { describe, expect, it } from "vitest";
import { newOption, priceDescription, validityDescription } from "./pricing";

it("labels zero-price offers as Free while preserving package terms", () => {
  expect(priceDescription({ ...newOption("FixedPackage"), sessionCount: 5 }, "USD")).toBe("Free / 5 sessions · No expiry");
  expect(priceDescription({ ...newOption("OneTime"), price: 12 }, "USD")).toContain("$12.00");
});
it("prompts for a price while a paid option is incomplete", () => {
  expect(priceDescription({ ...newOption(), price: Number.NaN }, "USD")).toContain("Set a price");
});

describe("session validity disclosure", () => {
  it("shows the payment-based validity with the price", () => {
    expect(priceDescription({ ...newOption("FixedPackage"), validityDays: 30 }, "USD")).toContain("Valid for 30 days after payment");
  });
});

it("keeps unlimited sessions explicit and subscriptions period-based", () => {
  expect(validityDescription(newOption())).toBe("No expiry");
  expect(validityDescription(newOption("PeriodSubscription"))).toBeNull();
  expect(validityDescription({ ...newOption(), validityDays: 1 })).toBe("Valid for 1 day after payment");
});
