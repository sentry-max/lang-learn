import { useEffect, useRef, useState } from "react";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import Icon from "@presentation/components/ui/Icon";
import { formatDateTime } from "@presentation/format";

/**
 * Connection and sync status as a small, fixed-size icon in the top bar, so
 * it never moves the page. Details (and "sync now") open in a popover.
 */
export default function SyncIndicator() {
  const { t, language } = useLanguage();
  const { sync } = useServices();
  const { online, pending, syncing, lastSyncedAt } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const state = !online ? "offline" : syncing || pending > 0 ? "syncing" : "synced";
  const label = !online ? t("statusOffline") : state === "syncing" ? t("syncingNow", { count: pending }) : t("statusSynced");

  return (
    <div className="sync-indicator" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn sync-btn ${state}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={state === "offline" ? "cloudOff" : "cloud"} size={20} />
        {pending > 0 && <span className="sync-badge">{pending > 99 ? "99+" : pending}</span>}
        {state === "syncing" && <span className="sync-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={label}>
          <p className="popover-title">
            <Icon name={state === "offline" ? "cloudOff" : "cloud"} size={16} /> {label}
          </p>
          <p className="muted small">
            {!online ? t("offlineWarning") : pending > 0 ? t("pendingSync", { count: pending }) : t("allSyncedBody")}
          </p>
          {lastSyncedAt && <p className="muted small">{t("lastSynced", { time: formatDateTime(lastSyncedAt, language) })}</p>}
          {online && pending > 0 && (
            <button type="button" className="btn btn-small btn-secondary" disabled={syncing} onClick={() => sync.syncNow()}>
              <Icon name="refresh" size={14} className={syncing ? "spin" : undefined} /> {t("syncNow")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
