import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, DialogFooter, LinkButton, Option, PageHeader, Segment, SegmentedControl, Select, TextArea, TextField, toast } from "@trainflow/ui-web";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery, type Page } from "./api";
import { DraftNavigationGuard, Failure, MutationError, StatusBadge } from "./components";
import { BillingOptionsEditor, newOption, type BillingOption } from "./pricing";
import styles from "./coaching.module.css";

type Offer = Schema<"OfferDto">;

/**
 * Offer form. On its page (an existing offer) it lays the sections out in two columns with publishing
 * actions; in the side panel (a new offer) it stacks them and ends with Cancel / Create draft.
 */
export function OfferEditor({ initial, ownership, onDirtyChange, panel }: { initial?: Offer; ownership?: { id: string; name: string }; onDirtyChange?: (dirty: boolean) => void; panel?: { close: () => void } }) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(initial);
  const teamId = current?.teamId ?? ownership?.id ?? null;
  const teamName = current?.teamName ?? ownership?.name;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [coachingMode, setMode] = useState(initial?.coachingMode ?? "Online");
  const [formId, setFormId] = useState(initial?.applicationFormVersionId ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [options, setOptions] = useState<BillingOption[]>(initial?.billingOptions ?? [newOption()]);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange?.(value);
  };
  const forms = useCoachingQuery<Page<Schema<"FormTemplateDto">>>("/api/v1/forms", { purpose: "Application", pageSize: 100 });
  const categories = useCoachingQuery<Schema<"OfferCategory">[]>("/api/v1/offers/categories");
  const currency = useCoachingQuery<Schema<"AccountProfileFields">>("/api/v1/me/profile-fields");
  const mutation = useCoachingMutation<Offer>((o) => {
    flushSync(() => {
      setCurrent(o);
      setDirty(false);
    });
    if (!current) {
      toast({ tone: "success", title: "Offer saved as a draft", description: "Publish it when the terms are ready." });
      navigate(`/app/offers/${o.id}`, { replace: !panel });
    }
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const published = forms.data?.items.filter((f) => f.currentPublishedVersionId) ?? [];
  const selectedForm = formId || (published.length === 1 ? published[0]!.currentPublishedVersionId! : "");
  const selectedCategory = category || (categories.data?.length === 1 ? categories.data[0]!.key! : "");
  const locked = mutation.isPending || current?.status === "Archived";
  const action = (operation: string) => current && mutation.mutate({ method: "POST", path: `/api/v1/offers/${current.id}/${operation}`, ifMatch: current.version });
  const formChoices = [...(formId && !published.some((f) => f.currentPublishedVersionId === formId) ? [{ id: formId, name: "Current linked form version" }] : []), ...published.map((f) => ({ id: f.currentPublishedVersionId!, name: f.name }))];
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };

  const sections = [
    {
      id: "details",
      title: "Details",
      hint: "How the offer appears to people who apply.",
      body: (
        <>
          <Alert title={teamId ? `Team-owned offer · ${teamName ?? "Team"}` : "Personal offer"}>{teamId ? "New coaching cases and settled revenue from this offer belong to the organization. Applicants must explicitly accept Team ownership. Personal history stays private." : "New clients and payments from this offer belong to your private coaching practice."} Ownership cannot be changed after creation.</Alert>
          <TextField label="Offer name" placeholder="e.g. 12-week online coaching" isRequired maxLength={200} value={name} isDisabled={locked} onChange={edit(setName)} />
          <TextArea label="Description" placeholder="What clients get, how often you check in, who it's for" value={description} isDisabled={locked} onChange={edit(setDescription)} />
          <div className={styles.columns}>
            <Select label="Category" placeholder="Choose a category" isRequired isDisabled={locked} selectedKey={selectedCategory || null} onSelectionChange={(key) => edit(setCategory)(String(key))}>
              {(categories.data ?? []).map((c) => (
                <Option key={c.key} id={c.key!}>{c.name}</Option>
              ))}
            </Select>
            <TextField label="Tags" placeholder="Comma-separated, e.g. running, marathon" value={tags} isDisabled={locked} onChange={edit(setTags)} />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Coaching mode</span>
            <SegmentedControl aria-label="Coaching mode" isDisabled={locked} selectedKeys={[coachingMode]} onSelectionChange={(keys) => edit(setMode)([...keys][0] as Offer["coachingMode"])}>
              <Segment id="Online">Online</Segment>
              <Segment id="Offline">In person</Segment>
              <Segment id="Hybrid">Hybrid</Segment>
            </SegmentedControl>
          </div>
        </>
      ),
    },
    {
      id: "form",
      title: "Application form",
      hint: "Applicants fill in this published form.",
      body: forms.isError ? (
        <Failure error={forms.error} retry={() => void forms.refetch()} />
      ) : (
        <>
          <Select label="Published form" placeholder={forms.isPending ? "Loading forms…" : "Choose a published application form"} isRequired isDisabled={locked || !formChoices.length} selectedKey={selectedForm || null} onSelectionChange={(key) => edit(setFormId)(String(key))}>
            {formChoices.map((f) => (
              <Option key={f.id} id={f.id}>{f.name}</Option>
            ))}
          </Select>
          {!forms.isPending && !published.length && !formId ? (
            <Alert tone="warning" title="Publish an application form first" actions={<LinkButton href="/app/forms/new?purpose=Application" size="sm">Create form</LinkButton>}>
              An offer needs a published application form before it can be saved.
            </Alert>
          ) : null}
        </>
      ),
    },
    {
      id: "billing",
      title: "Billing options",
      hint: `Prices are in your account currency${currency.data ? ` (${currency.data.currency})` : ""}. Change it in Settings.`,
      body: <BillingOptionsEditor options={options} disabled={locked} currency={currency.data?.currency} onChange={edit(setOptions)} />,
    },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      method: current ? "PATCH" : "POST",
      path: `/api/v1/offers${current ? `/${current.id}` : ""}`,
      ifMatch: current?.version,
      json: { name: name.trim(), description, category: selectedCategory, coachingMode, applicationFormVersionId: selectedForm, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), billingOptions: options, teamId },
    });
  };
  const canSave = Boolean(name.trim() && selectedForm && selectedCategory) && !locked;

  if (panel)
    return (
      <form className={styles.panelForm} onSubmit={submit}>
        <MutationError error={mutation.error} />
        {sections.map((s) => (
          <section key={s.id} className={styles.panelSection}>
            <header className={styles.sectionHead}>
              <h2>{s.title}</h2>
              <p>{s.hint}</p>
            </header>
            {s.body}
          </section>
        ))}
        <DialogFooter>
          <Button onPress={panel.close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!canSave}>
            Create draft
          </Button>
        </DialogFooter>
      </form>
    );

  return (
    <>
      <PageHeader title={name || "Offer"} description="Clients keep the exact terms they applied for." actions={current && <StatusBadge status={current.status} />} />
      <DraftNavigationGuard dirty={dirty} />
      <form className={styles.page} onSubmit={submit}>
        {current?.currentPublishedRevisionId ? <Alert title="Published terms are preserved">Changes below stay a draft until you publish a new revision.</Alert> : null}
        <MutationError error={mutation.error} />
        {sections.map((s) => (
          <section key={s.id} className={styles.section}>
            <header className={styles.sectionHead}>
              <h2>{s.title}</h2>
              <p>{s.hint}</p>
            </header>
            <div className={styles.sectionBody}>{s.body}</div>
          </section>
        ))}
        {current?.status === "Active" ? (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2>Share</h2>
              <p>Send this link to people who want to apply.</p>
            </header>
            <div className={styles.sectionBody}>
              <TextField label="Offer link" isReadOnly value={`${window.location.origin}/app/coaches/${current.coachId}/offers/${current.id}`} />
              <div>
                <LinkButton href={`/app/coaches/${current.coachId}/offers/${current.id}`} size="sm">Open client offer page</LinkButton>
              </div>
            </div>
          </section>
        ) : null}
        <div className={styles.formActions}>
          {current ? (
            <div className={styles.actions}>
              <Button isDisabled={locked || dirty} onPress={() => action("publish")}>Publish revision</Button>
              {current.currentPublishedRevisionId ? (
                <Button isDisabled={locked || dirty} onPress={() => action(current.status === "Active" ? "deactivate" : "activate")}>{current.status === "Active" ? "Deactivate" : "Activate"}</Button>
              ) : null}
              <Button variant="ghost" isDisabled={locked || dirty} onPress={() => action("archive")}>Archive</Button>
              {dirty ? <span className={styles.muted}>Save changes before publishing.</span> : null}
            </div>
          ) : null}
          <span className={styles.spacer} />
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!canSave || !dirty}>
            Save draft
          </Button>
        </div>
      </form>
    </>
  );
}
