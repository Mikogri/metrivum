import type { BillingOption } from "./pricing";

const positiveCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2147483647;
export function validateOffer(value: { name: string; description: string; category: string; applicationFormVersionId: string | null; tags: string[]; billingOptions: BillingOption[]; purpose?: "CoachingService" | "TrainingPlan" }): string | null {
  if (!value.name.trim() || value.name.trim().length > 200) return "Enter an offer name up to 200 characters.";
  if (value.description.length > 4000) return "Keep the description within 4,000 characters.";
  if (!value.category || value.category.length > 60) return "Choose a category.";
  if (value.tags.length > 30 || value.tags.some(raw => { const tag = raw.normalize("NFKC").trim().toLowerCase(); return tag.length > 60 || !/^[\p{L}\p{Nd} -]+$/u.test(tag); })) return "Use up to 30 tags, each up to 60 characters using letters, numbers, spaces and hyphens.";
  if (value.billingOptions.length < 1 || value.billingOptions.length > 20) return "Add between 1 and 20 billing options.";
  for (const [index, option] of value.billingOptions.entries()) {
    if ((option.model === "OneTime") !== (value.purpose === "TrainingPlan")) return "Select pricing that matches the offer type.";
    const prefix = `Billing option ${index + 1}: `;
    if (!option.name.trim() || option.name.length > 120) return prefix + "enter a name up to 120 characters.";
    if (option.validityDays != null && ((option.model === "PeriodSubscription" || option.model === "OneTime") || !Number.isInteger(option.validityDays) || option.validityDays < 1 || option.validityDays > 36500)) return prefix + "session validity must be a whole number from 1 to 36,500 days; subscriptions use their billing period.";
    const cents = option.price * 100;
    if (!Number.isFinite(option.price) || option.price < 0 || option.price >= 1e26 || Math.abs(cents - Math.round(cents)) > Math.max(1, Math.abs(cents)) * Number.EPSILON * 2) return prefix + "enter a non-negative price with at most two decimals.";
    if (option.model === "CustomPackage" && (!positiveCount(option.minSessions) || !positiveCount(option.maxSessions) || option.minSessions! > option.maxSessions!)) return prefix + "minimum sessions must be positive and no greater than maximum sessions.";
    if (option.model === "CustomPackage" && option.price * option.maxSessions! >= 1e26) return prefix + "the package total exceeds supported monetary precision.";
    if (option.model === "FixedPackage" && !positiveCount(option.sessionCount)) return prefix + "enter a positive whole session count.";
    if (option.model === "PeriodSubscription" && (!positiveCount(option.periodCount) || !option.periodUnit || option.periodCount! > ({ Week: 52, Month: 12, Year: 1 }[option.periodUnit]))) return prefix + "the subscription period must be between one week and one year.";
    if (option.paymentTerms?.rule === "CustomOffsetDays" && (!Number.isInteger(option.paymentTerms.offsetDays) || option.paymentTerms.offsetDays! < 0 || option.paymentTerms.offsetDays! > 365 || option.paymentTerms.offsetDays == null)) return prefix + "payment offset must be a whole number from 0 to 365 days.";
    if (option.paymentTerms?.rule === "EndOfServicePeriod" && option.model !== "PeriodSubscription") return prefix + "end of service period requires a subscription.";
  }
  return null;
}
