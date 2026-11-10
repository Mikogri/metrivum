import { expect, it } from "vitest";
import { validateOffer } from "./offer-validation";
import { newOption } from "./pricing";
const valid = () => ({
  name: "Coaching",
  description: "",
  category: "strength",
  applicationFormVersionId: "published",
  tags: [],
  billingOptions: [{ ...newOption(), name: "Session", price: 0 }],
});
it("accepts free offers and ordinary two-decimal prices", () => {
  const value = valid();
  expect(validateOffer(value)).toBeNull();
  value.billingOptions[0]!.price = 19.99;
  expect(validateOffer(value)).toBeNull();
});
it("requires the billing option name", () => {
  const value = valid();
  value.billingOptions[0]!.name = " ";
  expect(validateOffer(value)).toMatch(/name/);
});
it("accepts offers without an application form", () => {
  expect(
    validateOffer({ ...valid(), applicationFormVersionId: null }),
  ).toBeNull();
});
it("rejects inverted package ranges and fractional counts", () => {
  const value = valid();
  value.billingOptions = [
    {
      ...newOption("CustomPackage"),
      name: "Package",
      minSessions: 10,
      maxSessions: 5,
    },
  ];
  expect(validateOffer(value)).toMatch(/minimum sessions/);
  value.billingOptions[0]!.minSessions = 1.5;
  expect(validateOffer(value)).toMatch(/minimum sessions/);
});
it("enforces subscription and payment offset backend bounds", () => {
  const value = valid();
  value.billingOptions = [
    {
      ...newOption("PeriodSubscription"),
      name: "Subscription",
      periodCount: 13,
    },
  ];
  expect(validateOffer(value)).toMatch(/one year/);
  value.billingOptions[0]!.periodCount = 12;
  value.billingOptions[0]!.paymentTerms = {
    rule: "CustomOffsetDays",
    offsetDays: 366,
  };
  expect(validateOffer(value)).toMatch(/365/);
});
it("rejects excess decimal places and invalid tags", () => {
  const value = valid();
  value.billingOptions[0]!.price = 12.345;
  expect(validateOffer(value)).toMatch(/two decimals/);
  expect(validateOffer({ ...valid(), tags: ["bad_tag"] })).toMatch(/tags/);
});

it("rejects a cleared price instead of silently turning it into a free offer", () => {
  const value = valid();
  value.billingOptions[0]!.price = Number.NaN;
  expect(validateOffer(value)).toMatch(/price/);
});

it.each([0, -1, 1.5, 36501])("rejects invalid session validity %s", (days) => {
  const value = valid();
  value.billingOptions[0]!.validityDays = days;
  expect(validateOffer(value)).toMatch(/validity/i);
});
it("accepts unlimited and time-limited sessions but rejects a second subscription period", () => {
  const value = valid();
  expect(validateOffer(value)).toBeNull();
  value.billingOptions[0]!.validityDays = 30;
  expect(validateOffer(value)).toBeNull();
  value.billingOptions = [
    { ...newOption("PeriodSubscription"), name: "Monthly", validityDays: 30 },
  ];
  expect(validateOffer(value)).toMatch(/validity/i);
});

it("requires one-time pricing for plan sales and rejects it for coaching", () => {
  const value = { ...valid(), purpose: "TrainingPlan" as const };
  expect(validateOffer(value)).not.toBeNull();
  value.billingOptions = [
    { ...newOption("OneTime"), name: "Plan copy", price: 25 },
  ];
  expect(validateOffer(value)).toBeNull();
  expect(
    validateOffer({ ...value, purpose: "CoachingService" }),
  ).not.toBeNull();
  value.billingOptions[0]!.validityDays = 30;
  expect(validateOffer(value)).not.toBeNull();
});
