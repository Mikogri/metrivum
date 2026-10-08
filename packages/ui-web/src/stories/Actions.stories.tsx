import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, Plus, Rocket, Trash2 } from "lucide-react";
import { Button, IconButton, LinkButton } from "../index";
import { pick } from "./copy";

const meta = {
  title: "Actions/Button",
  component: Button,
  parameters: { docs: { description: { component: "Primary actions are white, progress/positive actions use the green accent. Press feedback scales to 0.97." } } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" iconStart={<Rocket />}>
          {t.publish}
        </Button>
        <Button variant="accent" iconStart={<Plus />}>
          {t.save}
        </Button>
        <Button variant="secondary" iconStart={<Download />}>
          PDF
        </Button>
        <Button variant="ghost">{t.cancel}</Button>
        <Button variant="danger" iconStart={<Trash2 />}>
          {t.delete}
        </Button>
      </div>
    );
  },
};

export const Sizes: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button size="sm">{t.save}</Button>
        <Button size="md">{t.save}</Button>
        <Button size="lg" variant="primary">
          {t.save}
        </Button>
      </div>
    );
  },
};

export const States: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
        <Button variant="primary" loading>
          {t.publish}
        </Button>
        <Button variant="primary" isDisabled>
          {t.publish}
        </Button>
        <Button variant="secondary" autoFocus>
          {t.save} (focus)
        </Button>
        <div style={{ width: 280 }}>
          <Button block>{t.longLabel}</Button>
        </div>
      </div>
    );
  },
};

export const Icon: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <IconButton label="Add" icon={<Plus />} />
      <IconButton label="Download" icon={<Download />} variant="secondary" />
      <IconButton label="Delete" icon={<Trash2 />} variant="danger" />
      <IconButton label="Disabled" icon={<Trash2 />} isDisabled />
    </div>
  ),
};

export const AsLink: Story = {
  render: (_, { globals }) => (
    <LinkButton href="#docs" variant="primary">
      {pick(globals.locale).publish}
    </LinkButton>
  ),
};
