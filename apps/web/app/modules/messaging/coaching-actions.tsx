import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardList,
  MailOpen,
  MoreHorizontal,
} from "lucide-react";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Button,
  Dialog,
  DialogFooter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Option,
  Select,
  toast,
} from "@metrivum/ui-web";
import { useAccountContext } from "~/shared/session";
import { useFeatureAccess } from "~/shared/access";
import {
  InvitationDialog,
  NoActiveOffers,
  OfferDialog,
  useCoachingQuery,
  type Page,
} from "~/modules/coaching";
import { root } from "./api";
import type { Message } from "./model";
import styles from "./messaging.module.css";

// Only application-owned destinations become links; arbitrary message text stays text.
export function chatDestination(line: string) {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(
    `^/app/(?:coaches/${uuid}/offers/${uuid}|invitations/${uuid})$`,
    "i",
  ).test(line);
}

/** "Coaching invitation: <offer>" or "Application form: <offer>" followed by its link, as sent from the chat. */
export function coachingCard(
  body: string | null | undefined,
  entry?: Message["coachingEntry"],
): { kind: "invitation" | "form"; title: string; href: string } | null {
  if (entry)
    return {
      kind: entry.kind === "Invitation" ? "invitation" : "form",
      title: entry.title,
      href:
        entry.kind === "Invitation"
          ? `/app/invitations/${entry.invitationId}`
          : `/app/coaches/${entry.coachId}/offers/${entry.offerId}`,
    };
  const [first, second, ...rest] = (body ?? "").split("\n");
  if (rest.length || !first || !second || !chatDestination(second)) return null;
  const match = /^(Coaching invitation|Application form): (.+)$/.exec(first);
  if (!match) return null;
  return {
    kind: match[1] === "Coaching invitation" ? "invitation" : "form",
    title: match[2]!,
    href: second,
  };
}

/** Invitations and application forms read as an action card, not as a text bubble. Its button opens the details in a modal. */
export function CoachingCard({
  card,
  mine,
}: {
  card: NonNullable<ReturnType<typeof coachingCard>>;
  mine: boolean;
}) {
  const uiCopy = useUiCopy();

  const [open, setOpen] = useState(false);
  const Icon = card.kind === "invitation" ? MailOpen : ClipboardList;
  // "/app/invitations/<id>" or "/app/coaches/<coachId>/offers/<offerId>"; chatDestination() already validated the shape.
  const parts = card.href.split("/");
  return (
    <div
      className={styles.actionCard}
      data-mine={mine || undefined}
      data-kind={card.kind}
    >
      <span className={styles.actionIcon} aria-hidden="true">
        <Icon />
      </span>
      <span className={styles.actionText}>
        <span className={styles.actionKind}>
          {card.kind === "invitation"
            ? uiCopy["ui"]["Coaching invitation"]
            : uiCopy["ui"]["Application form"]}
        </span>
        <span className={styles.actionTitle}>{card.title}</span>
      </span>
      <button
        type="button"
        className={styles.actionLink}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {card.kind === "invitation"
          ? uiCopy["ui"]["View invitation"]
          : uiCopy["ui"]["Open application form"]}
        <ArrowRight aria-hidden="true" />
      </button>
      {open &&
        (card.kind === "invitation" ? (
          <InvitationDialog
            invitationId={parts[3]!}
            close={() => setOpen(false)}
          />
        ) : (
          <OfferDialog
            coachId={parts[3]!}
            offerId={parts[5]!}
            close={() => setOpen(false)}
          />
        ))}
    </div>
  );
}

export function MessageText({ body }: { body: string }) {
  const uiCopy = useUiCopy();

  return body.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {chatDestination(line) ? (
        <Link to={line}>
          {line.includes("/offers/")
            ? uiCopy["ui"]["Open application form"]
            : uiCopy["ui"]["View invitation"]}
        </Link>
      ) : (
        line
      )}
    </Fragment>
  ));
}

export function CoachingActions({
  conversationId,
  username,
  recipientId,
  disabled,
  onSent,
}: {
  conversationId: string;
  username: string;
  recipientId: string;
  disabled: boolean;
  onSent: () => void;
}) {
  const uiCopy = useUiCopy();

  const allowed = useFeatureAccess("coaching.invitations.send").allowed;
  const [kind, setKind] = useState<"form" | "invitation" | null>(null);
  if (!allowed) return null;
  return (
    <>
      <DropdownMenuTrigger>
        <IconButton
          label={uiCopy["ui"]["More message options"]}
          icon={<MoreHorizontal />}
          variant="ghost"
          size="sm"
          isDisabled={disabled}
        />
        <DropdownMenu
          aria-label={uiCopy["ui"]["More message options"]}
          onAction={(key) => setKind(key as "form" | "invitation")}
        >
          <DropdownMenuItem id="form">
            {uiCopy["ui"]["Send application form"]}
          </DropdownMenuItem>
          <DropdownMenuItem id="invitation">
            {uiCopy["ui"]["Send invitation"]}
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      {kind && (
        <ShareOffer
          key={kind}
          kind={kind}
          conversationId={conversationId}
          username={username}
          recipientId={recipientId}
          close={() => setKind(null)}
          onSent={onSent}
        />
      )}
    </>
  );
}

function ShareOffer({
  kind,
  conversationId,
  username,
  recipientId,
  close,
  onSent,
}: {
  kind: "form" | "invitation";
  conversationId: string;
  username: string;
  recipientId: string;
  close: () => void;
  onSent: () => void;
}) {
  const uiCopy = useUiCopy();

  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const offers = useCoachingQuery<Page<Schema<"OfferDto">>>("/api/v1/offers", {
    status: "Active",
    pageSize: 100,
  });
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef({ offerId: "", key: "" });
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () => mounted.current && lifecycle.isCurrent();
  const offer =
    offers.data?.items.find((item) => item.id === selected) ??
    (offers.data?.items.length === 1 ? offers.data.items[0] : undefined);
  async function send() {
    if (!offer || sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      if (retry.current.offerId !== offer.id)
        retry.current = { offerId: offer.id, key: crypto.randomUUID() };
      // The server commits the business action and chat entry together; retry never emits a second message.
      await api({
        method: "POST",
        path:
          kind === "invitation"
            ? "/api/v1/coaching/invitations"
            : "/api/v1/coaching/form-shares",
        json:
          kind === "invitation"
            ? {
                username,
                offerId: offer.id,
                billingOptionId: null,
                message: null,
              }
            : { userId: recipientId, offerId: offer.id },
        idempotencyKey: retry.current.key,
        signal: lifecycle.signal(),
      });
      if (!isCurrent()) return;
      void cache.invalidateQueries({
        queryKey: [accountKey, "messaging", "history", conversationId],
      });
      void cache.invalidateQueries({
        queryKey: [accountKey, "messaging", `${root}/conversations`],
      });
      void cache.invalidateQueries({ queryKey: [accountKey, "coaching"] });
      onSent();
      toast({
        tone: "success",
        title: kind === "form" ? "Application form sent" : "Invitation sent",
      });
      close();
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error ? e.message : "Could not send. Please try again.",
        );
    } finally {
      sending.current = false;
      if (isCurrent()) setPending(false);
    }
  }
  return (
    <Dialog
      isOpen
      title={
        kind === "form"
          ? uiCopy["ui"]["Send application form"]
          : uiCopy["ui"]["Send invitation"]
      }
      description={formatInterfaceText(
        uiCopy["ui"][
          "Send to @{0}. They can review the offer before applying."
        ],
        [username],
      )}
      isDismissable={!pending}
      isKeyboardDismissDisabled={pending}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      {offers.isError ? (
        <Alert
          tone="danger"
          live="assertive"
          title={uiCopy["ui"]["Could not load your offers"]}
          actions={
            <Button size="sm" onPress={() => void offers.refetch()}>
              {uiCopy["common"]["retry"]}
            </Button>
          }
        >
          {uiCopy["ui"]["Check your connection and try again."]}
        </Alert>
      ) : offers.data?.items.length === 0 ? (
        <NoActiveOffers purpose={kind} />
      ) : (
        <Select
          label={uiCopy["ui"]["Active offer"]}
          placeholder={
            offers.isPending
              ? uiCopy["ui"]["Loading offers…"]
              : uiCopy["ui"]["Choose an offer"]
          }
          selectedKey={offer?.id ?? null}
          isDisabled={pending || !offers.data?.items.length}
          onSelectionChange={(key) => setSelected(String(key))}
        >
          {(offers.data?.items ?? []).map((item) => (
            <Option key={item.id} id={item.id}>
              {item.name}
            </Option>
          ))}
        </Select>
      )}
      {error && (
        <Alert
          tone="danger"
          live="assertive"
          title={
            kind === "form"
              ? uiCopy["ui"]["The application form was not sent"]
              : uiCopy["ui"]["The invitation was not sent"]
          }
        >
          {error}
        </Alert>
      )}
      <DialogFooter>
        {offers.data?.items.length === 0 ? (
          <Button onPress={close}>{uiCopy["common"]["close"]}</Button>
        ) : (
          <>
            <Button isDisabled={pending} onPress={close}>
              {uiCopy["common"]["cancel"]}
            </Button>
            <Button
              variant="primary"
              loading={pending}
              isDisabled={!offer}
              onPress={() => void send()}
            >
              {kind === "form"
                ? uiCopy["ui"]["Send form"]
                : uiCopy["ui"]["Send invitation"]}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
