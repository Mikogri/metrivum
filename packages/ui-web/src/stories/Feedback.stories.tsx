import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, FileSpreadsheet } from "lucide-react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FileCard,
  IconButton,
  Kbd,
  Skeleton,
  Spinner,
} from "../index";
import { pick } from "./copy";

const meta = { title: "Feedback" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Badges: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge dot>Queued</Badge>
      <Badge tone="info" dot>
        Processing
      </Badge>
      <Badge tone="success" dot>
        Completed
      </Badge>
      <Badge tone="danger" dot>
        Failed
      </Badge>
      <Badge tone="warning">Archived</Badge>
      <Badge tone="violet">Template</Badge>
      <Badge size="sm">v3</Badge>
    </div>
  ),
};

export const Alerts: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <Alert tone="info" title="Revisions are private snapshots." />
      <Alert tone="success" title="Import is valid.">
        3 blocks, 12 workouts ready to create.
      </Alert>
      <Alert
        tone="warning"
        title="Analysis can't run yet"
        actions={<Button size="sm">Go to library</Button>}
      >
        No analyzer is connected to this deployment.
      </Alert>
      <Alert tone="danger" title="This program changed elsewhere" />
    </div>
  ),
};

export const Empty: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
        <EmptyState
          icon={<FileSpreadsheet />}
          title={t.emptyTitle}
          description={t.emptyBody}
          actions={<Button variant="primary">{t.save}</Button>}
        />
        <ErrorState
          title={t.errorTitle}
          description={t.errorBody}
          reference="Reference: 00-4bf92f3577b34da6a3ce929d0e0e4736"
          actions={<Button>Retry</Button>}
        />
      </div>
    );
  },
};

export const Loading: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, maxWidth: 420 }} aria-busy="true">
      <Spinner label="Loading" />
      <Skeleton height="2rem" width="40%" />
      <Skeleton height="3.25rem" radius="md" />
      <Skeleton height="3.25rem" radius="md" />
    </div>
  ),
};

export const Files: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      <FileCard
        name="strength-block-a-r3.pdf"
        kind="PDF"
        meta="Revision 3 · 182 KB"
        action={<IconButton label="Download" icon={<Download />} size="sm" />}
      />
      <FileCard
        name="a-very-long-file-name-for-a-spring-hypertrophy-block-export.csv"
        kind="CSV"
        meta="UTF-8 · 3 KB"
      />
    </div>
  ),
};

export const Identity: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="Maria Nowak" size="sm" />
      <Avatar name="Coach Demo" />
      <Avatar name="Zoe" size="lg" />
      <Kbd>⌘K</Kbd>
      <Kbd>Esc</Kbd>
    </div>
  ),
};
