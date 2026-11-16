import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Archive,
  Building2,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  MapPin,
  PauseCircle,
  PlayCircle,
  Shuffle,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  DialogFooter,
  IconButton,
  LinkButton,
  Option,
  PageHeader,
  Segment,
  SegmentedControl,
  Select,
  TextArea,
  TextField,
  toast,
} from "@portable-ui/react";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery, type Page } from "./api";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import {
  DraftNavigationGuard,
  Failure,
  MutationError,
  StatusBadge,
} from "./components";
import {
  BillingOptionsEditor,
  newOption,
  priceDescription,
  type BillingOption,
} from "./pricing";
import { validateOffer } from "./offer-validation";
import styles from "./coaching.module.css";
import page from "./offer-page.module.css";

type Offer = Schema<"OfferDto">;

/**
 * Offer form. On its page (an existing offer) it lays the sections out in two columns with publishing
 * actions; in the side panel (a new offer) it stacks them and ends with Cancel / Create draft.
 */
export function OfferEditor({
  initial,
  ownership,
  onDirtyChange,
  panel,
}: {
  initial?: Offer;
  ownership?: { id: string; name: string };
  onDirtyChange?: (dirty: boolean) => void;
  panel?: { close: () => void; created?: (offer: Offer) => void };
}) {
  const uiCopy = useUiCopy();

  const navigate = useNavigate();
  const operation = useRef("save");
  const [current, setCurrent] = useState(initial);
  const teamId = current?.teamId ?? ownership?.id ?? null;
  const teamName = current?.teamName ?? ownership?.name;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [purpose, setPurpose] = useState<"CoachingService" | "TrainingPlan">(
    initial?.purpose ?? "CoachingService",
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [coachingMode, setMode] = useState(initial?.coachingMode ?? "Online");
  const [formId, setFormId] = useState(initial?.applicationFormVersionId ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [options, setOptions] = useState<BillingOption[]>(
    initial?.billingOptions ?? [newOption()],
  );
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange?.(value);
  };
  const forms = useCoachingQuery<Page<Schema<"FormTemplateDto">>>(
    "/api/v1/forms",
    { purpose: "Application", pageSize: 100 },
  );
  const categories = useCoachingQuery<Schema<"OfferCategoryDto">[]>(
    "/api/v1/offers/categories",
  );
  const currency = useCoachingQuery<Schema<"AccountProfileFields">>(
    "/api/v1/me/profile-fields",
  );
  const mutation = useCoachingMutation<Offer>((o) => {
    toast({
      tone: "success",
      title:
        operation.current === "publish"
          ? "Offer published"
          : operation.current === "archive"
            ? "Offer archived"
            : operation.current === "activate"
              ? "Offer activated"
              : operation.current === "deactivate"
                ? "Offer deactivated"
                : current
                  ? "Offer draft saved"
                  : "Offer saved as a draft",
    });
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
  const published =
    forms.data?.items.filter((f) => f.currentPublishedVersionId) ?? [];
  const selectedForm = formId;
  const selectedCategory =
    category || (categories.data?.length === 1 ? categories.data[0]!.key! : "");
  const locked = mutation.isPending || current?.status === "Archived";
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const remove = useCoachingMutation(() => {
    toast({ tone: "success", title: uiCopy["ui"]["Offer deleted"] });
    setDirty(false);
    navigate("/app/offers", { replace: true });
  });
  // An offer a client was ever on stays in the records: it can be archived, never deleted.
  const deleteOffer = async () => {
    if (
      !current ||
      !(await ask({
        title: uiCopy["ui"]["Delete this draft?"],
        body: "This offer was never published, so it can be removed completely. This cannot be undone.",
        confirmLabel: uiCopy["ui"]["Delete draft"],
        cancelLabel: uiCopy["ui"]["Keep draft"],
      }))
    )
      return;
    remove.mutate({
      method: "DELETE",
      path: `/api/v1/offers/${current.id}`,
      ifMatch: current.version,
    });
  };
  const action = async (action: string) => {
    if (
      action === "archive" &&
      !(await ask({
        title: uiCopy["ui"]["Archive this offer?"],
        body: "It disappears from your public offers and can no longer receive applications. Existing clients keep their accepted terms.",
        confirmLabel: uiCopy["ui"]["Archive offer"],
        cancelLabel: uiCopy["ui"]["Keep offer"],
      }))
    )
      return;
    if (
      action === "deactivate" &&
      !(await ask({
        title: uiCopy["ui"]["Deactivate this offer?"],
        body: "It stops taking new applications and leaves your public offers. Current clients keep their terms, and you can activate it again later.",
        confirmLabel: uiCopy["ui"]["Deactivate offer"],
        cancelLabel: uiCopy["ui"]["Keep it open"],
      }))
    )
      return;
    operation.current = action;
    if (current)
      mutation.mutate({
        method: "POST",
        path: `/api/v1/offers/${current.id}/${action}`,
        ifMatch: current.version,
      });
  };
  const formChoices = [
    ...(formId && !published.some((f) => f.currentPublishedVersionId === formId)
      ? [{ id: formId, name: "Current linked form version" }]
      : []),
    ...published.map((f) => ({
      id: f.currentPublishedVersionId!,
      name: f.name,
    })),
  ];
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };

  const sections = [
    {
      id: "details",
      title: uiCopy["video"]["new"]["step"]["details"],
      hint: "How the offer appears to people who apply.",
      body: (
        <>
          {panel ? (
            <Alert
              title={
                teamId
                  ? `Team-owned offer · ${teamName ?? "Team"}`
                  : uiCopy["ui"]["Personal offer"]
              }
            >
              {teamId
                ? uiCopy["ui"][
                    "New coaching cases and settled revenue from this offer belong to the organization. Applicants must explicitly accept Team ownership. Personal history stays private."
                  ]
                : uiCopy["ui"][
                    "New clients and payments from this offer belong to your private coaching practice."
                  ]}{" "}
              {uiCopy["ui"]["Ownership cannot be changed after creation."]}
            </Alert>
          ) : null}
          <Select
            label={uiCopy["ui"]["Offer type"]}
            selectedKey={purpose}
            isDisabled={locked}
            onSelectionChange={(key) => {
              const next = key as typeof purpose;
              edit(setPurpose)(next);
              setOptions([
                newOption(next === "TrainingPlan" ? "OneTime" : "PerSession"),
              ]);
            }}
          >
            <Option id="CoachingService">
              {uiCopy["ui"]["Coaching service"]}
            </Option>
            <Option id="TrainingPlan">{uiCopy["ui"]["Training plan"]}</Option>
          </Select>
          <TextField
            label={uiCopy["ui"]["Offer name"]}
            placeholder={uiCopy["ui"]["e.g. 12-week online coaching"]}
            isRequired
            maxLength={200}
            value={name}
            isDisabled={locked}
            onChange={edit(setName)}
          />
          <TextArea
            maxLength={4000}
            label={uiCopy["training"]["library"]["createDialog"]["description"]}
            placeholder={
              uiCopy["ui"][
                "What clients get, how often you check in, who it's for"
              ]
            }
            value={description}
            isDisabled={locked}
            onChange={edit(setDescription)}
          />
          <div className={styles.columns}>
            <Select
              label={uiCopy["ui"]["Category"]}
              placeholder={uiCopy["ui"]["Choose a category"]}
              isRequired
              isDisabled={locked}
              selectedKey={selectedCategory || null}
              onSelectionChange={(key) => edit(setCategory)(String(key))}
            >
              {(categories.data ?? []).map((c) => (
                <Option key={c.key} id={c.key!}>
                  {c.name}
                </Option>
              ))}
            </Select>
            <TextField
              label={uiCopy["video"]["new"]["tags"]}
              placeholder={
                uiCopy["ui"]["Comma-separated, e.g. running, marathon"]
              }
              value={tags}
              isDisabled={locked}
              onChange={edit(setTags)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>
              {uiCopy["discovery"]["mode"]}
            </span>
            <SegmentedControl
              aria-label={uiCopy["discovery"]["mode"]}
              isDisabled={locked}
              selectedKeys={[coachingMode]}
              onSelectionChange={(keys) =>
                edit(setMode)([...keys][0] as Offer["coachingMode"])
              }
            >
              <Segment id="Online">{uiCopy["ui"]["Online"]}</Segment>
              <Segment id="Offline">
                {uiCopy["profile"]["modes"]["Offline"]}
              </Segment>
              <Segment id="Hybrid">
                {uiCopy["profile"]["modes"]["Hybrid"]}
              </Segment>
            </SegmentedControl>
          </div>
        </>
      ),
    },
    {
      id: "form",
      title: uiCopy["ui"]["Application form"],
      hint: "Choose a published form, or let clients apply without answering questions.",
      body: (
        <>
          {forms.isError && (
            <Failure error={forms.error} retry={() => void forms.refetch()} />
          )}
          <Select
            label={uiCopy["ui"]["Application form"]}
            isDisabled={locked}
            selectedKey={selectedForm || "none"}
            onSelectionChange={(key) =>
              edit(setFormId)(key === "none" ? "" : String(key))
            }
          >
            <Option id="none">{uiCopy["ui"]["No application form"]}</Option>
            {formChoices.map((f) => (
              <Option key={f.id} id={f.id}>
                {f.name}
              </Option>
            ))}
          </Select>
          {!selectedForm ? (
            <Alert
              title={uiCopy["ui"]["No questions required"]}
              actions={
                <LinkButton href="/app/forms/new?purpose=Application" size="sm">
                  {uiCopy["ui"]["Create a form instead"]}
                </LinkButton>
              }
            >
              {
                uiCopy["ui"][
                  "Clients review the offer and submit an application. You still decide whether to accept it."
                ]
              }
            </Alert>
          ) : null}
        </>
      ),
    },
    {
      id: "billing",
      title: uiCopy["ui"]["Pricing"],
      hint: `Prices are in your account currency${currency.data ? ` (${currency.data.currency})` : ""}. Change it in Settings.`,
      body: (
        <BillingOptionsEditor
          purpose={purpose}
          options={options}
          disabled={locked}
          currency={currency.data?.currency}
          onChange={edit(setOptions)}
        />
      ),
    },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      description,
      category: selectedCategory,
      coachingMode,
      applicationFormVersionId: selectedForm || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      billingOptions: options,
      teamId,
      purpose,
    };
    const error = validateOffer(payload);
    if (error) {
      toast({
        tone: "danger",
        title: uiCopy["ui"]["Check the offer details"],
        description: error,
      });
      return;
    }
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
          <Button onPress={panel.close}>{uiCopy["common"]["cancel"]}</Button>
          <Button
            type="submit"
            variant="primary"
            loading={
              mutation.isPending &&
              !/\/(publish|activate|deactivate|archive)$/.test(
                mutation.variables?.path ?? "",
              )
            }
            isDisabled={!canSave}
          >
            {uiCopy["ui"]["Create draft"]}
          </Button>
        </DialogFooter>
      </form>
    );

  const status = current?.status ?? "Draft";
  const steps: Array<{
    id: string;
    label: string;
    done: boolean;
    current: boolean;
  }> = [
    {
      id: "draft",
      label: uiCopy["ui"]["Draft saved"],
      done: Boolean(current),
      current: !current?.currentPublishedRevisionId,
    },
    {
      id: "published",
      label: uiCopy["ui"]["Revision published"],
      done: Boolean(current?.currentPublishedRevisionId),
      current:
        Boolean(current?.currentPublishedRevisionId) && status !== "Active",
    },
    {
      id: "active",
      label: uiCopy["ui"]["Open for applications"],
      done: status === "Active",
      current: status === "Active",
    },
  ];
  const link = current
    ? `${window.location.origin}/app/coaches/${current.coachId}/offers/${current.id}`
    : "";
  const modeLabel =
    { Online: "Online", Offline: "In person", Hybrid: "Hybrid" }[
      coachingMode
    ] ?? coachingMode;
  const categoryName = categories.data?.find(
    (c) => c.key === selectedCategory,
  )?.name;
  const cur = currency.data?.currency ?? "EUR";
  const ModeIcon =
    coachingMode === "Offline"
      ? MapPin
      : coachingMode === "Hybrid"
        ? Shuffle
        : Globe;

  return (
    <>
      <PageHeader
        title={name || uiCopy["ui"]["Offer"]}
        description={
          uiCopy["ui"]["Clients keep the exact terms they applied for."]
        }
        meta={
          <>
            <StatusBadge status={status} />
            <span className={page.chip}>
              {teamId ? (
                <>
                  <Building2 aria-hidden="true" />{" "}
                  {teamName ?? uiCopy["ui"]["Team"]} {uiCopy["ui"]["offer"]}
                </>
              ) : (
                <>
                  <UserRound aria-hidden="true" />{" "}
                  {uiCopy["ui"]["Personal offer"]}
                </>
              )}
            </span>
          </>
        }
      />
      <DraftNavigationGuard dirty={dirty} />
      <form noValidate className={page.layout} onSubmit={submit}>
        <div className={page.main}>
          {current?.currentPublishedRevisionId ? (
            <Alert title={uiCopy["ui"]["Published terms are preserved"]}>
              {
                uiCopy["ui"][
                  "Changes below stay a draft until you publish a new revision."
                ]
              }
            </Alert>
          ) : null}
          <MutationError error={mutation.error} />
          {sections.map((s, i) => (
            <Card
              as="section"
              padding="none"
              key={s.id}
              className={page.card}
              aria-labelledby={`offer-${s.id}`}
            >
              <header className={page.cardHead}>
                <span className={page.step} aria-hidden="true">
                  {i + 1}
                </span>
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
          <Card
            as="section"
            padding="none"
            className={page.card}
            aria-labelledby="offer-publishing"
          >
            <header className={page.cardHead}>
              <div>
                <h2 id="offer-publishing">{uiCopy["ui"]["Publishing"]}</h2>
                <p>
                  {dirty
                    ? uiCopy["ui"]["Save your changes before publishing."]
                    : teamId
                      ? uiCopy["ui"][
                          "Revenue and new cases belong to the Team. Ownership can't change."
                        ]
                      : uiCopy["ui"][
                          "Clients and payments belong to your own practice."
                        ]}
                </p>
              </div>
            </header>
            <div className={page.cardBody}>
              {/* Whether clients can see the offer, said plainly before the steps. */}
              {!current?.currentPublishedRevisionId ? (
                <p className={page.publishState} data-state="unpublished">
                  <EyeOff aria-hidden="true" />
                  <span>
                    <strong>{uiCopy["editor"]["draftState"]["never"]}</strong>
                    {uiCopy["ui"]["Clients can't see this offer yet."]}
                  </span>
                </p>
              ) : status === "Active" ? (
                <p className={page.publishState} data-state="active">
                  <CircleCheck aria-hidden="true" />
                  <span>
                    <strong>{uiCopy["ui"]["Published · open"]}</strong>
                    {uiCopy["ui"]["Clients can see it and apply."]}
                  </span>
                </p>
              ) : (
                <p className={page.publishState} data-state="inactive">
                  <PauseCircle aria-hidden="true" />
                  <span>
                    <strong>{uiCopy["ui"]["Published · not active"]}</strong>
                    {uiCopy["ui"]["Clients can't apply until you activate it."]}
                  </span>
                </p>
              )}
              <ol className={page.steps}>
                {steps.map((step) => (
                  <li
                    key={step.id}
                    data-done={step.done || undefined}
                    data-current={step.current || undefined}
                  >
                    <span className={page.stepDot} aria-hidden="true">
                      {step.done ? <Check /> : null}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
              <div className={page.buttons}>
                <Button
                  type="submit"
                  variant="secondary"
                  block
                  loading={
                    mutation.isPending &&
                    !/\/(publish|activate|deactivate|archive)$/.test(
                      mutation.variables?.path ?? "",
                    )
                  }
                  isDisabled={!canSave || !dirty}
                >
                  {uiCopy["editor"]["save"]}
                </Button>
                {current ? (
                  <>
                    <Button
                      variant="success"
                      block
                      loading={
                        mutation.isPending &&
                        mutation.variables?.path.endsWith("/publish")
                      }
                      iconStart={<Upload />}
                      isDisabled={locked || dirty}
                      onPress={() => void action("publish")}
                    >
                      {uiCopy["ui"]["Publish revision"]}
                    </Button>
                    {current.currentPublishedRevisionId ? (
                      <Button
                        variant={
                          current.status === "Active" ? "danger" : "success"
                        }
                        block
                        loading={
                          mutation.isPending &&
                          /\/(activate|deactivate)$/.test(
                            mutation.variables?.path ?? "",
                          )
                        }
                        iconStart={
                          current.status === "Active" ? (
                            <PauseCircle />
                          ) : (
                            <PlayCircle />
                          )
                        }
                        isDisabled={locked || dirty}
                        onPress={() =>
                          void action(
                            current.status === "Active"
                              ? "deactivate"
                              : "activate",
                          )
                        }
                      >
                        {current.status === "Active"
                          ? uiCopy["ui"]["Deactivate"]
                          : uiCopy["ui"]["Activate"]}
                      </Button>
                    ) : null}
                    <Button
                      variant="danger-ghost"
                      block
                      loading={
                        mutation.isPending &&
                        mutation.variables?.path.endsWith("/archive")
                      }
                      iconStart={<Archive />}
                      isDisabled={locked || dirty || remove.isPending}
                      onPress={() => void action("archive")}
                    >
                      {uiCopy["common"]["archive"]}
                    </Button>
                    {current.currentPublishedRevisionId ? (
                      <p className={page.hint}>
                        {current.hasClientHistory
                          ? uiCopy["ui"][
                              "Clients have been on this offer, so it can only be archived."
                            ]
                          : uiCopy["ui"][
                              "Published offers keep their terms for clients and records. Archive it instead of deleting."
                            ]}
                      </p>
                    ) : (
                      <Button
                        variant="danger-ghost"
                        block
                        loading={remove.isPending}
                        iconStart={<Trash2 />}
                        isDisabled={mutation.isPending || dirty}
                        onPress={() => void deleteOffer()}
                      >
                        {uiCopy["ui"]["Delete draft"]}
                      </Button>
                    )}
                    <MutationError error={remove.error} />
                    {confirmDialog}
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          {current?.status === "Active" ? (
            <Card
              as="section"
              padding="none"
              className={page.card}
              aria-labelledby="offer-share"
            >
              <header className={page.cardHead}>
                <div>
                  <h2 id="offer-share">{uiCopy["video"]["share"]["action"]}</h2>
                  <p>
                    {
                      uiCopy["ui"][
                        "Send this link to people who want to apply."
                      ]
                    }
                  </p>
                </div>
              </header>
              <div className={page.cardBody}>
                <div className={page.linkRow}>
                  <TextField
                    aria-label={uiCopy["ui"]["Offer link"]}
                    placeholder={uiCopy["ui"]["Link appears after publishing"]}
                    isReadOnly
                    value={link}
                    className={page.grow}
                  />
                  <IconButton
                    label={uiCopy["video"]["share"]["copy"]}
                    icon={<Copy />}
                    onPress={() => {
                      void navigator.clipboard?.writeText(link);
                      toast({
                        tone: "success",
                        title: uiCopy["video"]["share"]["copied"],
                      });
                    }}
                  />
                </div>
                <LinkButton
                  href={`/app/coaches/${current.coachId}/offers/${current.id}`}
                  size="sm"
                  variant="ghost"
                  iconStart={<ExternalLink />}
                >
                  {uiCopy["ui"]["Open client offer page"]}
                </LinkButton>
              </div>
            </Card>
          ) : null}

          {/* What an applicant sees, updated as you type. */}
          <section className={page.preview} aria-labelledby="offer-preview">
            <h2 id="offer-preview" className={page.previewLabel}>
              <Eye aria-hidden="true" /> {uiCopy["ui"]["Client preview"]}
            </h2>
            <div className={page.previewCard}>
              <div className={page.previewTags}>
                <span>
                  <ModeIcon aria-hidden="true" /> {modeLabel}
                </span>
                {categoryName ? <span>{categoryName}</span> : null}
              </div>
              <p className={page.previewName}>
                {name || uiCopy["ui"]["Untitled offer"]}
              </p>
              <p className={page.previewText}>
                {description || uiCopy["ui"]["Your description appears here."]}
              </p>
              <ul className={page.previewPrices}>
                {options.map((o, i) => (
                  <li key={o.id}>
                    <span>{o.name || `Option ${i + 1}`}</span>
                    <strong>{priceDescription(o, cur)}</strong>
                  </li>
                ))}
              </ul>
              {tags.trim() ? (
                <p className={page.previewTagsLine}>
                  {tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => `#${t}`)
                    .join("  ")}
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </form>
    </>
  );
}
