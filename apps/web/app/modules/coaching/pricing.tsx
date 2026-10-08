import { Plus, Trash2 } from "lucide-react";
import type { Schema } from "@trainflow/api-client-web";
import { Button, IconButton, NumberInput, Option, Select, TextField } from "@trainflow/ui-web";
import styles from "./coaching.module.css";

export type BillingOption = Schema<"BillingOptionSnapshot">;
export const money = (amount: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
export function newOption(model: BillingOption["model"] = "PerSession"): BillingOption {
  return {
    id: crypto.randomUUID(),
    name: "",
    model,
    price: 0,
    minSessions: model === "CustomPackage" ? 1 : null,
    maxSessions: model === "CustomPackage" ? 10 : null,
    sessionCount: model === "FixedPackage" ? 5 : null,
    periodCount: model === "PeriodSubscription" ? 1 : null,
    periodUnit: model === "PeriodSubscription" ? "Month" : null,
    paymentTerms: { rule: "Upfront", offsetDays: null },
  };
}
export function priceDescription(option: BillingOption, currency: string) {
  const price = money(Number(option.price), currency);
  switch (option.model) {
    case "PerSession":
      return `${price} / session`;
    case "CustomPackage":
      return `${price} / session · ${option.minSessions}–${option.maxSessions} sessions`;
    case "FixedPackage":
      return `${price} / ${option.sessionCount} sessions`;
    case "PeriodSubscription":
      return `${price} / ${option.periodCount} ${option.periodUnit?.toLowerCase()}${Number(option.periodCount) === 1 ? "" : "s"}`;
  }
}

const MODELS: [BillingOption["model"], string][] = [
  ["PerSession", "Per session"],
  ["CustomPackage", "Custom package"],
  ["FixedPackage", "Fixed package"],
  ["PeriodSubscription", "Subscription"],
];
const COUNTS: Record<string, string> = { minSessions: "Minimum sessions", maxSessions: "Maximum sessions", sessionCount: "Sessions", periodCount: "Period length" };
type Rule = NonNullable<BillingOption["paymentTerms"]>["rule"];

export function BillingOptionsEditor({ options, onChange, disabled, currency }: { options: BillingOption[]; onChange: (options: BillingOption[]) => void; disabled?: boolean; currency?: string }) {
  const change = (i: number, value: Partial<BillingOption>) => onChange(options.map((o, n) => (n === i ? { ...o, ...value } : o)));
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  return (
    <div className={styles.options}>
      {options.map((o, i) => {
        const counts = o.model === "CustomPackage" ? ["minSessions", "maxSessions"] : o.model === "FixedPackage" ? ["sessionCount"] : o.model === "PeriodSubscription" ? ["periodCount"] : [];
        return (
          <section className={styles.option} key={o.id} aria-label={o.name || `Billing option ${i + 1}`}>
            <div className={styles.optionHead}>
              <span className={styles.optionIndex}>{i + 1}</span>
              <TextField aria-label="Option name" placeholder="e.g. Monthly coaching" value={o.name} onChange={(name) => change(i, { name })} isRequired isDisabled={disabled} className={styles.grow} />
              <IconButton label="Remove option" icon={<Trash2 />} variant="ghost" size="sm" isDisabled={disabled || options.length === 1} onPress={() => onChange(options.filter((_, n) => n !== i))} />
            </div>
            <div className={styles.columns}>
              <Select label="Billing model" isDisabled={disabled} selectedKey={o.model} onSelectionChange={(key) => change(i, { ...newOption(key as BillingOption["model"]), id: o.id, name: o.name })}>
                {MODELS.map(([id, label]) => (
                  <Option key={id} id={id}>{label}</Option>
                ))}
              </Select>
              <NumberInput
                label={o.model === "PerSession" || o.model === "CustomPackage" ? "Price per session" : "Total price"}
                placeholder="0.00"
                minValue={0}
                step={0.01}
                formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 2 }}
                unit={currency}
                isRequired
                isDisabled={disabled}
                value={Number(o.price)}
                onChange={(v) => change(i, { price: num(v, 0) })}
              />
              {counts.map((field) => (
                <NumberInput key={field} label={COUNTS[field]} minValue={1} step={1} isRequired isDisabled={disabled} value={Number(o[field as keyof BillingOption] ?? 1)} onChange={(v) => change(i, { [field]: num(v, 1) })} />
              ))}
              {o.model === "PeriodSubscription" ? (
                <Select label="Period unit" isDisabled={disabled} selectedKey={o.periodUnit ?? "Month"} onSelectionChange={(key) => change(i, { periodUnit: key as BillingOption["periodUnit"] })}>
                  <Option id="Week">Week</Option>
                  <Option id="Month">Month</Option>
                  <Option id="Year">Year</Option>
                </Select>
              ) : null}
              <Select
                label="Payment due"
                isDisabled={disabled}
                selectedKey={o.paymentTerms?.rule ?? "Upfront"}
                onSelectionChange={(key) => change(i, { paymentTerms: { rule: key as Rule, offsetDays: key === "CustomOffsetDays" ? 7 : null } })}
              >
                <Option id="Upfront">Upfront</Option>
                <Option id="OnStart">On start</Option>
                {o.model === "PeriodSubscription" ? <Option id="EndOfServicePeriod">End of service period</Option> : null}
                <Option id="EndOfCalendarMonth">End of calendar month</Option>
                <Option id="CustomOffsetDays">Days after start</Option>
              </Select>
              {o.paymentTerms?.rule === "CustomOffsetDays" ? (
                <NumberInput label="Days after start" minValue={0} step={1} isRequired isDisabled={disabled} value={Number(o.paymentTerms.offsetDays ?? 0)} onChange={(v) => change(i, { paymentTerms: { rule: "CustomOffsetDays", offsetDays: num(v, 0) } })} />
              ) : null}
            </div>
          </section>
        );
      })}
      <Button variant="ghost" iconStart={<Plus />} isDisabled={disabled} onPress={() => onChange([...options, newOption()])} className={styles.addOption}>
        Add billing option
      </Button>
    </div>
  );
}
