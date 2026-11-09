import "@presentation/components/ui/logo/LogoSweepLoader";
import "@presentation/components/ui/logo/LogoProgressIndicator";
import { useLanguage } from "@presentation/context/LanguageContext";

/**
 * Full-area loading state: a skeleton of a page (title, figures, two cards) so the layout doesn't jump when the data
 * arrives, plus a caption. It fades in after a short delay, so a fast load shows nothing at all.
 */
export function PageLoader({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="page-loader app-main" role="status" aria-live="polite">
      <div className="page-loader-caption">
        <Spinner size={16} />
        <span>{label ?? t("loading")}</span>
      </div>
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-box" />
        <div className="skeleton skeleton-box" />
        <div className="skeleton skeleton-box" />
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card short" />
    </div>
  );
}

/** The logo sweep: for loading of unknown length, inline and in buttons. Hidden from screen readers without a label. */
export function Spinner({ size = 18, label, isPaused = false }: { size?: number; label?: string; isPaused?: boolean }) {
  return (
    <logo-sweep-loader
      className="spinner"
      size={String(size)}
      paused={isPaused ? "" : undefined}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    />
  );
}

/** The logo filling up with a known share of work done (0..1). Without a label it is decoration next to a visible count. */
export function ProgressIndicator({ value, size = 28, label }: { value: number; size?: number; label?: string }) {
  return (
    <logo-progress-indicator
      className="progress-indicator"
      size={String(size)}
      value={String(Math.round(value * 1000) / 10)}
      track=""
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    />
  );
}

/** A spinner with a short caption, for loading a section inside a page. */
export function InlineLoader({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="inline-loader" role="status" aria-live="polite">
      <Spinner size={20} />
      <span>{label ?? t("loading")}</span>
    </div>
  );
}

type LogoElementProps = { className?: string; size?: string; role?: string; "aria-label"?: string; "aria-hidden"?: "true" };

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "logo-sweep-loader": LogoElementProps & { paused?: string };
      "logo-progress-indicator": LogoElementProps & { value: string; track?: string };
      "logo-splash-loader": LogoElementProps;
    }
  }
}
