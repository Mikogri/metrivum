import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Tokens" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  "--tf-color-bg",
  "--tf-color-bg-sunken",
  "--tf-color-surface",
  "--tf-color-surface-raised",
  "--tf-color-surface-overlay",
  "--tf-color-border",
  "--tf-color-border-strong",
  "--tf-color-text",
  "--tf-color-text-secondary",
  "--tf-color-text-tertiary",
  "--tf-color-primary",
  "--tf-color-accent",
  "--tf-color-accent-deep",
  "--tf-color-warning",
  "--tf-color-danger",
  "--tf-color-info",
  "--tf-color-violet",
];

export const Colors: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
      }}
    >
      {colors.map((token) => (
        <div
          key={token}
          style={{
            border: "1px solid var(--tf-color-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 56, background: `var(${token})` }} />
          <code
            style={{
              display: "block",
              padding: 8,
              fontSize: 11,
              color: "var(--tf-color-text-secondary)",
            }}
          >
            {token}
          </code>
        </div>
      ))}
    </div>
  ),
};

export const Type: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <p
        style={{
          fontFamily: "var(--tf-font-display)",
          fontSize: "var(--tf-text-6xl)",
          fontWeight: 600,
          letterSpacing: "var(--tf-tracking-display)",
          lineHeight: 1,
        }}
      >
        Display · Saira
      </p>
      <p style={{ fontSize: "var(--tf-text-3xl)", fontWeight: 600 }}>
        Heading 28 · Geist
      </p>
      <p style={{ fontSize: "var(--tf-text-lg)" }}>Body 16 — marketing copy</p>
      <p style={{ fontSize: "var(--tf-text-sm)" }}>Body 13 — app density</p>
      <p
        style={{
          fontSize: "var(--tf-text-xs)",
          color: "var(--tf-color-text-tertiary)",
        }}
      >
        Caption 12
      </p>
      <p
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: "var(--tf-text-sm)",
        }}
      >
        Tabular 82,5 kg · 119 kg · 3-1-X-0
      </p>
    </div>
  ),
};

export const Motion: Story = {
  render: () => (
    <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
      <tbody>
        {[
          ["--tf-ease-out", "Enter/exit, popovers, press feedback"],
          ["--tf-ease-in-out", "On-screen movement (marketing)"],
          ["--tf-ease-drawer", "Sheets and drawers"],
          ["--tf-duration-press", "140ms button press"],
          ["--tf-duration-base", "200ms dropdowns, tabs"],
          ["--tf-duration-slow", "280ms indicators"],
        ].map(([token, use]) => (
          <tr key={token}>
            <td style={{ padding: "6px 16px 6px 0" }}>
              <code>{token}</code>
            </td>
            <td style={{ color: "var(--tf-color-text-secondary)" }}>{use}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
