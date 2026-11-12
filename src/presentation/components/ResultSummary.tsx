import { CSSProperties, ReactNode } from "react";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useCountUp } from "@presentation/hooks/useCountUp";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

/**
 * The building blocks of a finish screen (quiz and sentence practice): a status header, a score with key figures,
 * titled sections and the actions. Each block fades in a little after the one before it.
 */

type Tone = "success" | "warning" | "neutral";

/** Delays a block's entrance by its position on the screen. */
export const revealStyle = (order: number): CSSProperties => ({ ["--reveal-order" as string]: order });

export function SummaryHeader({ tone, icon, title, subtitle }: { tone: Tone; icon: IconName; title: string; subtitle: string }) {
  return (
    <header className="summary-header reveal" style={revealStyle(0)}>
      <span className={`summary-status ${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </div>
    </header>
  );
}

/** The score next to a grid of key figures. */
export function SummaryOverview({ score, children }: { score: ReactNode; children: ReactNode }) {
  return (
    <div className="summary-overview reveal" style={revealStyle(1)}>
      {score}
      <dl className="kpi-grid">{children}</dl>
    </div>
  );
}

/** A key figure. A number counts up when it appears; text (a duration) is shown as it is. */
export function Kpi({ label, value, suffix = "" }: { label: string; value: number | string; suffix?: string }) {
  const { language } = useLanguage();
  const counted = useCountUp(typeof value === "number" ? value : 0);
  return (
    <div className="kpi">
      <dt>{label}</dt>
      <dd>{typeof value === "number" ? `${formatNumber(Math.round(counted), language)}${suffix}` : value}</dd>
    </div>
  );
}

export function SummarySection({ title, order, children }: { title: string; order: number; children: ReactNode }) {
  return (
    <section className="summary-section reveal" style={revealStyle(order)}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export interface DistributionPart {
  key: string;
  label: string;
  count: number;
  /** A class that sets the part's colour, e.g. "rating-very_easy" or "correct" */
  colorClass: string;
}

/** One bar split by count, with a legend underneath: how the answers spread over the ratings or right and wrong. */
export function DistributionBar({ parts, label }: { parts: DistributionPart[]; label: string }) {
  const { language } = useLanguage();
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  return (
    <div className="distribution">
      <div className="distribution-bar" role="img" aria-label={label}>
        {total > 0 &&
          parts
            .filter((part) => part.count > 0)
            .map((part) => <span key={part.key} className={`distribution-part ${part.colorClass}`} style={{ flexGrow: part.count }} />)}
      </div>
      <ul className="distribution-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <span className={`legend-swatch ${part.colorClass}`} aria-hidden="true" />
            <span>{part.label}</span>
            <strong>{formatNumber(part.count, language)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryActions({ order, children }: { order: number; children: ReactNode }) {
  return (
    <div className="summary-actions reveal" style={revealStyle(order)}>
      {children}
    </div>
  );
}
