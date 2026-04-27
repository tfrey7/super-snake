export type Cell = { x: number; y: number };

// Pointy-top hex directions, indexed 0..5 around the hex.
// E, NE, NW, W, SW, SE — opposite pairs are (d, d+3) mod 6.
export type Dir = 0 | 1 | 2 | 3 | 4 | 5;
export const DIR_E: Dir = 0;
export const DIR_NE: Dir = 1;
export const DIR_NW: Dir = 2;
export const DIR_W: Dir = 3;
export const DIR_SW: Dir = 4;
export const DIR_SE: Dir = 5;

// odd-r offset coords: odd rows are visually shifted right by half a hex width,
// so the cell-coord neighbor offsets depend on row parity.
const NEIGHBORS_EVEN: ReadonlyArray<readonly [number, number]> = [
  [+1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, +1],
  [0, +1],
];
const NEIGHBORS_ODD: ReadonlyArray<readonly [number, number]> = [
  [+1, 0],
  [+1, -1],
  [0, -1],
  [-1, 0],
  [0, +1],
  [+1, +1],
];

export function neighborOf(cell: Cell, dir: Dir): Cell {
  const table = cell.y & 1 ? NEIGHBORS_ODD : NEIGHBORS_EVEN;
  const [dx, dy] = table[dir];
  return { x: cell.x + dx, y: cell.y + dy };
}

export function oppositeDir(dir: Dir): Dir {
  return ((dir + 3) % 6) as Dir;
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
  food: Cell;
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

export const SQRT3 = Math.sqrt(3);

export type HexLayout = {
  size: number;
  width: number;
  rowStep: number;
  originX: number;
  originY: number;
};

// Pointy-top hex circumradius sized so a cols×cols odd-r grid fits BOARD_PX.
// Width packs as sqrt(3)*size per col plus a half-hex for the odd-row shift,
// so the width constraint dominates for square grids and we letterbox vertically.
export function hexSizeFor(cols: number): number {
  const sizeFromWidth = BOARD_PX / (SQRT3 * (cols + 0.5));
  const sizeFromHeight = BOARD_PX / (1.5 * cols + 0.5);
  return Math.min(sizeFromWidth, sizeFromHeight);
}

export function hexSize(level: number): number {
  return hexSizeFor(colsForLevel(level));
}

export function hexLayoutFor(size: number, cols: number): HexLayout {
  const width = SQRT3 * size;
  const rowStep = 1.5 * size;
  const gridWidth = width * cols + width / 2;
  const gridHeight = rowStep * (cols - 1) + 2 * size;
  const padX = (BOARD_PX - gridWidth) / 2;
  const padY = (BOARD_PX - gridHeight) / 2;
  return {
    size,
    width,
    rowStep,
    originX: padX + width / 2,
    originY: padY + size,
  };
}

export function hexLayout(level: number): HexLayout {
  return hexLayoutFor(hexSize(level), colsForLevel(level));
}

export function hexCenter(
  x: number,
  y: number,
  layout: HexLayout,
): { px: number; py: number } {
  const xOffset = y & 1 ? layout.width / 2 : 0;
  return {
    px: layout.originX + x * layout.width + xOffset,
    py: layout.originY + y * layout.rowStep,
  };
}
