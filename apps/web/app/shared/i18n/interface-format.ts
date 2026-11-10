/** A single replacement pass keeps user values literal, including braces and replacement syntax. */
export function formatInterfaceText(
  template: string,
  values: readonly unknown[],
): string {
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}
