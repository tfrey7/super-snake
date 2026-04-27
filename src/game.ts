import {
  DIR_E,
  INITIAL_LENGTH,
  TRANSITION_MS,
  colsForLevel,
  levelForScore,
  neighborOf,
  oppositeDir,
  type Cell,
  type Dir,
  type GameState,
} from './types';

// Tutorial apples sit in the snake's lane (a single eastward row) so it
// auto-eats them in sequence; the final eat triggers the level-up.
const TUTORIAL_APPLE_X = [5, 7, 9];

export function createInitialState(): GameState {
  const level = 0;
  const cols = colsForLevel(level);
  const midY = Math.floor(cols / 2);
  const snake: Cell[] = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    snake.push({ x: 2 - i, y: midY });
  }
  const state: GameState = {
    snake,
    dir: DIR_E,
    nextDir: DIR_E,
    food: { x: 0, y: 0 },
    score: 0,
    dead: false,
    level,
    transition: null,
  };
  state.food = randomEmptyCell(state);
  return state;
}

export function setNextDir(state: GameState, dir: Dir): void {
  if (dir === oppositeDir(state.dir)) return;
  state.nextDir = dir;
}

export function step(state: GameState): void {
  if (state.dead) return;
  state.dir = state.nextDir;
  const cols = colsForLevel(state.level);
  const rows = cols;
  const head = state.snake[0];
  const next = neighborOf(head, state.dir);

  if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) {
    state.dead = true;
    return;
  }
  for (let i = 0; i < state.snake.length - 1; i++) {
    const seg = state.snake[i];
    if (seg.x === next.x && seg.y === next.y) {
      state.dead = true;
      return;
    }
  }

  state.snake.unshift(next);
  if (next.x === state.food.x && next.y === state.food.y) {
    state.score += 1;
    advanceLevelIfNeeded(state);
    state.food = randomEmptyCell(state);
  } else {
    state.snake.pop();
  }
}

// Dev cheat: bump the score (and trigger level-up if crossed) without
// touching the snake or the on-field apple. Bound to Shift+A in main.ts.
export function cheatEat(state: GameState): void {
  if (state.dead) return;
  state.score += 1;
  advanceLevelIfNeeded(state);
}

function advanceLevelIfNeeded(state: GameState): void {
  const target = levelForScore(state.score);
  if (target === state.level) return;
  const fromLevel = state.level;
  state.level = target;
  state.transition = {
    fromLevel,
    toLevel: target,
    elapsedMs: 0,
    durationMs: TRANSITION_MS,
  };
}

export function randomEmptyCell(state: GameState): Cell {
  const cols = colsForLevel(state.level);
  if (state.level === 0) {
    const idx = Math.min(state.score, TUTORIAL_APPLE_X.length - 1);
    return { x: TUTORIAL_APPLE_X[idx], y: Math.floor(cols / 2) };
  }
  const rows = cols;
  const occupied = new Set(state.snake.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 };
  return free[Math.floor(Math.random() * free.length)];
}
