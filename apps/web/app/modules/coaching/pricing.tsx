import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import {
  Button,
  IconButton,
  InfoTip,
  NumberInput,
  Option,
  Segment,
  SegmentedControl,
  Select,
  TextField,
} from "@metrivum/ui-web";
import styles from "./coaching.module.css";

export type BillingOption = Schema<"BillingOptionSnapshot">;
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
export function newOption(
  model: BillingOption["model"] = "PerSession",
): BillingOption {
  return {
    id: crypto.randomUUID(),
    name: "",
    model,
    price: 0,
    validityDays: null,
    minSessions: model === "CustomPackage" ? 1 : null,
    maxSessions: model === "CustomPackage" ? 10 : null,
    sessionCount: model === "FixedPackage" ? 5 : null,
    periodCount: model === "PeriodSubscription" ? 1 : null,
    periodUnit: model === "PeriodSubscription" ? "Month" : null,
    paymentTerms: { rule: "Upfront", offsetDays: null },
  };
}
export function validityDescription(option: BillingOption) {
  if (option.model === "PeriodSubscription" || option.model === "OneTime")
    return null;
  if (option.validityDays == null) return "No expiry";
  const days = Number(option.validityDays);
  const unit = validityUnitOf(days);
  const count = days / unitDays(unit);
  return `Valid for ${count} ${count === 1 ? unit : `${unit}s`} after payment`;
}
export function priceDescription(option: BillingOption, currency: string) {
  const validity = validityDescription(option);
  return priceOnly(option, currency) + (validity ? ` · ${validity}` : "");
}
function priceOnly(option: BillingOption, currency: string) {
  const price =
    option.price === 0
      ? "Free"
      : Number.isFinite(option.price)
        ? money(Number(option.price), currency)
        : "Set a price";
  switch (option.model) {
    case "OneTime":
      return `${price} · Independent plan copy`;
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

/** What each billing model means, under the model picker. */
const MODEL_HINTS: Record<BillingOption["model"], string> = {
  PerSession: "The client pays for each session.",
  CustomPackage:
    "The client picks how many sessions to buy, within your range.",
  FixedPackage: "A set number of sessions for one price.",
  PeriodSubscription: "A recurring payment for each period of coaching.",
  OneTime: "The client buys their own copy of the plan once.",
};

/** Validity is stored in days and entered in days, months (30 days) or years (365 days). */
const VALIDITY_UNITS = [
  ["day", 1, "days"],
  ["month", 30, "months"],
  ["year", 365, "years"],
] as const;
type ValidityUnit = (typeof VALIDITY_UNITS)[number][0];
const validityUnitOf = (days: number | null | undefined): ValidityUnit =>
  !days ? "day" : days % 365 === 0 ? "year" : days % 30 === 0 ? "month" : "day";
const unitDays = (unit: ValidityUnit) =>
  VALIDITY_UNITS.find(([id]) => id === unit)![1];

/** A unit picker that sits inside a number field, at its end. */
function UnitPick<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <select
      className={styles.unitPick}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}

const MODELS: [BillingOption["model"], string][] = [
  ["PerSession", "Per session"],
  ["CustomPackage", "Custom package"],
  ["FixedPackage", "Fixed package"],
  ["PeriodSubscription", "Subscription"],
];
const COUNTS: Record<string, string> = {
  minSessions: "Minimum sessions",
  maxSessions: "Maximum sessions",
  sessionCount: "Sessions",
  periodCount: "Period length",
};
type Rule = NonNullable<BillingOption["paymentTerms"]>["rule"];

export function BillingOptionsEditor({
  options,
  onChange,
  disabled,
  currency,
  purpose = "CoachingService",
}: {
  options: BillingOption[];
  onChange: (options: BillingOption[]) => void;
  disabled?: boolean;
  currency?: string;
  purpose?: "CoachingService" | "TrainingPlan";
}) {
  const uiCopy = useUiCopy();

  const change = (i: number, value: Partial<BillingOption>) =>
    onChange(options.map((o, n) => (n === i ? { ...o, ...value } : o)));
  // The validity unit each option is edited in (it isn't stored: validity is saved in days).
  const [units, setUnits] = useState<Record<string, ValidityUnit>>({});
  return (
    <div className={styles.options}>
      {options.map((o, i) => {
        const counts =
          o.model === "CustomPackage"
            ? ["minSessions", "maxSessions"]
            : o.model === "FixedPackage"
              ? ["sessionCount"]
              : o.model === "PeriodSubscription"
                ? ["periodCount"]
                : [];
        return (
          <section
            className={styles.option}
            key={o.id}
            aria-label={o.name || `Billing option ${i + 1}`}
          >
            <div className={styles.optionHead}>
              <span className={styles.optionIndex}>{i + 1}</span>
              <TextField
                maxLength={120}
                aria-label={uiCopy["ui"]["Option name"]}
                placeholder={uiCopy["ui"]["e.g. Monthly coaching"]}
                value={o.name}
                onChange={(name) => change(i, { name })}
                isRequired
                isDisabled={disabled}
                className={styles.grow}
              />
              <IconButton
                label={uiCopy["ui"]["Remove option"]}
                icon={<Trash2 />}
                variant="ghost"
                size="sm"
                isDisabled={disabled || options.length === 1}
                onPress={() => onChange(options.filter((_, n) => n !== i))}
              />
            </div>
            <SegmentedControl
              aria-label={formatInterfaceText(
                uiCopy["ui"]["Pricing for option {0}"],
                [i + 1],
              )}
              isDisabled={disabled}
              selectedKeys={[o.price === 0 ? "Free" : "Paid"]}
              onSelectionChange={(keys) =>
                change(
                  i,
                  [...keys][0] === "Free"
                    ? {
                        price: 0,
                        paymentTerms: { rule: "Upfront", offsetDays: null },
                      }
                    : { price: Number.NaN },
                )
              }
            >
              <Segment id="Free">{uiCopy["ui"]["Free"]}</Segment>
              <Segment id="Paid">{uiCopy["ui"]["Paid"]}</Segment>
            </SegmentedControl>
            {o.price === 0 && (
              <p className={styles.note}>
                {
                  uiCopy["ui"][
                    "No payment is required. Session counts and validity still apply."
                  ]
                }
              </p>
            )}
            <div className={styles.columns}>
              {/* Help sits behind (i), not under the field, so fields side by side stay the same height. */}
              <Select
                label={uiCopy["ui"]["Billing model"]}
                labelAside={
                  <InfoTip
                    label={uiCopy["ui"]["Billing model"]}
                    className={styles.fieldTip}
                  >
                    {MODEL_HINTS[o.model]}
                  </InfoTip>
                }
                isDisabled={disabled}
                selectedKey={o.model}
                onSelectionChange={(key) =>
                  change(i, {
                    ...newOption(key as BillingOption["model"]),
                    id: o.id,
                    name: o.name,
                    price: o.price,
                  })
                }
              >
                {(purpose === "TrainingPlan"
                  ? ([["OneTime", "One-time purchase"]] as const)
                  : MODELS
                ).map(([id, label]) => (
                  <Option key={id} id={id}>
                    {label}
                  </Option>
                ))}
              </Select>
              {o.price !== 0 && (
                <NumberInput
                  label={
                    o.model === "PerSession" || o.model === "CustomPackage"
                      ? uiCopy["ui"]["Price per session"]
                      : uiCopy["ui"]["Total price"]
                  }
                  placeholder="0.00"
                  isRequired
                  minValue={0}
                  step={0.01}
                  formatOptions={{
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  }}
                  unit={currency}
                  isDisabled={disabled}
                  value={Number(o.price)}
                  onChange={(v) => change(i, { price: v })}
                />
              )}
              {counts.map((field) => (
                <NumberInput
                  key={field}
                  label={COUNTS[field]}
                  placeholder="1"
                  minValue={1}
                  step={1}
                  isRequired
                  isDisabled={disabled}
                  value={Number(o[field as keyof BillingOption] ?? 1)}
                  onChange={(v) => change(i, { [field]: v })}
                  // A subscription's period unit is picked inside its length field.
                  endSlot={
                    field === "periodCount" ? (
                      <UnitPick
                        label={uiCopy["ui"]["Period unit"]}
                        disabled={disabled}
                        value={
                          (o.periodUnit ?? "Month") as "Week" | "Month" | "Year"
                        }
                        options={[
                          [
                            "Week",
                            Number(o.periodCount) === 1 ? "week" : "weeks",
                          ],
                          [
                            "Month",
                            Number(o.periodCount) === 1 ? "month" : "months",
                          ],
                          [
                            "Year",
                            Number(o.periodCount) === 1 ? "year" : "years",
                          ],
                        ]}
                        onChange={(periodUnit) => change(i, { periodUnit })}
                      />
                    ) : undefined
                  }
                />
              ))}
              {o.model !== "PeriodSubscription" &&
                o.model !== "OneTime" &&
                (() => {
                  const unit = units[o.id] ?? validityUnitOf(o.validityDays);
                  const factor = unitDays(unit);
                  return (
                    <NumberInput
                      label={uiCopy["ui"]["Validity after payment"]}
                      placeholder={uiCopy["ui"]["No expiry"]}
                      labelAside={
                        <InfoTip
                          label={uiCopy["ui"]["Validity after payment"]}
                          className={styles.fieldTip}
                        >
                          {
                            uiCopy["ui"][
                              "Empty means no expiry. The whole package expires at once."
                            ]
                          }
                        </InfoTip>
                      }
                      minValue={1}
                      maxValue={Math.floor(36500 / factor)}
                      step={1}
                      isDisabled={disabled}
                      value={
                        o.validityDays == null
                          ? Number.NaN
                          : Math.round(Number(o.validityDays) / factor)
                      }
                      onChange={(value) =>
                        change(i, {
                          validityDays: Number.isNaN(value)
                            ? null
                            : value * factor,
                        })
                      }
                      endSlot={
                        <UnitPick
                          label={uiCopy["ui"]["Validity unit"]}
                          disabled={disabled}
                          value={unit}
                          options={VALIDITY_UNITS.map(
                            ([id, , text]) => [id, text] as const,
                          )}
                          onChange={(next) => {
                            setUnits((current) => ({
                              ...current,
                              [o.id]: next,
                            }));
                            // Keep the number the coach typed; it now counts the new unit.
                            if (o.validityDays != null)
                              change(i, {
                                validityDays:
                                  Math.round(Number(o.validityDays) / factor) *
                                  unitDays(next),
                              });
                          }}
                        />
                      }
                    />
                  );
                })()}
              {o.price !== 0 && (
                <Select
                  label={uiCopy["ui"]["Payment due"]}
                  isDisabled={disabled || o.model === "OneTime"}
                  selectedKey={o.paymentTerms?.rule ?? "Upfront"}
                  onSelectionChange={(key) =>
                    change(i, {
                      paymentTerms: {
                        rule: key as Rule,
                        offsetDays: key === "CustomOffsetDays" ? 7 : null,
                      },
                    })
                  }
                >
                  <Option id="Upfront">{uiCopy["ui"]["Upfront"]}</Option>
                  <Option id="OnStart">{uiCopy["ui"]["On start"]}</Option>
                  {o.model === "PeriodSubscription" ? (
                    <Option id="EndOfServicePeriod">
                      {uiCopy["ui"]["End of service period"]}
                    </Option>
                  ) : null}
                  <Option id="EndOfCalendarMonth">
                    {uiCopy["ui"]["End of calendar month"]}
                  </Option>
                  <Option id="CustomOffsetDays">
                    {uiCopy["ui"]["Days after start"]}
                  </Option>
                </Select>
              )}
              {o.price !== 0 && o.paymentTerms?.rule === "CustomOffsetDays" ? (
                <NumberInput
                  label={uiCopy["ui"]["Days after start"]}
                  placeholder="0"
                  minValue={0}
                  maxValue={365}
                  step={1}
                  isRequired
                  isDisabled={disabled}
                  value={Number(o.paymentTerms.offsetDays ?? 0)}
                  onChange={(v) =>
                    change(i, {
                      paymentTerms: { rule: "CustomOffsetDays", offsetDays: v },
                    })
                  }
                />
              ) : null}
            </div>
          </section>
        );
      })}
      <Button
        variant="ghost"
        iconStart={<Plus />}
        isDisabled={disabled || options.length >= 20}
        onPress={() =>
          onChange([
            ...options,
            newOption(purpose === "TrainingPlan" ? "OneTime" : "PerSession"),
          ])
        }
        className={styles.addOption}
      >
        {uiCopy["ui"]["Add billing option"]}
      </Button>
    </div>
  );
}
