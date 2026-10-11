import { describe, expect, it } from "vitest";
import { newOption, priceDescription, validityDescription } from "./pricing";

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
