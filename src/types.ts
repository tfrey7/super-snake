export type Cell = { x: number; y: number };
export type Dir = Cell;

export type GameState = {
  snake: Cell[];
  dir: Dir;
  nextDir: Dir;
  food: Cell;
  score: number;
  dead: boolean;
};

export const COLS = 20;
export const ROWS = 20;
export const CELL = 20;
export const TICK_MS = 120;

export const INITIAL_LENGTH = 3;
