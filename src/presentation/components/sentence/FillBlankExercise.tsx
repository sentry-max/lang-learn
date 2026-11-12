import { Fragment, useRef, useState } from "react";
import { splitBlanks } from "@domain/entities/SentenceExercise";
import { AnswerDraft, PracticeItem, placeTile, removeTileAt } from "@domain/services/SentenceSelectionService";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useFlip } from "@presentation/hooks/useFlip";
import TileBank from "@presentation/components/sentence/TileBank";

interface Props {
  item: PracticeItem;
  draft: AnswerDraft;
  disabled: boolean;
  onChange: (draft: AnswerDraft) => void;
}

/**
 * The sentence with its blanks. A tapped word flies into the chosen blank, else the first empty one, else the last
 * one, replacing what was there. Tapping a blank chooses it; tapping the chosen, filled blank again empties it.
 */
export default function FillBlankExercise({ item, draft, disabled, onChange }: Props) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetBlank, setTargetBlank] = useState<number | null>(null);
  useFlip(containerRef, draft.tileIds.join("|"));
  const textById = new Map(item.tiles.map((tile) => [tile.id, tile.text]));
  const parts = item.exercise.content.kind === "fill_blank" ? splitBlanks(item.exercise.content.sentence) : [];
  const hasSeveralBlanks = draft.tileIds.length > 1;

  function tapBlank(index: number) {
    if (targetBlank === index && draft.tileIds[index]) {
      onChange(removeTileAt(item, draft, index));
      setTargetBlank(null);
    } else {
      setTargetBlank(index);
    }
  }

  return (
    <div ref={containerRef}>
      <p className="sentence-text" dir="auto">
        {parts.map((part, index) => {
          const tileId = draft.tileIds[index];
          return (
            <Fragment key={index}>
              {part}
              {index < draft.tileIds.length && (
                <button
                  type="button"
                  className={`blank${tileId ? " filled" : ""}${targetBlank === index ? " selected" : ""}`}
                  aria-label={t("sentenceBlankLabel", { number: index + 1 })}
                  aria-pressed={targetBlank === index}
                  disabled={disabled}
                  onClick={() => tapBlank(index)}
                >
                  {tileId && (
                    <span className="tile" data-flip-id={tileId}>
                      {textById.get(tileId)}
                    </span>
                  )}
                </button>
              )}
            </Fragment>
          );
        })}
      </p>
      {hasSeveralBlanks && <p className="muted small">{t("sentenceFillBlankTip")}</p>}
      <TileBank
        tiles={item.tiles}
        usedTileIds={draft.tileIds}
        disabled={disabled}
        onPick={(tileId) => {
          onChange(placeTile(item, draft, tileId, targetBlank));
          setTargetBlank(null);
        }}
      />
    </div>
  );
}
