import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@presentation/context/LanguageContext";
import { prefersReducedMotion } from "@presentation/appearance";
import Icon from "@presentation/components/ui/Icon";

const EXIT_MS = 180;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Renders a smaller, centered alert-style dialog */
  compact?: boolean;
  /** Receives a close function that plays the exit animation first */
  footer?: (close: () => void) => ReactNode;
}

/** Dialog with enter/exit animations, Escape/backdrop to close, focus handling and scroll lock. */
export default function Modal({ title, onClose, children, wide, compact, footer }: Props) {
  const { t } = useLanguage();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : EXIT_MS);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const focusable =
      box?.querySelector<HTMLElement>("[data-autofocus]") ??
      box?.querySelector<HTMLElement>("input, select, textarea, button:not(.modal-close)");
    (focusable ?? box)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [close]);

  return (
    <div
      className={`modal-backdrop${closing ? " closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className={`modal-box${wide ? " wide" : ""}${compact ? " compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="modal-close" onClick={close} aria-label={t("close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer(close)}</div>}
      </div>
    </div>
  );
}
