import {
  APPLES_PER_LEVEL,
  INITIAL_LENGTH,
  LEVELS,
  TRANSITION_MS,
  colsForLevel,
  type Cell,
  type Dir,
  type GameState,
} from './types';

export function createInitialState(): GameState {
  const level = 0;
  const cols = colsForLevel(level);
  const startX = Math.floor(cols / 2);
  const startY = Math.floor(cols / 2);
  const snake: Cell[] = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    snake.push({ x: startX - i, y: startY });
  }
  const dir: Dir = { x: 1, y: 0 };
  const state: GameState = {
    snake,
    dir,
    nextDir: { ...dir },
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
  if (dir.x === -state.dir.x && dir.y === -state.dir.y) return;
  if (dir.x === 0 && dir.y === 0) return;
  state.nextDir = dir;
}

export function step(state: GameState): void {
  if (state.dead) return;
  state.dir = state.nextDir;
  const cols = colsForLevel(state.level);
  const rows = cols;
  const head = state.snake[0];
  const next: Cell = { x: head.x + state.dir.x, y: head.y + state.dir.y };

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

function advanceLevelIfNeeded(state: GameState): void {
  const target = Math.min(
    Math.floor(state.score / APPLES_PER_LEVEL),
    LEVELS - 1,
  );
  if (target === state.level) return;
  const fromLevel = state.level;
  state.level = target;
  const newCols = colsForLevel(target);
  const newCenter = Math.floor(newCols / 2);
  const head = state.snake[0];
  let dx = Math.max(-1, Math.min(1, newCenter - head.x));
  let dy = Math.max(-1, Math.min(1, newCenter - head.y));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const seg of state.snake) {
    if (seg.x < minX) minX = seg.x;
    if (seg.x > maxX) maxX = seg.x;
    if (seg.y < minY) minY = seg.y;
    if (seg.y > maxY) maxY = seg.y;
  }
  if (minX + dx < 0) dx = -minX;
  else if (maxX + dx > newCols - 1) dx = newCols - 1 - maxX;
  if (minY + dy < 0) dy = -minY;
  else if (maxY + dy > newCols - 1) dy = newCols - 1 - maxY;
  for (const seg of state.snake) {
    seg.x += dx;
    seg.y += dy;
  }
  state.transition = {
    fromLevel,
    toLevel: target,
    dx,
    dy,
    elapsedMs: 0,
    durationMs: TRANSITION_MS,
  };
}

export function randomEmptyCell(state: GameState): Cell {
  const cols = colsForLevel(state.level);
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
