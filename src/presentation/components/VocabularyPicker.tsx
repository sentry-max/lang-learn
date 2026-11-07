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
    const currentQuery = query.trim().toLocaleLowerCase();
    if (!currentQuery) return vocabularies;
    return vocabularies.filter(
      (vocabulary) => vocabulary.name.toLocaleLowerCase().includes(currentQuery) || (vocabulary.ownerName ?? "").toLocaleLowerCase().includes(currentQuery)
    );
  }, [vocabularies, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((vocabulary) => selectedSet.has(vocabulary.id));

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setActive(0);
    const close = (event: MouseEvent) => !rootRef.current?.contains(event.target as Node) && setOpen(false);
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
      ? vocabularies.find((vocabulary) => vocabulary.id === selected[0])?.name ?? ""
      : t("vocabulariesSelected", { count: selected.length });

  function chooseOnly(id: string) {
    onChange([id]);
    setOpen(false);
    inputRef.current?.blur();
  }

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id]);
  }

  function toggleAllFiltered() {
    const ids = filtered.map((vocabulary) => vocabulary.id);
    onChange(
      allFilteredSelected ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids]))
    );
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (filtered.length) setActive((index) => (index + (event.key === "ArrowDown" ? 1 : filtered.length - 1)) % filtered.length);
    } else if (event.key === "Enter" && open && filtered[active]) {
      event.preventDefault();
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
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        {selected.length > 1 && !open && <span className="pill">{selected.length}</span>}
        <button
          type="button"
          className="combobox-arrow"
          tabIndex={-1}
          aria-label={t("quizVocabulariesLabel")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
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
          {filtered.map((vocabulary, index) => (
            <div
              key={vocabulary.id}
              role="option"
              aria-selected={selectedSet.has(vocabulary.id)}
              className={`dropdown-item${index === active ? " active" : ""}${selectedSet.has(vocabulary.id) ? " checked" : ""}`}
              onMouseEnter={() => setActive(index)}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(vocabulary.id)}
                onChange={() => toggle(vocabulary.id)}
                aria-label={t("addToSelection", { name: vocabulary.name })}
              />
              <button type="button" className="dropdown-item-main" onClick={() => chooseOnly(vocabulary.id)}>
                <span dir="auto" className="dropdown-item-title">
                  {vocabulary.name}
                </span>
                <span className="muted small">
                  {languageLabel(vocabulary.sourceLanguage)} · {t("wordCountLabel", { count: formatNumber(vocabulary.wordCount, language) })} ·{" "}
                  {vocabulary.ownerId === currentUserId ? t("yours") : t("downloaded")}
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
