import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "./index";
import { chartGeometry, type ChartPoint } from "./chartGeometry";

export type { ChartPoint } from "./chartGeometry";

const day = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/**
 * One series and one unit per chart. Each column is one recorded observation, in date order; the
 * zero line is drawn so columns are honest about scale. Tapping a column shows its date and value,
 * and every column is also readable by a screen reader.
 */
export function Chart({
    title,
    unit,
    points,
}: {
    title: string;
    unit: string;
    points: readonly ChartPoint[];
}) {
    const theme = useTheme();
    const chart = chartGeometry(points);
    const [picked, setPicked] = useState<string>();
    const format = (value: number) =>
        `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
    const shown =
        chart.points.find((point) => point.id === picked) ??
        chart.points[chart.points.length - 1];
    const height = 132;
    return (
        <View style={{ gap: theme.spacing.sm }}>
            <Text accessibilityRole="header" variant="label" tone="mutedText">
                {title}
            </Text>
            {!shown ? (
                <Text variant="caption" tone="mutedText">
                    No recorded values for this series.
                </Text>
            ) : (
                <>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: theme.spacing.sm,
                        }}
                    >
                        <Text variant="numeric">{format(shown.value)}</Text>
                        <Text variant="caption" tone="mutedText">
                            {day(shown.date)}
                        </Text>
                    </View>
                    <View
                        style={{
                            height,
                            flexDirection: "row",
                            alignItems: "stretch",
                            gap: chart.points.length > 24 ? 1 : 3,
                        }}
                    >
                        {chart.points.map((point) => {
                            const active = point.id === shown.id;
                            return (
                                <Pressable
                                    key={point.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${title}, ${day(point.date)}, ${format(point.value)}`}
                                    accessibilityState={{ selected: active }}
                                    onPress={() => setPicked(point.id)}
                                    style={{ flex: 1 }}
                                >
                                    <View
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            bottom: `${point.left}%`,
                                            height: `${Math.max(point.width, 1.5)}%`,
                                            borderRadius: 3,
                                            backgroundColor: active
                                                ? theme.colors.brand
                                                : theme.colors.borderStrong,
                                        }}
                                    />
                                </Pressable>
                            );
                        })}
                        <View
                            pointerEvents="none"
                            style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                bottom: `${chart.baseline}%`,
                                height: theme.hairline,
                                backgroundColor: theme.colors.border,
                            }}
                        />
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                        }}
                    >
                        <Text variant="caption" tone="subtleText">
                            {day(chart.points[0]!.date)}
                        </Text>
                        <Text variant="caption" tone="subtleText">
                            {format(chart.min)} – {format(chart.max)}
                        </Text>
                        <Text variant="caption" tone="subtleText">
                            {day(chart.points[chart.points.length - 1]!.date)}
                        </Text>
                    </View>
                    {chart.points.length === 1 && (
                        <Text variant="caption" tone="mutedText">
                            One recorded value. More records are needed to show
                            change.
                        </Text>
                    )}
                </>
            )}
        </View>
    );
}
