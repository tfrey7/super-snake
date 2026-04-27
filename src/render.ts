import { BOARD_PX, cellPx, colsForLevel, type GameState } from './types';

const BG = '#0e1116';
const GRID = '#161b22';
const SNAKE_BODY = '#5eead4';
const SNAKE_HEAD = '#a7f3d0';
const FOOD = '#f472b6';
const TEXT = '#e6edf3';

export function draw(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cols = colsForLevel(state.level);
  const rows = cols;
  const cell = cellPx(state.level);
  const w = BOARD_PX;
  const h = BOARD_PX;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(w, y * cell + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = FOOD;
  fillCell(ctx, state.food.x, state.food.y, cell);

  for (let i = 0; i < state.snake.length; i++) {
    ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE_BODY;
    const seg = state.snake[i];
    fillCell(ctx, seg.x, seg.y, cell);
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

function fillCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
): void {
  ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
}
