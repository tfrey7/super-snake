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

export function cellPx(level: number): number {
  return BOARD_PX / colsForLevel(level);
}

export function tickMsForLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_TICK_MS;
  const t = (n - 1) / (LEVELS - 2);
  return TICK_MS_BASE * Math.pow(TICK_MS_FINAL / TICK_MS_BASE, t);
}
