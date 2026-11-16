import { useState } from "react";
import { Bot, Plug, TriangleAlert } from "lucide-react";
import { DialogTrigger } from "react-aria-components";
import { useNavigate } from "react-router";
import {
  Button,
  Dialog,
  IconButton,
  InfoTip,
  Popover,
  Skeleton,
  useMobileLayout,
} from "@portable-ui/react";
import { useFeatureAccess } from "~/shared/access";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { connectionStatus, useIntegrationQuery, type Connection } from "./api";
import { useIntegrationCopy } from "./copy";
import { formatAgo } from "./format";
import styles from "./integrations.module.css";

export function IntegrationMenu() {
  const access = useFeatureAccess("integrations.mcp.connect");
  return access.allowed ? <ConnectionMenu /> : null;
}

type MenuStatus = "error" | "loading" | "active" | "attention" | "empty";

/** App bar plug: a dot shows the consent state, the popover (a sheet on phones) lists the connections. */
function ConnectionMenu() {
  const copy = useIntegrationCopy();
  const { locale } = useAppLocale();
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const query = useIntegrationQuery<Connection[]>("/api/v1/me/ai-integrations");
  const connections = (query.data ?? []).filter((item) => !item.revokedAt);
  const active = connections.filter(
    (item) => connectionStatus(item) === "active",
  );
  const status: MenuStatus = query.isError
    ? "error"
    : query.isPending
      ? "loading"
      : active.length
        ? "active"
        : connections.length
          ? "attention"
          : "empty";
  const label =
    status === "active"
      ? copy.connectedTip
      : status === "attention"
        ? copy.attentionTip
        : status === "error"
          ? copy.error
          : status === "loading"
            ? copy.loading
            : copy.connect;
  const go = () => {
    setOpen(false);
    navigate(
      `/app/settings?section=integrations${status === "empty" ? "#available-integrations" : ""}`,
    );
  };

  const body = (
    <>
      <div className={styles.quickBody}>
        {status === "error" ? (
          <div className={styles.quickState} data-tone="danger">
            <span className={styles.quickStateIcon} aria-hidden="true">
              <TriangleAlert />
            </span>
            <p role="status">{copy.error}</p>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void query.refetch()}
            >
              {copy.retry}
            </Button>
          </div>
        ) : status === "loading" ? (
          <div className={styles.quickLoading}>
            <span role="status" className={styles.srOnly}>
              {copy.loading}
            </span>
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
          </div>
        ) : status === "empty" ? (
          <div className={styles.quickState}>
            <span className={styles.quickStateIcon} aria-hidden="true">
              <Plug />
            </span>
            <p role="status">
              <strong>{copy.notConnected}</strong>
            </p>
            <small>{copy.emptyHint}</small>
          </div>
        ) : (
          <>
            <span role="status" className={styles.srOnly}>
              {status === "attention"
                ? copy.attention
                : `${copy.activeCount}: ${active.length}`}
            </span>
            <ul className={styles.quickList}>
              {connections.slice(0, 5).map((item) => {
                const state = connectionStatus(item);
                return (
                  <li key={item.id} className={styles.quickRow}>
                    <span className={styles.quickRowIcon} aria-hidden="true">
                      <Bot />
                    </span>
                    <span className={styles.quickRowText}>
                      <span>{item.clientName}</span>
                      <small>
                        {item.lastUsedAt
                          ? `${copy.lastUsed} ${formatAgo(item.lastUsedAt, locale)}`
                          : copy.neverUsed}
                      </small>
                    </span>
                    <span className={styles.quickRowState} data-state={state}>
                      {copy[state]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <footer className={styles.quickFoot}>
        <Button
          size="sm"
          variant={status === "empty" ? "primary" : "secondary"}
          className={styles.quickAction}
          onPress={go}
        >
          {status === "empty" ? copy.connect : copy.manage}
        </Button>
      </footer>
    </>
  );

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <IconButton
        label={label}
        variant="secondary"
        size="sm"
        showTooltip={false}
        icon={
          <span className={styles.statusIcon}>
            <Plug strokeWidth={1.75} />
            {status === "active" || status === "attention" ? (
              <span className={styles.statusDot} data-state={status} />
            ) : null}
          </span>
        }
      />
      {mobile ? (
        <Dialog title={copy.title} isOpen={open} onOpenChange={setOpen}>
          <div className={styles.quickSheet}>{body}</div>
        </Dialog>
      ) : (
        <Popover
          placement="bottom end"
          aria-label={copy.title}
          className={styles.quickPanel}
        >
          <header className={styles.quickHead}>
            <strong>{copy.title}</strong>
            <InfoTip label={copy.statusInfo} placement="bottom end">
              {copy.consentStatus}
            </InfoTip>
          </header>
          {body}
        </Popover>
      )}
    </DialogTrigger>
  );
}
