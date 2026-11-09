import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { LanguageCode, languageLabel } from "@domain/entities/Language";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { SentenceCollection } from "@domain/entities/SentenceCollection";
import { UiStringKey } from "@presentation/i18n/translations";
import { useLanguage } from "@presentation/context/LanguageContext";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

type Props = {
  /** Selected ids; empty means nothing selected */
  selected: string[];
  onChange: (ids: string[]) => void;
  currentUserId: string;
  placeholder?: string;
} & ({ kind: "vocabulary"; items: Vocabulary[] } | { kind: "sentenceCollection"; items: SentenceCollection[] });

interface PickerEntry {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  language: LanguageCode;
  /** Words or exercises in it */
  size: number;
}

const LABELS: Record<Props["kind"], Record<"field" | "choose" | "search" | "none" | "all" | "several" | "size", UiStringKey>> = {
  vocabulary: {
    field: "quizVocabulariesLabel",
    choose: "chooseVocabularies",
    search: "searchVocabularies",
    none: "noVocabulariesMatch",
    all: "allVocabularies",
    several: "vocabulariesSelected",
    size: "wordCountLabel",
  },
  sentenceCollection: {
    field: "sentenceCollectionsLabel",
    choose: "chooseSentenceCollections",
    search: "searchSentenceCollections",
    none: "noSentenceCollectionsMatch",
    all: "allSentenceCollections",
    several: "sentenceCollectionsSelected",
    size: "exerciseCountLabel",
  },
};

/**
 * Searchable combobox of vocabularies or sentence collections.
 *  - Type to filter.
 *  - Tap an item's name/subtitle: choose only that one and close.
 *  - Tap a checkbox (or "Select all"): choose several; the list stays open.
 */
export default function CollectionPicker(props: Props) {
  const { selected, onChange, currentUserId, placeholder } = props;
  const labels = LABELS[props.kind];
  const entries = useMemo<PickerEntry[]>(
    () =>
      props.kind === "vocabulary"
        ? props.items.map((vocabulary) => ({ ...vocabulary, language: vocabulary.sourceLanguage, size: vocabulary.wordCount }))
        : props.items.map((collection) => ({ ...collection, size: collection.exerciseCount })),
    [props.kind, props.items]
  );
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
    if (!currentQuery) return entries;
    return entries.filter(
      (entry) => entry.name.toLocaleLowerCase().includes(currentQuery) || (entry.ownerName ?? "").toLocaleLowerCase().includes(currentQuery)
    );
  }, [entries, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((entry) => selectedSet.has(entry.id));

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
      : selected.length === entries.length
      ? t(labels.all, { count: entries.length })
      : selected.length === 1
      ? entries.find((entry) => entry.id === selected[0])?.name ?? ""
      : t(labels.several, { count: selected.length });

  function chooseOnly(id: string) {
    onChange([id]);
    setOpen(false);
    inputRef.current?.blur();
  }

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id]);
  }

  function toggleAllFiltered() {
    const ids = filtered.map((entry) => entry.id);
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
          aria-label={t(labels.field)}
          dir="auto"
          value={open ? query : summary}
          placeholder={open ? t(labels.search) : placeholder ?? t(labels.choose)}
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
          aria-label={t(labels.field)}
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
          {filtered.map((entry, index) => (
            <div
              key={entry.id}
              role="option"
              aria-selected={selectedSet.has(entry.id)}
              className={`dropdown-item${index === active ? " active" : ""}${selectedSet.has(entry.id) ? " checked" : ""}`}
              onMouseEnter={() => setActive(index)}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(entry.id)}
                onChange={() => toggle(entry.id)}
                aria-label={t("addToSelection", { name: entry.name })}
              />
              <button type="button" className="dropdown-item-main" onClick={() => chooseOnly(entry.id)}>
                <span dir="auto" className="dropdown-item-title">
                  {entry.name}
                </span>
                <span className="muted small">
                  {languageLabel(entry.language)} · {t(labels.size, { count: formatNumber(entry.size, language) })} ·{" "}
                  {entry.ownerId === currentUserId ? t("yours") : t("downloaded")}
                </span>
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="dropdown-empty muted">{t(labels.none)}</p>}
        </div>
      )}
    </div>
  );
}
