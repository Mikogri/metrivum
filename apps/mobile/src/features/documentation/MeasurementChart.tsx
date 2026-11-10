import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import type { Schema } from "@metrivum/api-client-web";
import { EmptyState, Text } from "@metrivum/ui-mobile";
import { Chart } from "@metrivum/ui-mobile/chart";

export function MeasurementChart({
  records,
  definition,
  measurementKey,
  page,
}: {
  records: Schema<"MeasurementDto">[];
  definition?: Schema<"MeasurementDefinition">;
  measurementKey: string;
  page: number;
}) {
  const nativeCopy = useNativeCopy().t;

  const selected = records.filter((point) => point.key === measurementKey);
  const units = [...new Set(selected.map((point) => point.unit))];
  if (!selected.length)
    return (
      <EmptyState
        icon="progress"
        title={nativeCopy("interface.No measurements in this period")}
        description={nativeCopy(
          "interface.Change the dates, or add the first one.",
        )}
      />
    );
  return (
    <>
      {units.map((unit) => (
        <Chart
          key={unit}
          title={definition?.label || measurementKey}
          unit={unit}
          points={selected
            .filter((point) => point.unit === unit)
            .map((point) => ({
              id: point.id,
              date: point.observedAt,
              value: point.value,
            }))}
        />
      ))}
      {(page > 1 || units.length > 1) && (
        <Text variant="caption" tone="subtleText">
          {units.length > 1
            ? nativeCopy("interface.Each unit has its own scale. ")
            : ""}
          {page > 1 ? `Showing page ${page} of the history.` : ""}
        </Text>
      )}
    </>
  );
}
