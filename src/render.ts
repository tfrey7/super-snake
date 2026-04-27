import {
  BOARD_PX,
  cellPx,
  colsForLevel,
  tickMsForLevel,
  type GameState,
} from './types';

const BG = '#0e1116';
const GRID = '#161b22';
const SNAKE_BODY = '#5eead4';
const SNAKE_HEAD = '#a7f3d0';
const FOOD = '#f472b6';
const TEXT = '#e6edf3';

const BG_RGB = hexToRgb(BG);
const SNAKE_BODY_RGB = hexToRgb(SNAKE_BODY);
const SNAKE_HEAD_RGB = hexToRgb(SNAKE_HEAD);
const FOOD_RGB = hexToRgb(FOOD);

const SHIMMER_AMP = 55;
const SHIMMER_BG_AMP = 22;
const SHIMMER_BAND_CELLS = 4;
const SHIMMER_SWEEP_MS = 1800;
const SHIMMER_IDLE_TICKS = 18;

export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
): void {
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

  const tickMs = tickMsForLevel(state.level);
  const idleMs = tickMs * SHIMMER_IDLE_TICKS;
  const cycleMs = SHIMMER_SWEEP_MS + idleMs;
  const cyclePos = ((now % cycleMs) + cycleMs) % cycleMs;
  const maxDiag = (cols - 1) * 2;
  const sweepStart = -SHIMMER_BAND_CELLS;
  const sweepEnd = maxDiag + SHIMMER_BAND_CELLS;
  const sweepActive = cyclePos < SHIMMER_SWEEP_MS;
  const bandPos = sweepActive
    ? sweepStart + (cyclePos / SHIMMER_SWEEP_MS) * (sweepEnd - sweepStart)
    : 0;
  const shimmerAt = (x: number, y: number): number => {
    if (!sweepActive) return 0;
    const d = Math.abs(x + y - bandPos);
    if (d >= SHIMMER_BAND_CELLS) return 0;
    return 0.5 * (1 + Math.cos((Math.PI * d) / SHIMMER_BAND_CELLS));
  };

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

  if (sweepActive) {
    const occupied = new Set<number>();
    occupied.add(state.food.y * cols + state.food.x);
    for (const seg of state.snake) occupied.add(seg.y * cols + seg.x);
    const sMin = Math.max(0, Math.ceil(bandPos - SHIMMER_BAND_CELLS));
    const sMax = Math.min(maxDiag, Math.floor(bandPos + SHIMMER_BAND_CELLS));
    for (let s = sMin; s <= sMax; s++) {
      const xMin = Math.max(0, s - (cols - 1));
      const xMax = Math.min(cols - 1, s);
      for (let x = xMin; x <= xMax; x++) {
        const y = s - x;
        if (occupied.has(y * cols + x)) continue;
        const factor = shimmerAt(x, y);
        if (factor <= 0) continue;
        ctx.fillStyle = shiftRgb(BG_RGB, factor * SHIMMER_BG_AMP);
        fillCellAt(ctx, x, y, cell, originX, originY);
      }
    }
  }

  ctx.fillStyle = shiftRgb(FOOD_RGB, shimmerAt(state.food.x, state.food.y) * SHIMMER_AMP);
  fillCellAt(ctx, state.food.x, state.food.y, cell, originX, originY);

  for (let i = 0; i < state.snake.length; i++) {
    const seg = state.snake[i];
    const base = i === 0 ? SNAKE_HEAD_RGB : SNAKE_BODY_RGB;
    ctx.fillStyle = shiftRgb(base, shimmerAt(seg.x, seg.y) * SHIMMER_AMP);
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function shiftRgb(rgb: [number, number, number], amt: number): string {
  const r = clamp255(rgb[0] + amt);
  const g = clamp255(rgb[1] + amt);
  const b = clamp255(rgb[2] + amt);
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
