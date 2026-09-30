import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import Icon, { IconName } from "@presentation/components/ui/Icon";

export interface MenuOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  icon?: IconName;
  className?: string;
}

/**
 * A themed single-choice menu (replaces native <select> where the browser's
 * own popup would ignore the app's dark mode). The whole button — icon,
 * label and arrow — opens it.
 */
export default function MenuSelect<T extends string>({ value, options, onChange, ariaLabel, icon, className }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(option: MenuOption<T>) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(options[active]);
    }
  }

  return (
    <div className={`menu-select${className ? ` ${className}` : ""}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="menu-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} size={16} />}
        <span>{current?.label}</span>
        <Icon name="chevronDown" size={14} className={open ? "rotated" : undefined} />
      </button>
      {open && (
        <ul className="menu-select-list" role="listbox" id={listId} aria-label={ariaLabel}>
          {options.map((option, i) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`menu-select-option${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
