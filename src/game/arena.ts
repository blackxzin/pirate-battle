import type { Rect } from './math';

export const TILE_SIZE = 64;

export type IslandStyle = 'sand' | 'grass';

export interface Decoration {
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly rotation?: number;
}

export interface Island {
  readonly id: string;
  readonly style: IslandStyle;
  /** Top-left tile coordinate. */
  readonly tileX: number;
  readonly tileY: number;
  readonly cols: number;
  readonly rows: number;
  /** Blocking area in pixels (inset from the drawn shoreline). */
  readonly collider: Rect;
}

export interface ArenaDefinition {
  readonly width: number;
  readonly height: number;
  readonly islands: readonly Island[];
  readonly decorations: readonly Decoration[];
  readonly playerSpawn: { readonly x: number; readonly y: number; readonly angle: number };
}

/** Shoreline inset so ships touch the sand instead of an invisible box. */
const COLLIDER_INSET = 14;

function island(id: string, style: IslandStyle, tileX: number, tileY: number, cols: number, rows: number): Island {
  return {
    id,
    style,
    tileX,
    tileY,
    cols,
    rows,
    collider: {
      x: tileX * TILE_SIZE + COLLIDER_INSET,
      y: tileY * TILE_SIZE + COLLIDER_INSET,
      width: cols * TILE_SIZE - COLLIDER_INSET * 2,
      height: rows * TILE_SIZE - COLLIDER_INSET * 2,
    },
  };
}

const COLS = 24;
const ROWS = 14;

export const DEFAULT_ARENA: ArenaDefinition = {
  width: COLS * TILE_SIZE,
  height: ROWS * TILE_SIZE,
  islands: [
    island('north-west', 'grass', 3, 2, 4, 4),
    island('north-east', 'sand', 16, 2, 3, 3),
    island('centre-south', 'grass', 13, 8, 4, 4),
    island('south-west', 'sand', 3, 10, 4, 3),
    island('east', 'sand', 20, 9, 3, 3),
  ],
  decorations: [
    { frame: 'tile_71', x: 4.4 * TILE_SIZE, y: 3.3 * TILE_SIZE },
    { frame: 'tile_72', x: 5.5 * TILE_SIZE, y: 4.6 * TILE_SIZE },
    { frame: 'tile_66', x: 17.5 * TILE_SIZE, y: 3.5 * TILE_SIZE, scale: 0.9 },
    { frame: 'tile_70', x: 14.6 * TILE_SIZE, y: 9.4 * TILE_SIZE },
    { frame: 'tile_67', x: 15.6 * TILE_SIZE, y: 10.6 * TILE_SIZE, scale: 0.8 },
    { frame: 'tile_50', x: 4.6 * TILE_SIZE, y: 11.5 * TILE_SIZE, scale: 0.8 },
    { frame: 'tile_88', x: 5.8 * TILE_SIZE, y: 11.3 * TILE_SIZE },
    { frame: 'tile_72', x: 21.5 * TILE_SIZE, y: 10.4 * TILE_SIZE, scale: 0.9 },
  ],
  playerSpawn: { x: 11 * TILE_SIZE, y: 6.5 * TILE_SIZE, angle: -Math.PI / 2 },
};

/**
 * Returns the tile frame for a cell of an island. Sand islands use the 3x3
 * rounded sand set (edges repeat for larger islands); grass islands use the 4x4
 * sand-and-grass set, cycling the two inner columns/rows.
 */
export function islandTileFrame(style: IslandStyle, col: number, row: number, cols: number, rows: number): string {
  if (style === 'sand') {
    const columnIndex = col === 0 ? 0 : col === cols - 1 ? 2 : 1;
    const rowBase = row === 0 ? 1 : row === rows - 1 ? 33 : 17;
    return `tile_${rowBase + columnIndex}`;
  }
  const columnIndex = col === 0 ? 0 : col === cols - 1 ? 3 : 1 + ((col - 1) % 2);
  const rowIndex = row === 0 ? 0 : row === rows - 1 ? 3 : 1 + ((row - 1) % 2);
  return `tile_${6 + rowIndex * 16 + columnIndex}`;
}
