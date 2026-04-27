export type Cell = { x: number; y: number };
export type Dir = Cell;

export type Transition = {
  fromLevel: number;
  toLevel: number;
  dx: number;
  dy: number;
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
export const LEVELS = 10;
export const APPLES_PER_LEVEL = 3;
export const INITIAL_LENGTH = 3;
export const TRANSITION_MS = 600;

const COLS_BASE = 15;
const COLS_STEP = 3;
const TICK_MS_BASE = 180;
const TICK_MS_FINAL = 50;

function clampLevel(level: number): number {
  return Math.max(0, Math.min(level, LEVELS - 1));
}

export function colsForLevel(level: number): number {
  return COLS_BASE + COLS_STEP * clampLevel(level);
}

export function cellPx(level: number): number {
  return BOARD_PX / colsForLevel(level);
}

export function tickMsForLevel(level: number): number {
  const t = clampLevel(level) / (LEVELS - 1);
  return TICK_MS_BASE * Math.pow(TICK_MS_FINAL / TICK_MS_BASE, t);
}
