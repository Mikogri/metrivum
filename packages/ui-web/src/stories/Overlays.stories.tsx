import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  Button,
  Dialog,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  TooltipTrigger,
  toast,
} from "../index";
import { pick } from "./copy";

const meta = { title: "Overlays" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Modal: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "flex", gap: 12 }}>
        <DialogTrigger>
          <Button>{t.dialogTitle}</Button>
          <Dialog
            title={t.dialogTitle}
            description={t.dialogBody}
            footer={(close) => (
              <Button variant="primary" onPress={close}>
                {t.save}
              </Button>
            )}
          >
            <TextField label={t.name} autoFocus />
          </Dialog>
        </DialogTrigger>
        <DialogTrigger>
          <Button variant="danger">{t.delete}</Button>
          <AlertDialog
            title={t.alertTitle}
            tone="danger"
            confirmLabel={t.delete}
            cancelLabel={t.cancel}
            onConfirm={() => {}}
          >
            <p>{t.alertBody}</p>
          </AlertDialog>
        </DialogTrigger>
      </div>
    );
  },
};

export const Menu: Story = {
  render: () => (
    <DropdownMenuTrigger>
      <IconButton
        label="More actions"
        icon={<MoreHorizontal />}
        variant="secondary"
      />
      <DropdownMenu placement="bottom start">
        <DropdownMenuItem id="edit" icon={<Pencil />} shortcut="E">
          Edit draft
        </DropdownMenuItem>
        <DropdownMenuItem
          id="copy"
          icon={<Copy />}
          description="Independent copy"
        >
          Make a copy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem id="delete" icon={<Trash2 />} tone="danger">
          Archive
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  ),
};

export const PopoverAndTooltip: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      <DialogTrigger>
        <Button>Open popover</Button>
        <Popover aria-label="Details" width="sm">
          <div style={{ padding: 16, fontSize: 13 }}>
            Popovers scale from their trigger.
          </div>
        </Popover>
      </DialogTrigger>
      <TooltipTrigger>
        <Button variant="ghost">Hover me</Button>
        <Tooltip>Neighbouring tooltips open instantly.</Tooltip>
      </TooltipTrigger>
    </div>
  ),
};

export const Toasts: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "flex", gap: 12 }}>
        <Button onPress={() => toast({ tone: "success", title: t.toastSaved })}>
          Success
        </Button>
        <Button
          onPress={() =>
            toast({
              tone: "danger",
              title: t.toastFailed,
              description: "Reference: 0HN7…",
            })
          }
        >
          Error
        </Button>
        <Button
          onPress={() =>
            toast({
              title: "Copied",
              action: { label: "Undo", onAction: () => {} },
            })
          }
        >
          With action
        </Button>
      </div>
    );
  },
};
