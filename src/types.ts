export type Cell = { x: number; y: number };

// 4-cardinal directions, indexed clockwise from north.
export type Dir = 0 | 1 | 2 | 3;
export const DIR_N: Dir = 0;
export const DIR_E: Dir = 1;
export const DIR_S: Dir = 2;
export const DIR_W: Dir = 3;

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [+1, 0], // E
  [0, +1], // S
  [-1, 0], // W
];

export function neighborOf(cell: Cell, dir: Dir): Cell {
  const [dx, dy] = NEIGHBORS[dir];
  return { x: cell.x + dx, y: cell.y + dy };
}

export function oppositeDir(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

export type Transition = {
  fromLevel: number;
  toLevel: number;
  elapsedMs: number;
  durationMs: number;
};

export type GameState = {
  snake: Cell[];
  dir: Dir;
  nextDir: Dir;
  food: Cell[];
  score: number;
  dead: boolean;
  level: number;
  transition: Transition | null;
};

export const BOARD_PX = 720;
export const LEVELS = 11;
export const INITIAL_LENGTH = 3;
export const TRANSITION_MS = 600;

// Level 0 is a tiny, fixed-layout tutorial. Levels 1..LEVELS-1 follow the ramp.
const TUTORIAL_COLS = 10;
const TUTORIAL_TICK_MS = 240;
const TUTORIAL_APPLES = 3;
const COLS_BASE = 15;
const COLS_STEP = 3;
const TICK_MS_BASE = 180;
const TICK_MS_FINAL = 50;
const APPLES_BASE = 3;
const APPLES_STEP = 2;

function clampLevel(level: number): number {
  return Math.max(0, Math.min(level, LEVELS - 1));
}

export function applesToAdvanceFrom(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_APPLES;
  return APPLES_BASE + APPLES_STEP * (n - 1);
}

export function scoreToReachLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return 0;
  const k = n - 1;
  return TUTORIAL_APPLES + APPLES_BASE * k + (APPLES_STEP * k * (k - 1)) / 2;
}

export function levelForScore(score: number): number {
  let lvl = 0;
  for (let n = 1; n < LEVELS; n++) {
    if (scoreToReachLevel(n) <= score) lvl = n;
    else break;
  }
  return lvl;
}

export function colsForLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_COLS;
  return COLS_BASE + COLS_STEP * (n - 1);
}

export function tickMsForLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_TICK_MS;
  const t = (n - 1) / (LEVELS - 2);
  return TICK_MS_BASE * Math.pow(TICK_MS_FINAL / TICK_MS_BASE, t);
}

// Isometric diamond tile. Grid cell (x, y) projects to
//   sx = originX + (x - y) * tileW/2
//   sy = originY + (x + y) * tileH/2
// The cols×cols grid forms a diamond inscribed in BOARD_PX horizontally.
// TILE_ASPECT controls how "steep" the view feels: 0.5 is classic Q*bert,
// 0.577 is true 30° isometric, 1.0 would be straight top-down (45°-rotated
// square). Higher = more head-on.
export const TILE_ASPECT = 0.7;

export type IsoLayout = {
  tileW: number;
  tileH: number;
  originX: number;
  originY: number;
};

export function isoTileWFor(cols: number): number {
  return BOARD_PX / cols;
}

export function isoLayoutFor(tileW: number, cols: number): IsoLayout {
  const tileH = tileW * TILE_ASPECT;
  return {
    tileW,
    tileH,
    originX: BOARD_PX / 2,
    originY: BOARD_PX / 2 - ((cols - 1) * tileH) / 2,
  };
}

export function isoLayout(level: number): IsoLayout {
  const cols = colsForLevel(level);
  return isoLayoutFor(isoTileWFor(cols), cols);
}

export function gridToScreen(
  x: number,
  y: number,
  layout: IsoLayout,
): { px: number; py: number } {
  return {
    px: layout.originX + (x - y) * (layout.tileW / 2),
    py: layout.originY + (x + y) * (layout.tileH / 2),
  };
}
