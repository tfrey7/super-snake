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
    food: [],
    score: 0,
    dead: false,
    level,
    transition: null,
  };
  state.food = [randomEmptyCell(state)];
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
  const raw = neighborOf(head, state.dir);
  // Pac-Man style edge wrap. Self-collision is the only way to die.
  const next: Cell = {
    x: (raw.x + cols) % cols,
    y: (raw.y + rows) % rows,
  };
  for (let i = 0; i < state.snake.length - 1; i++) {
    const seg = state.snake[i];
    if (seg.x === next.x && seg.y === next.y) {
      state.dead = true;
      return;
    }
  }

  state.snake.unshift(next);
  const eatenIdx = state.food.findIndex(
    (f) => f.x === next.x && f.y === next.y,
  );
  if (eatenIdx >= 0) {
    state.score += 1;
    advanceLevelIfNeeded(state);
    state.food.splice(eatenIdx, 1);
    state.food.push(randomEmptyCell(state));
  } else {
    state.snake.pop();
  }
}

// Dev cheat: drop an extra apple onto the board without touching the score
// or the snake. Bound to Shift+A in main.ts.
export function cheatSpawnFruit(state: GameState): void {
  if (state.dead) return;
  state.food.push(randomEmptyCell(state));
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
  const occupied = new Set<string>();
  for (const c of state.snake) occupied.add(`${c.x},${c.y}`);
  for (const f of state.food) occupied.add(`${f.x},${f.y}`);
  const free: Cell[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 };
  return free[Math.floor(Math.random() * free.length)];
}
