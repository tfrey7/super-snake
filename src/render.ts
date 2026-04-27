import { BOARD_PX, cellPx, colsForLevel, type GameState } from './types';

const BG = '#0e1116';
const GRID = '#161b22';
const SNAKE_BODY = '#5eead4';
const SNAKE_HEAD = '#a7f3d0';
const FOOD = '#f472b6';
const TEXT = '#e6edf3';

export function draw(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = BOARD_PX;
  const h = BOARD_PX;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  let cell: number;
  let originX: number;
  let originY: number;
  let cols: number;

  if (state.transition) {
    const { fromLevel, toLevel, dx, dy, elapsedMs, durationMs } =
      state.transition;
    const t = easeOutCubic(Math.min(elapsedMs / durationMs, 1));
    const oldCell = BOARD_PX / colsForLevel(fromLevel);
    const newCell = BOARD_PX / colsForLevel(toLevel);
    cell = lerp(oldCell, newCell, t);
    originX = lerp(-dx * oldCell, 0, t);
    originY = lerp(-dy * oldCell, 0, t);
    cols = colsForLevel(toLevel);
  } else {
    cell = cellPx(state.level);
    originX = 0;
    originY = 0;
    cols = colsForLevel(state.level);
  }

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    const px = originX + x * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
  for (let y = 0; y <= cols; y++) {
    const py = originY + y * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }

  ctx.fillStyle = FOOD;
  fillCellAt(ctx, state.food.x, state.food.y, cell, originX, originY);

  for (let i = 0; i < state.snake.length; i++) {
    ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE_BODY;
    const seg = state.snake[i];
    fillCellAt(ctx, seg.x, seg.y, cell, originX, originY);
  }

  ctx.fillStyle = TEXT;
  ctx.font = '14px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`score ${state.score}`, 8, 8);

  if (state.dead) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = TEXT;
    ctx.font = '20px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('game over', w / 2, h / 2 - 12);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('press space to restart', w / 2, h / 2 + 14);
    ctx.textAlign = 'start';
  }
}

function fillCellAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  originX: number,
  originY: number,
): void {
  ctx.fillRect(originX + x * cell + 1, originY + y * cell + 1, cell - 2, cell - 2);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
