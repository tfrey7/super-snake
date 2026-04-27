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
export const LEVEL_SIZES = [15, 30, 45] as const;
export const LEVEL_TICK_MS = [180, 110, 70] as const;
export const APPLES_PER_LEVEL = 5;
export const INITIAL_LENGTH = 3;
export const TRANSITION_MS = 600;

function clampLevel(level: number): number {
  return Math.max(0, Math.min(level, LEVEL_SIZES.length - 1));
}

export function colsForLevel(level: number): number {
  return LEVEL_SIZES[clampLevel(level)];
}

export function cellPx(level: number): number {
  return BOARD_PX / colsForLevel(level);
}

export function tickMsForLevel(level: number): number {
  return LEVEL_TICK_MS[clampLevel(level)];
}
