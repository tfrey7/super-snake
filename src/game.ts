import {
  COLS,
  ROWS,
  INITIAL_LENGTH,
  type Cell,
  type Dir,
  type GameState,
} from './types';

export function createInitialState(): GameState {
  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);
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
  const head = state.snake[0];
  const next: Cell = { x: head.x + state.dir.x, y: head.y + state.dir.y };

  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
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
    state.food = randomEmptyCell(state);
  } else {
    state.snake.pop();
  }
}

export function randomEmptyCell(state: GameState): Cell {
  const occupied = new Set(state.snake.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 };
  return free[Math.floor(Math.random() * free.length)];
}
