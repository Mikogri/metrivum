import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Archive, Building2, Check, CircleCheck, Copy, ExternalLink, Eye, EyeOff, Globe, MapPin, PauseCircle, PlayCircle, Shuffle, Trash2, Upload, UserRound } from "lucide-react";
import { Alert, Button, Card, DialogFooter, IconButton, LinkButton, Option, PageHeader, Segment, SegmentedControl, Select, TextArea, TextField, toast } from "@trainflow/ui-web";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery, type Page } from "./api";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { DraftNavigationGuard, Failure, MutationError, StatusBadge } from "./components";
import { BillingOptionsEditor, newOption, priceDescription, type BillingOption } from "./pricing";
import { validateOffer } from "./offer-validation";
import styles from "./coaching.module.css";
import page from "./offer-page.module.css";

type Offer = Schema<"OfferDto">;

/**
 * Offer form. On its page (an existing offer) it lays the sections out in two columns with publishing
 * actions; in the side panel (a new offer) it stacks them and ends with Cancel / Create draft.
 */
export function OfferEditor({ initial, ownership, onDirtyChange, panel }: { initial?: Offer; ownership?: { id: string; name: string }; onDirtyChange?: (dirty: boolean) => void; panel?: { close: () => void; created?: (offer: Offer) => void } }) {
  const navigate = useNavigate();
  const operation = useRef("save");
  const [current, setCurrent] = useState(initial);
  const teamId = current?.teamId ?? ownership?.id ?? null;
  const teamName = current?.teamName ?? ownership?.name;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [purpose, setPurpose] = useState<"CoachingService" | "TrainingPlan">(initial?.purpose ?? "CoachingService");
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
  const categories = useCoachingQuery<Schema<"OfferCategoryDto">[]>("/api/v1/offers/categories");
  const currency = useCoachingQuery<Schema<"AccountProfileFields">>("/api/v1/me/profile-fields");
  const mutation = useCoachingMutation<Offer>((o) => {
    toast({ tone: "success", title: operation.current === "publish" ? "Offer published" : operation.current === "archive" ? "Offer archived" : operation.current === "activate" ? "Offer activated" : operation.current === "deactivate" ? "Offer deactivated" : current ? "Offer draft saved" : "Offer saved as a draft" });
    flushSync(() => {
      setCurrent(o);
      setDirty(false);
    });
    // A new offer made in the side panel closes it and stays on the list; elsewhere it opens the offer.
    if (!current) {
      if (panel?.created) panel.created(o);
      else navigate(`/app/offers/${o.id}`, { replace: !panel });
    }
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const published = forms.data?.items.filter((f) => f.currentPublishedVersionId) ?? [];
  const selectedForm = formId;
  const selectedCategory = category || (categories.data?.length === 1 ? categories.data[0]!.key! : "");
  const locked = mutation.isPending || current?.status === "Archived";
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const remove = useCoachingMutation(() => {
    toast({ tone: "success", title: "Offer deleted" });
    setDirty(false);
    navigate("/app/offers", { replace: true });
  });
  // An offer a client was ever on stays in the records: it can be archived, never deleted.
  const deleteOffer = async () => {
    if (!current || !(await ask({ title: "Delete this draft?", body: "This offer was never published, so it can be removed completely. This cannot be undone.", confirmLabel: "Delete draft", cancelLabel: "Keep draft" }))) return;
    remove.mutate({ method: "DELETE", path: `/api/v1/offers/${current.id}`, ifMatch: current.version });
  };
  const action = async (action: string) => {
    if (action === "archive" && !(await ask({ title: "Archive this offer?", body: "It disappears from your public offers and can no longer receive applications. Existing clients keep their accepted terms.", confirmLabel: "Archive offer", cancelLabel: "Keep offer" }))) return;
    if (action === "deactivate" && !(await ask({ title: "Deactivate this offer?", body: "It stops taking new applications and leaves your public offers. Current clients keep their terms, and you can activate it again later.", confirmLabel: "Deactivate offer", cancelLabel: "Keep it open" }))) return;
    operation.current = action; if (current) mutation.mutate({ method: "POST", path: `/api/v1/offers/${current.id}/${action}`, ifMatch: current.version }); };
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
          {panel ? <Alert title={teamId ? `Team-owned offer · ${teamName ?? "Team"}` : "Personal offer"}>{teamId ? "New coaching cases and settled revenue from this offer belong to the organization. Applicants must explicitly accept Team ownership. Personal history stays private." : "New clients and payments from this offer belong to your private coaching practice."} Ownership cannot be changed after creation.</Alert> : null}
          <Select label="Offer type" selectedKey={purpose} isDisabled={locked} onSelectionChange={key => { const next = key as typeof purpose; edit(setPurpose)(next); setOptions([newOption(next === "TrainingPlan" ? "OneTime" : "PerSession")]); }}><Option id="CoachingService">Coaching service</Option><Option id="TrainingPlan">Training plan</Option></Select>
          <TextField label="Offer name" placeholder="e.g. 12-week online coaching" isRequired maxLength={200} value={name} isDisabled={locked} onChange={edit(setName)} />
          <TextArea maxLength={4000} label="Description" placeholder="What clients get, how often you check in, who it's for" value={description} isDisabled={locked} onChange={edit(setDescription)} />
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
      hint: "Choose a published form, or let clients apply without answering questions.",
      body: (
        <>
          {forms.isError && <Failure error={forms.error} retry={() => void forms.refetch()} />}
          <Select label="Application form" isDisabled={locked} selectedKey={selectedForm || "none"} onSelectionChange={(key) => edit(setFormId)(key === "none" ? "" : String(key))}>
            <Option id="none">No application form</Option>
            {formChoices.map((f) => (
              <Option key={f.id} id={f.id}>{f.name}</Option>
            ))}
          </Select>
          {!selectedForm ? (
            <Alert title="No questions required" actions={<LinkButton href="/app/forms/new?purpose=Application" size="sm">Create a form instead</LinkButton>}>
              Clients review the offer and submit an application. You still decide whether to accept it.
            </Alert>
          ) : null}
        </>
      ),
    },
    {
      id: "billing",
      title: "Pricing",
      hint: `Prices are in your account currency${currency.data ? ` (${currency.data.currency})` : ""}. Change it in Settings.`,
      body: <BillingOptionsEditor purpose={purpose} options={options} disabled={locked} currency={currency.data?.currency} onChange={edit(setOptions)} />,
    },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: name.trim(), description, category: selectedCategory, coachingMode, applicationFormVersionId: selectedForm || null, tags: tags.split(",").map(t => t.trim()).filter(Boolean), billingOptions: options, teamId, purpose };
    const error = validateOffer(payload);
    if (error) { toast({ tone: "danger", title: "Check the offer details", description: error }); return; }
    operation.current = "save";
    mutation.mutate({
      method: current ? "PATCH" : "POST",
      path: `/api/v1/offers${current ? `/${current.id}` : ""}`,
      ifMatch: current?.version,
      json: payload,
    });
  };
  const canSave = !locked;

  if (panel)
    return (
      <form noValidate className={styles.panelForm} onSubmit={submit}>
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
          <Button type="submit" variant="primary" loading={mutation.isPending && !/\/(publish|activate|deactivate|archive)$/.test(mutation.variables?.path ?? "")} isDisabled={!canSave}>
            Create draft
          </Button>
        </DialogFooter>
      </form>
    );

  const status = current?.status ?? "Draft";
  const steps: Array<{ id: string; label: string; done: boolean; current: boolean }> = [
    { id: "draft", label: "Draft saved", done: Boolean(current), current: !current?.currentPublishedRevisionId },
    { id: "published", label: "Revision published", done: Boolean(current?.currentPublishedRevisionId), current: Boolean(current?.currentPublishedRevisionId) && status !== "Active" },
    { id: "active", label: "Open for applications", done: status === "Active", current: status === "Active" },
  ];
  const link = current ? `${window.location.origin}/app/coaches/${current.coachId}/offers/${current.id}` : "";
  const modeLabel = { Online: "Online", Offline: "In person", Hybrid: "Hybrid" }[coachingMode] ?? coachingMode;
  const categoryName = categories.data?.find((c) => c.key === selectedCategory)?.name;
  const cur = currency.data?.currency ?? "EUR";
  const ModeIcon = coachingMode === "Offline" ? MapPin : coachingMode === "Hybrid" ? Shuffle : Globe;

  return (
    <>
      <PageHeader
        title={name || "Offer"}
        description="Clients keep the exact terms they applied for."
        meta={
          <>
            <StatusBadge status={status} />
            <span className={page.chip}>{teamId ? <><Building2 aria-hidden="true" /> {teamName ?? "Team"} offer</> : <><UserRound aria-hidden="true" /> Personal offer</>}</span>
          </>
        }
      />
      <DraftNavigationGuard dirty={dirty} />
      <form noValidate className={page.layout} onSubmit={submit}>
        <div className={page.main}>
          {current?.currentPublishedRevisionId ? <Alert title="Published terms are preserved">Changes below stay a draft until you publish a new revision.</Alert> : null}
          <MutationError error={mutation.error} />
          {sections.map((s, i) => (
            <Card as="section" padding="none" key={s.id} className={page.card} aria-labelledby={`offer-${s.id}`}>
              <header className={page.cardHead}>
                <span className={page.step} aria-hidden="true">{i + 1}</span>
                <div>
                  <h2 id={`offer-${s.id}`}>{s.title}</h2>
                  <p>{s.hint}</p>
                </div>
              </header>
              <div className={page.cardBody}>{s.body}</div>
            </Card>
          ))}
        </div>

        <aside className={page.aside}>
          <Card as="section" padding="none" className={page.card} aria-labelledby="offer-publishing">
            <header className={page.cardHead}>
              <div>
                <h2 id="offer-publishing">Publishing</h2>
                <p>{dirty ? "Save your changes before publishing." : teamId ? "Revenue and new cases belong to the Team. Ownership can't change." : "Clients and payments belong to your own practice."}</p>
              </div>
            </header>
            <div className={page.cardBody}>
              {/* Whether clients can see the offer, said plainly before the steps. */}
              {!current?.currentPublishedRevisionId ? (
                <p className={page.publishState} data-state="unpublished"><EyeOff aria-hidden="true" /><span><strong>Not published</strong>Clients can't see this offer yet.</span></p>
              ) : status === "Active" ? (
                <p className={page.publishState} data-state="active"><CircleCheck aria-hidden="true" /><span><strong>Published · open</strong>Clients can see it and apply.</span></p>
              ) : (
                <p className={page.publishState} data-state="inactive"><PauseCircle aria-hidden="true" /><span><strong>Published · not active</strong>Clients can't apply until you activate it.</span></p>
              )}
              <ol className={page.steps}>
                {steps.map((step) => (
                  <li key={step.id} data-done={step.done || undefined} data-current={step.current || undefined}>
                    <span className={page.stepDot} aria-hidden="true">{step.done ? <Check /> : null}</span>
                    {step.label}
                  </li>
                ))}
              </ol>
              <div className={page.buttons}>
                <Button type="submit" variant="secondary" block loading={mutation.isPending && !/\/(publish|activate|deactivate|archive)$/.test(mutation.variables?.path ?? "")} isDisabled={!canSave || !dirty}>
                  Save draft
                </Button>
                {current ? (
                  <>
                    <Button variant="success" block loading={mutation.isPending && mutation.variables?.path.endsWith("/publish")} iconStart={<Upload />} isDisabled={locked || dirty} onPress={() => void action("publish")}>Publish revision</Button>
                    {current.currentPublishedRevisionId ? (
                      <Button variant={current.status === "Active" ? "danger" : "success"} block loading={mutation.isPending && /\/(activate|deactivate)$/.test(mutation.variables?.path ?? "")} iconStart={current.status === "Active" ? <PauseCircle /> : <PlayCircle />} isDisabled={locked || dirty} onPress={() => void action(current.status === "Active" ? "deactivate" : "activate")}>{current.status === "Active" ? "Deactivate" : "Activate"}</Button>
                    ) : null}
                    <Button variant="danger-ghost" block loading={mutation.isPending && mutation.variables?.path.endsWith("/archive")} iconStart={<Archive />} isDisabled={locked || dirty || remove.isPending} onPress={() => void action("archive")}>Archive</Button>
                    {current.currentPublishedRevisionId ? (
                      <p className={page.hint}>{current.hasClientHistory ? "Clients have been on this offer, so it can only be archived." : "Published offers keep their terms for clients and records. Archive it instead of deleting."}</p>
                    ) : (
                      <Button variant="danger-ghost" block loading={remove.isPending} iconStart={<Trash2 />} isDisabled={mutation.isPending || dirty} onPress={() => void deleteOffer()}>Delete draft</Button>
                    )}
                    <MutationError error={remove.error} />{confirmDialog}
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          {current?.status === "Active" ? (
            <Card as="section" padding="none" className={page.card} aria-labelledby="offer-share">
              <header className={page.cardHead}>
                <div>
                  <h2 id="offer-share">Share</h2>
                  <p>Send this link to people who want to apply.</p>
                </div>
              </header>
              <div className={page.cardBody}>
                <div className={page.linkRow}>
                  <TextField aria-label="Offer link" placeholder="Link appears after publishing" isReadOnly value={link} className={page.grow} />
                  <IconButton label="Copy link" icon={<Copy />} onPress={() => { void navigator.clipboard?.writeText(link); toast({ tone: "success", title: "Link copied" }); }} />
                </div>
                <LinkButton href={`/app/coaches/${current.coachId}/offers/${current.id}`} size="sm" variant="ghost" iconStart={<ExternalLink />}>Open client offer page</LinkButton>
              </div>
            </Card>
          ) : null}

          {/* What an applicant sees, updated as you type. */}
          <section className={page.preview} aria-labelledby="offer-preview">
            <h2 id="offer-preview" className={page.previewLabel}><Eye aria-hidden="true" /> Client preview</h2>
            <div className={page.previewCard}>
              <div className={page.previewTags}>
                <span><ModeIcon aria-hidden="true" /> {modeLabel}</span>
                {categoryName ? <span>{categoryName}</span> : null}
              </div>
              <p className={page.previewName}>{name || "Untitled offer"}</p>
              <p className={page.previewText}>{description || "Your description appears here."}</p>
              <ul className={page.previewPrices}>
                {options.map((o, i) => (
                  <li key={o.id}>
                    <span>{o.name || `Option ${i + 1}`}</span>
                    <strong>{priceDescription(o, cur)}</strong>
                  </li>
                ))}
              </ul>
              {tags.trim() ? <p className={page.previewTagsLine}>{tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => `#${t}`).join("  ")}</p> : null}
            </div>
          </section>
        </aside>
      </form>
    </>
  );
}
