import { Tile } from "@domain/services/SentenceSelectionService";

interface Props {
  tiles: Tile[];
  usedTileIds: (string | null)[];
  disabled: boolean;
  onPick: (tileId: string) => void;
}

/** The words to pick from. A used word leaves an empty slot behind, so the others never jump. */
export default function TileBank({ tiles, usedTileIds, disabled, onPick }: Props) {
  return (
    <div className="tile-bank">
      {tiles.map((tile) =>
        usedTileIds.includes(tile.id) ? (
          <span key={tile.id} className="tile tile-slot" aria-hidden="true" dir="auto">
            {tile.text}
          </span>
        ) : (
          <button key={tile.id} type="button" className="tile" data-flip-id={tile.id} dir="auto" disabled={disabled} onClick={() => onPick(tile.id)}>
            {tile.text}
          </button>
        )
      )}
    </div>
  );
}
