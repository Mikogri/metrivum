import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = { title: "Foundations/Tokens" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  "--ui-color-bg",
  "--ui-color-bg-sunken",
  "--ui-color-surface",
  "--ui-color-surface-raised",
  "--ui-color-surface-overlay",
  "--ui-color-border",
  "--ui-color-border-strong",
  "--ui-color-text",
  "--ui-color-text-secondary",
  "--ui-color-text-tertiary",
  "--ui-color-primary",
  "--ui-color-accent",
  "--ui-color-accent-deep",
  "--ui-color-warning",
  "--ui-color-danger",
  "--ui-color-info",
  "--ui-color-violet",
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
            border: "1px solid var(--ui-color-border)",
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
              color: "var(--ui-color-text-secondary)",
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
          fontFamily: "var(--ui-font-display)",
          fontSize: "var(--ui-text-6xl)",
          fontWeight: 600,
          letterSpacing: "var(--ui-tracking-display)",
          lineHeight: 1,
        }}
      >
        Display · Saira
      </p>
      <p style={{ fontSize: "var(--ui-text-3xl)", fontWeight: 600 }}>
        Heading 28 · Geist
      </p>
      <p style={{ fontSize: "var(--ui-text-lg)" }}>Body 16 — marketing copy</p>
      <p style={{ fontSize: "var(--ui-text-sm)" }}>Body 13 — app density</p>
      <p
        style={{
          fontSize: "var(--ui-text-xs)",
          color: "var(--ui-color-text-tertiary)",
        }}
      >
        Caption 12
      </p>
      <p
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: "var(--ui-text-sm)",
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
          ["--ui-ease-out", "Enter/exit, popovers, press feedback"],
          ["--ui-ease-in-out", "On-screen movement (marketing)"],
          ["--ui-ease-drawer", "Sheets and drawers"],
          ["--ui-duration-press", "140ms button press"],
          ["--ui-duration-base", "200ms dropdowns, tabs"],
          ["--ui-duration-slow", "280ms indicators"],
        ].map(([token, use]) => (
          <tr key={token}>
            <td style={{ padding: "6px 16px 6px 0" }}>
              <code>{token}</code>
            </td>
            <td style={{ color: "var(--ui-color-text-secondary)" }}>{use}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
