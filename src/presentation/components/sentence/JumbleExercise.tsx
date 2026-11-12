import { KeyboardEvent, PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { splitJumble } from "@domain/entities/SentenceExercise";
import { AnswerDraft, PracticeItem, moveTile, placeTile, removeTileAt } from "@domain/services/SentenceSelectionService";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useFlip } from "@presentation/hooks/useFlip";
import TileBank from "@presentation/components/sentence/TileBank";

interface Props {
  item: PracticeItem;
  draft: AnswerDraft;
  disabled: boolean;
  onChange: (draft: AnswerDraft) => void;
}

/** A pointer press on a placed word; it becomes a drag once the pointer has moved a little. */
interface Press {
  position: number;
  pointerId: number;
  startX: number;
  startY: number;
  isDragging: boolean;
}

/** Below this many pixels of movement a press is a tap. */
const DRAG_THRESHOLD_PX = 6;

/**
 * Tapped words fly onto the answer line in tap order. A placed word is dragged to another position (touch or mouse)
 * or moved with the arrow keys, and a tap (or Delete) sends it back to the bank.
 */
export default function JumbleExercise({ item, draft, disabled, onChange }: Props) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<Press | null>(null);
  const focusTileIdRef = useRef<string | null>(null);
  const [drag, setDrag] = useState<{ position: number; deltaX: number; deltaY: number; dropIndex: number } | null>(null);
  useFlip(containerRef, draft.tileIds.join("|"));
  const textById = new Map(item.tiles.map((tile) => [tile.id, tile.text]));
  const ending = item.exercise.content.kind === "jumble" ? splitJumble(item.exercise.content.sentence).ending : "";

  // Moving a word re-orders the buttons; keep the keyboard focus on the word that moved.
  useLayoutEffect(() => {
    const tileId = focusTileIdRef.current;
    if (!tileId) return;
    focusTileIdRef.current = null;
    lineRef.current?.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(tileId)}"]`)?.focus();
  }, [draft.tileIds]);

  /** Where the dragged word would land: next to the placed word nearest the pointer, on the side the pointer is. */
  function dropIndexAt(clientX: number, clientY: number, dragged: number): number {
    const line = lineRef.current;
    if (!line) return dragged;
    const isRtl = getComputedStyle(line).direction === "rtl";
    const others = Array.from(line.querySelectorAll<HTMLElement>("[data-position]")).filter((element) => Number(element.dataset.position) !== dragged);
    let dropIndex = dragged;
    let nearest = Infinity;
    for (const [index, element] of others.entries()) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const distance = Math.hypot(clientX - centerX, clientY - (rect.top + rect.height / 2));
      if (distance >= nearest) continue;
      nearest = distance;
      dropIndex = (isRtl ? clientX < centerX : clientX > centerX) ? index + 1 : index;
    }
    return dropIndex;
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, position: number) {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressRef.current = { position, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, isDragging: false };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - press.startX;
    const deltaY = event.clientY - press.startY;
    if (!press.isDragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
    press.isDragging = true;
    setDrag({ position: press.position, deltaX, deltaY, dropIndex: dropIndexAt(event.clientX, event.clientY, press.position) });
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    pressRef.current = null;
    if (press.isDragging) {
      onChange(moveTile(draft, press.position, dropIndexAt(event.clientX, event.clientY, press.position)));
    } else {
      onChange(removeTileAt(item, draft, press.position));
    }
    setDrag(null);
  }

  function pointerCancel() {
    pressRef.current = null;
    setDrag(null);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, position: number) {
    const isRtl = lineRef.current ? getComputedStyle(lineRef.current).direction === "rtl" : false;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const target = position + (isRtl ? -step : step);
      if (target < 0 || target >= draft.tileIds.length) return;
      focusTileIdRef.current = draft.tileIds[position];
      onChange(moveTile(draft, position, target));
    } else if (event.key === "Delete" || event.key === "Backspace" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(removeTileAt(item, draft, position));
    }
  }

  /** Shows where the dragged word will land: a bar before the word at the drop index, or after the last word. */
  function dropMarker(position: number, current: { position: number; dropIndex: number }): string {
    const indexAmongOthers = position - (position > current.position ? 1 : 0);
    if (indexAmongOthers === current.dropIndex) return " drop-before";
    const isLastOther = indexAmongOthers === draft.tileIds.length - 2;
    return isLastOther && current.dropIndex === draft.tileIds.length - 1 ? " drop-after" : "";
  }

  return (
    <div ref={containerRef}>
      <div className={`answer-line${drag ? " dragging" : ""}`} dir="auto" ref={lineRef}>
        {draft.tileIds.map((tileId, position) => {
          const isDragged = drag?.position === position;
          const dropSide = drag && !isDragged ? dropMarker(position, drag) : "";
          return (
            <button
              key={tileId ?? position}
              type="button"
              className={`tile placed${isDragged ? " lifted" : ""}${dropSide}`}
              data-flip-id={isDragged ? undefined : (tileId ?? undefined)}
              data-position={position}
              style={isDragged ? { transform: `translate(${drag.deltaX}px, ${drag.deltaY}px)` } : undefined}
              disabled={disabled}
              onPointerDown={(event) => pointerDown(event, position)}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerCancel}
              onKeyDown={(event) => keyDown(event, position)}
            >
              {tileId && textById.get(tileId)}
            </button>
          );
        })}
        {ending && <span className="answer-ending">{ending}</span>}
      </div>
      {draft.tileIds.length > 1 && <p className="muted small">{t("sentenceJumbleTip")}</p>}
      <TileBank tiles={item.tiles} usedTileIds={draft.tileIds} disabled={disabled} onPick={(tileId) => onChange(placeTile(item, draft, tileId))} />
    </div>
  );
}
