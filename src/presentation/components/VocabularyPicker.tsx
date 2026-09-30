import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { languageLabel } from "@domain/entities/Language";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { useLanguage } from "@presentation/context/LanguageContext";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

interface Props {
  vocabularies: Vocabulary[];
  /** Selected vocabulary ids; empty means nothing selected */
  selected: string[];
  onChange: (ids: string[]) => void;
  currentUserId: string;
  placeholder?: string;
}

/**
 * Searchable vocabulary combobox.
 *  - Type to filter.
 *  - Tap a vocabulary's name/subtitle: choose only that one and close.
 *  - Tap a checkbox (or "Select all"): choose several; the list stays open.
 */
export default function VocabularyPicker({ vocabularies, selected, onChange, currentUserId, placeholder }: Props) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return vocabularies;
    return vocabularies.filter(
      (v) => v.name.toLocaleLowerCase().includes(q) || (v.ownerName ?? "").toLocaleLowerCase().includes(q)
    );
  }, [vocabularies, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((v) => selectedSet.has(v.id));

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setActive(0);
    const close = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const summary =
    selected.length === 0
      ? ""
      : selected.length === vocabularies.length
      ? t("allVocabularies", { count: vocabularies.length })
      : selected.length === 1
      ? vocabularies.find((v) => v.id === selected[0])?.name ?? ""
      : t("vocabulariesSelected", { count: selected.length });

  function chooseOnly(id: string) {
    onChange([id]);
    setOpen(false);
    inputRef.current?.blur();
  }

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function toggleAllFiltered() {
    const ids = filtered.map((v) => v.id);
    onChange(
      allFilteredSelected ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids]))
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (filtered.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : filtered.length - 1)) % filtered.length);
    } else if (e.key === "Enter" && open && filtered[active]) {
      e.preventDefault();
      chooseOnly(filtered[active].id);
    }
  }

  return (
    <div className={`combobox${open ? " open" : ""}`} ref={rootRef}>
      <div className="combobox-field" onClick={() => inputRef.current?.focus()}>
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={t("quizVocabulariesLabel")}
          dir="auto"
          value={open ? query : summary}
          placeholder={open ? t("searchVocabularies") : placeholder ?? t("chooseVocabularies")}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        {selected.length > 1 && !open && <span className="pill">{selected.length}</span>}
        <button
          type="button"
          className="combobox-arrow"
          tabIndex={-1}
          aria-label={t("quizVocabulariesLabel")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (open) {
              setOpen(false);
              inputRef.current?.blur();
            } else {
              inputRef.current?.focus();
            }
          }}
        >
          <Icon name="chevronDown" size={16} className={open ? "rotated" : undefined} />
        </button>
      </div>

      {open && (
        <div className="dropdown-menu" id={listId} role="listbox" aria-multiselectable="true">
          {filtered.length > 0 && (
            <label className="dropdown-item select-all">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
              <span>{query ? t("selectAllMatches", { count: filtered.length }) : t("selectAll")}</span>
            </label>
          )}
          {filtered.map((v, i) => (
            <div
              key={v.id}
              role="option"
              aria-selected={selectedSet.has(v.id)}
              className={`dropdown-item${i === active ? " active" : ""}${selectedSet.has(v.id) ? " checked" : ""}`}
              onMouseEnter={() => setActive(i)}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(v.id)}
                onChange={() => toggle(v.id)}
                aria-label={t("addToSelection", { name: v.name })}
              />
              <button type="button" className="dropdown-item-main" onClick={() => chooseOnly(v.id)}>
                <span dir="auto" className="dropdown-item-title">
                  {v.name}
                </span>
                <span className="muted small">
                  {languageLabel(v.sourceLanguage)} · {t("wordCountLabel", { count: formatNumber(v.wordCount, language) })} ·{" "}
                  {v.ownerId === currentUserId ? t("yours") : t("downloaded")}
                </span>
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="dropdown-empty muted">{t("noVocabulariesMatch")}</p>}
        </div>
      )}
    </div>
  );
}
