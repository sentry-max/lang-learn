import { ReactNode, useId } from "react";

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`switch-row${disabled ? " disabled" : ""}`}>
      <div className="switch-text">
        <label htmlFor={id}>{label}</label>
        {description && <p className="muted small">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} style={{ ["--segments" as string]: options.length }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segment${value === option.value ? " selected" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Tabs with an animated underline; content is rendered by the caller. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={ariaLabel}
      style={{ ["--tab-count" as string]: tabs.length, ["--tab-index" as string]: index }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`tab${value === tab.value ? " active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
      <span className="tab-indicator" aria-hidden="true" />
    </div>
  );
}
