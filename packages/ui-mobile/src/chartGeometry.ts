export type ChartPoint = {
  id: string;
  date: string;
  value: number | string | null | undefined;
};

export function chartGeometry(input: readonly ChartPoint[]) {
  const points = input
    .flatMap((point) => {
      if (
        point.value == null ||
        (typeof point.value === "string" && !point.value.trim())
      )
        return [];
      const value = Number(point.value);
      return Number.isFinite(value) ? [{ ...point, value }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const min = points.reduce(
    (minimum, point) => Math.min(minimum, point.value),
    0,
  );
  const max = points.reduce(
    (maximum, point) => Math.max(maximum, point.value),
    0,
  );
  const span = max - min || 1;
  const baseline = ((0 - min) / span) * 100;
  return {
    min,
    max,
    baseline,
    points: points.map((point) => ({
      ...point,
      left: ((Math.min(0, point.value) - min) / span) * 100,
      width: (Math.abs(point.value) / span) * 100,
    })),
  };
}
