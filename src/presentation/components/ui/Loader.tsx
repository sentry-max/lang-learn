import { useId } from "react";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useLiquidGlass } from "@presentation/hooks/useLiquidGlass";

/**
 * The app logo (violet square, ring, dot) as a friendly character: the ring
 * is its face, watching the dot bounce like a ball. Same shapes and colours
 * as the logo, only animated.
 */
export function LogoMascot({ size = 76 }: { size?: number }) {
  const gradientId = useId();
  // Liquid Glass: the same character in the glass app icon's blue, with a sheen.
  const liquid = useLiquidGlass();
  const [from, to] = liquid ? ["#1a8cff", "#5e5ce6"] : ["#5a44e5", "#7b3aeb"];
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${gradientId}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${gradientId})`} />
      {liquid && <rect width="100" height="100" rx="24" fill={`url(#${gradientId}s)`} />}
      <ellipse className="mascot-shadow" cx="25.4" cy="86" rx="7.5" ry="1.8" fill="rgba(20, 8, 60, 0.28)" />
      <g className="mascot-face">
        <circle cx="53.3" cy="44.3" r="21.7" fill="none" stroke="#fff" strokeWidth="8.5" />
        <g className="mascot-eyes">
          <ellipse className="mascot-eye" cx="47" cy="41.5" rx="2.5" ry="3.3" fill="#fff" />
          <ellipse className="mascot-eye" cx="59.6" cy="41.5" rx="2.5" ry="3.3" fill="#fff" />
        </g>
        <path d="M47.3 49.8 Q53.3 55.2 59.3 49.8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <circle className="mascot-ball" cx="25.4" cy="72.4" r="8.6" fill="#fff" />
    </svg>
  );
}

/** Full-area loading state: the mascot plus a caption for screen readers and sighted users. */
export function PageLoader({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <LogoMascot />
      <span className="loader-caption">{label ?? t("loading")}</span>
    </div>
  );
}

/** Small ring-and-dot spinner (the logo's shapes) for inline and in-button loading. */
export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" role={label ? "status" : undefined} aria-label={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <g className="spinner-orbit">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="14 60" />
          <circle cx="12" cy="1.5" r="1.9" fill="currentColor" />
        </g>
      </svg>
    </span>
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
