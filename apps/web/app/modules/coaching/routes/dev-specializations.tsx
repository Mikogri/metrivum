import { useState } from "react";
import { Navigate } from "react-router";
import { Button, Dialog, PageHeader } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import {
  emptySpecializations,
  SpecializationPicker,
  type SpecializationDraft,
} from "../specializations";

export const meta = () => privateMeta("Specializations preview — Metrivum");

/** Temporary: the specialization picker on its own and in a modal, to judge the design. Development builds only. */
export default function DevSpecializationsPreview() {
  const m = useT();
  const t = m.specializations;
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState<SpecializationDraft>(emptySpecializations);
  if (!import.meta.env.DEV) return <Navigate to="/app" replace />;
  return (
    <>
      <PageHeader
        title={m["ui"]["Specializations preview"]}
        description={m["ui"]["Temporary page for reviewing the picker design."]}
        actions={
          <Button variant="primary" onPress={() => setOpen(true)}>
            {m["ui"]["Open modal"]}
          </Button>
        }
      />
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title={t.title}
        description={`${t.description} ${t.limit}`}
        size="md"
        footer={(close) => (
          <>
            <Button variant="secondary" onPress={close}>
              {m.common.cancel}
            </Button>
            <Button variant="primary" onPress={close}>
              {m.common.saveChanges}
            </Button>
          </>
        )}
      >
        <SpecializationPicker value={value} onChange={setValue} />
      </Dialog>
    </>
  );
}
