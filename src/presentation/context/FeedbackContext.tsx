import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Modal from "@presentation/components/Modal";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import { useLanguage } from "@presentation/context/LanguageContext";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive */
  danger?: boolean;
}

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  leaving: boolean;
}

interface FeedbackState {
  /** Resolves true when confirmed, false when cancelled or dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
}

const FeedbackContext = createContext<FeedbackState | null>(null);

const TOAST_ICONS: Record<ToastKind, IconName> = { success: "check", error: "close", info: "hint" };
const TOAST_MS = 3200;

/** App-wide confirmation dialogs and toast notifications. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const decided = useRef(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        decided.current = false;
        setDialog({ ...options, resolve });
      }),
    []
  );

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, kind, message, leaving: false }]);
    window.setTimeout(() => setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))), TOAST_MS);
    window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), TOAST_MS + 300);
  }, []);

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {dialog && (
        <Modal
          compact
          title={dialog.title}
          onClose={() => {
            dialog.resolve(decided.current);
            setDialog(null);
          }}
          footer={(close) => (
            <>
              <button type="button" className="btn btn-secondary" onClick={close}>
                {dialog.cancelLabel ?? t("cancelButton")}
              </button>
              <button
                type="button"
                data-autofocus
                className={`btn${dialog.danger ? " btn-danger" : ""}`}
                onClick={() => {
                  decided.current = true;
                  close();
                }}
              >
                {dialog.confirmLabel ?? t("confirm")}
              </button>
            </>
          )}
        >
          {dialog.message && <p className="confirm-message">{dialog.message}</p>}
        </Modal>
      )}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}${toast.leaving ? " leaving" : ""}`}>
            <Icon name={TOAST_ICONS[toast.kind]} size={18} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useConfirm must be used within a FeedbackProvider");
  return context.confirm;
}

export function useToast() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useToast must be used within a FeedbackProvider");
  return context.toast;
}
