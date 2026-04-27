import { drawText, textWidth } from './pixelFont';
import type { BeatState } from './sound';
import {
  BOARD_PX,
  LEVELS,
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
const LEVEL_TEXT = '#fcd34d';

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

  const shimmerEnabled = state.level >= 2;
  const tickMs = tickMsForLevel(state.level);
  const idleMs = tickMs * SHIMMER_IDLE_TICKS;
  const cycleMs = SHIMMER_SWEEP_MS + idleMs;
  const cyclePos = ((now % cycleMs) + cycleMs) % cycleMs;
  const maxDiag = (cols - 1) * 2;
  const sweepStart = -SHIMMER_BAND_CELLS;
  const sweepEnd = maxDiag + SHIMMER_BAND_CELLS;
  const sweepActive = shimmerEnabled && cyclePos < SHIMMER_SWEEP_MS;
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
  ctx.textAlign = 'start';
  ctx.fillText(`score ${state.score}`, 8, 8);
  ctx.textAlign = 'end';
  ctx.fillStyle = LEVEL_TEXT;
  ctx.fillText(`level ${state.level + 1} / ${LEVELS}`, w - 8, 8);
  ctx.textAlign = 'start';
}

export function drawBeatBorder(
  ctx: CanvasRenderingContext2D,
  beat: BeatState | null,
  now: number,
): void {
  if (!beat) return;
  const { layerFireMs, unlockLevels, musicLevel, stepDurMs } = beat;
  const w = BOARD_PX;
  const h = BOARD_PX;

  const env = (idx: number, tauMs: number): number => {
    if (musicLevel < unlockLevels[idx]) return 0;
    const t = layerFireMs[idx];
    if (!Number.isFinite(t)) return 0;
    const dt = now - t;
    if (dt < 0) return 0;
    return Math.exp(-dt / tauMs);
  };

  const heartbeat = env(0, 700);
  const bass = env(1, 220);
  const kick = env(2, 140);
  const lead = env(3, 220);
  const hat = env(4, 90);
  const arp = env(5, 70);
  const snare = env(6, 220);
  const harmony = env(8, 240);
  const flourish = env(9, 110);

  let pad = 0;
  if (musicLevel >= unlockLevels[7]) {
    const t = layerFireMs[7];
    const barMs = stepDurMs * 16;
    if (Number.isFinite(t)) {
      const dt = now - t;
      if (dt >= 0 && dt < barMs) pad = 1 - dt / barMs;
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Base outline — heartbeat sets the slow pulse, bass adds thickness, kick flashes brightness.
  const thickness = 1 + bass * 3 + heartbeat * 1.4;
  const baseAlpha = Math.min(1, 0.18 + heartbeat * 0.45 + kick * 0.6 + pad * 0.18);
  ctx.lineWidth = thickness;
  ctx.strokeStyle = `rgba(94, 234, 212, ${baseAlpha})`;
  const o = thickness / 2;
  ctx.strokeRect(o, o, w - 2 * o, h - 2 * o);

  // Snare — pink slabs on left & right edges, the 2-and-4 backbeat.
  if (snare > 0.02) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(244, 114, 182, ${snare * 0.65})`;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(3, h);
    ctx.moveTo(w - 3, 0);
    ctx.lineTo(w - 3, h);
    ctx.stroke();
  }

  // Hi-hat — even tick marks across the top edge, all blink together on each 8th.
  if (musicLevel >= unlockLevels[4] && hat > 0.02) {
    ctx.fillStyle = `rgba(229, 231, 235, ${hat * 0.7})`;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * w) / n;
      ctx.fillRect(x - 1, 0, 2, 5);
    }
  }

  // Arp — narrower micro-ticks across the bottom edge on 16th-note offbeats.
  if (musicLevel >= unlockLevels[5] && arp > 0.02) {
    ctx.fillStyle = `rgba(216, 180, 254, ${arp * 0.6})`;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * w) / n;
      ctx.fillRect(x - 0.5, h - 4, 1.5, 4);
    }
  }

  // Lead — top corner brackets glow on each lead note.
  if (musicLevel >= unlockLevels[3] && lead > 0.02) {
    const sz = 16;
    ctx.fillStyle = `rgba(167, 243, 208, ${lead * 0.6})`;
    ctx.fillRect(0, 0, sz, 3);
    ctx.fillRect(0, 0, 3, sz);
    ctx.fillRect(w - sz, 0, sz, 3);
    ctx.fillRect(w - 3, 0, 3, sz);
  }

  // Harmony — bottom corner brackets on the doubled-third line.
  if (musicLevel >= unlockLevels[8] && harmony > 0.02) {
    const sz = 16;
    ctx.fillStyle = `rgba(254, 215, 170, ${harmony * 0.55})`;
    ctx.fillRect(0, h - 3, sz, 3);
    ctx.fillRect(0, h - sz, 3, sz);
    ctx.fillRect(w - sz, h - 3, sz, 3);
    ctx.fillRect(w - 3, h - sz, 3, sz);
  }

  // Flourish — corner sparks expanding inward when the open hat fires.
  if (musicLevel >= unlockLevels[9] && flourish > 0.02) {
    const reach = 8 + flourish * 28;
    ctx.strokeStyle = `rgba(252, 211, 77, ${flourish * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, reach);
    ctx.lineTo(0, 0);
    ctx.lineTo(reach, 0);
    ctx.moveTo(w - reach, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, reach);
    ctx.moveTo(w, h - reach);
    ctx.lineTo(w, h);
    ctx.lineTo(w - reach, h);
    ctx.moveTo(reach, h);
    ctx.lineTo(0, h);
    ctx.lineTo(0, h - reach);
    ctx.stroke();
  }

  ctx.restore();
}

const LEVEL_UP_DURATION_MS = 1700;
const LEVEL_UP_FLASH_MS = 320;
const BANNER_PIXEL = 10;
const BANNER_COLOR = '252, 211, 77';
const BANNER_GLOW = '255, 247, 200';

export function drawLevelUpOverlay(
  ctx: CanvasRenderingContext2D,
  level: number,
  startedAt: number,
  now: number,
): void {
  const elapsed = now - startedAt;
  if (elapsed < 0 || elapsed >= LEVEL_UP_DURATION_MS) return;
  const w = BOARD_PX;
  const h = BOARD_PX;

  const showFlash = level >= 3;
  const showGlow = level >= 2;
  const showWobble = level >= 2;
  const baseScale = level >= 3 ? 1 : level === 2 ? 0.85 : 0.7;

  // Soft full-screen flash that quickly decays.
  if (showFlash && elapsed < LEVEL_UP_FLASH_MS) {
    const f = 1 - elapsed / LEVEL_UP_FLASH_MS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(167, 243, 208, ${f * 0.35})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Banner: fade-in + scale-up, hold, fade-out.
  let alpha: number;
  let scale: number;
  if (elapsed < 220) {
    const t = elapsed / 220;
    alpha = t;
    scale = 0.6 + 0.4 * easeOutBack(t);
  } else if (elapsed < LEVEL_UP_DURATION_MS - 380) {
    alpha = 1;
    scale = 1;
  } else {
    const t = (elapsed - (LEVEL_UP_DURATION_MS - 380)) / 380;
    alpha = 1 - t;
    scale = 1 + 0.15 * t;
  }
  scale *= baseScale;

  const text = `LEVEL ${level + 1}`;
  const px = BANNER_PIXEL;
  const tw = textWidth(text, px);
  const th = 7 * px;
  const cx = w / 2;
  const cy = h / 2;
  const wobble = showWobble ? Math.sin(elapsed * 0.012) * 1.5 : 0;

  ctx.save();
  ctx.translate(cx, cy + wobble);
  ctx.scale(scale, scale);
  ctx.translate(-tw / 2, -th / 2);

  // Soft glow halos.
  if (showGlow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const blur of [22, 12, 5]) {
      ctx.shadowColor = `rgba(${BANNER_GLOW}, 1)`;
      ctx.shadowBlur = blur;
      ctx.fillStyle = `rgba(${BANNER_GLOW}, ${0.18 * alpha})`;
      drawText(ctx, text, 0, 0, px);
    }
    ctx.restore();
  }

  // Sharp core.
  ctx.fillStyle = `rgba(${BANNER_COLOR}, ${alpha})`;
  drawText(ctx, text, 0, 0, px);

  ctx.restore();
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
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
