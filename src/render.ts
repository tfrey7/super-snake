import { drawText, textWidth } from './pixelFont';
import type { BeatState } from './sound';
import {
  BOARD_PX,
  LEVELS,
  applesToAdvanceFrom,
  colsForLevel,
  gridToScreen,
  isoLayoutFor,
  isoTileWFor,
  scoreToReachLevel,
  type GameState,
  type IsoLayout,
} from './types';

const SNAKE_BODY = '#5eead4';
const SNAKE_HEAD = '#a7f3d0';
const FOOD = '#f472b6';

const SNAKE_BODY_RGB = hexToRgb(SNAKE_BODY);
const SNAKE_HEAD_RGB = hexToRgb(SNAKE_HEAD);
const FOOD_RGB = hexToRgb(FOOD);

type Rgb = [number, number, number];

// Per-level palette: HSL hue rotation around a fixed dark luminance, low chroma.
// Snake/food stay constant so contrast is preserved as the world drifts in tone.
// Level 0 is the tutorial — most muted so cool-blue at level 1 reads as the real start.
// Accent is the bright sibling of bg/grid — drives label text and the level progress bar.
const LEVEL_PALETTE: Array<{ bg: Rgb; grid: Rgb; accent: Rgb }> = [
  { bg: [12, 13, 16], grid: [20, 22, 26], accent: [148, 163, 184] }, // 0: tutorial — neutral slate
  { bg: [14, 17, 22], grid: [22, 27, 34], accent: [147, 197, 253] }, // 1: cool blue (origin)
  { bg: [14, 22, 22], grid: [22, 34, 34], accent: [103, 232, 249] }, // 2: cyan
  { bg: [14, 22, 18], grid: [22, 34, 28], accent: [94, 234, 212] }, // 3: teal
  { bg: [15, 22, 14], grid: [24, 34, 22], accent: [134, 239, 172] }, // 4: green
  { bg: [20, 22, 14], grid: [32, 34, 22], accent: [190, 242, 100] }, // 5: yellow-green
  { bg: [22, 18, 14], grid: [34, 28, 22], accent: [252, 211, 77] }, // 6: amber
  { bg: [22, 14, 14], grid: [34, 22, 22], accent: [252, 165, 165] }, // 7: red
  { bg: [22, 14, 19], grid: [34, 22, 30], accent: [249, 168, 212] }, // 8: magenta
  { bg: [19, 14, 22], grid: [26, 22, 34], accent: [196, 181, 253] }, // 9: violet
  { bg: [14, 14, 22], grid: [22, 22, 34], accent: [165, 180, 252] }, // 10: indigo
];

const PULSE_AMP = 55;
const PULSE_BG_AMP = 22;
const PULSE_BAND = 3.2;
const PULSE_SWEEP_MS = 1800;

// Each pulse is a Manhattan-distance ring expanding from a fixed grid origin.
// Rings are emitted from an apple at spawn time but live independently — once
// airborne they no longer track the apple, so eating mid-sweep can leave two
// rings overlapping. Manhattan rings form on-grid diamonds, which project to
// screen-space rectangles in iso (since the iso transform stretches the
// diamond by tileW:tileH).
type Pulse = {
  ox: number;
  oy: number;
  startMs: number;
  maxRadius: number;
};

let pulses: Pulse[] = [];
let lastHeartbeatMs = -Infinity;
let lastPulseLevel = -1;

export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  beat: BeatState | null,
  now: number,
): void {
  const w = BOARD_PX;
  const h = BOARD_PX;

  let layout: IsoLayout;
  let cols: number;
  let bgRgb: Rgb;
  let gridRgb: Rgb;
  let accentRgb: Rgb;

  if (state.transition) {
    const { fromLevel, toLevel, elapsedMs, durationMs } = state.transition;
    const t = easeOutCubic(Math.min(elapsedMs / durationMs, 1));
    const fromCols = colsForLevel(fromLevel);
    const toCols = colsForLevel(toLevel);
    cols = toCols;
    const tileW = lerp(isoTileWFor(fromCols), isoTileWFor(toCols), t);
    layout = isoLayoutFor(tileW, toCols);
    const fromPal = LEVEL_PALETTE[fromLevel];
    const toPal = LEVEL_PALETTE[toLevel];
    bgRgb = lerpRgb(fromPal.bg, toPal.bg, t);
    gridRgb = lerpRgb(fromPal.grid, toPal.grid, t);
    accentRgb = lerpRgb(fromPal.accent, toPal.accent, t);
  } else {
    cols = colsForLevel(state.level);
    layout = isoLayoutFor(isoTileWFor(cols), cols);
    const pal = LEVEL_PALETTE[state.level];
    bgRgb = pal.bg;
    gridRgb = pal.grid;
    accentRgb = pal.accent;
  }

  ctx.fillStyle = rgbStr(bgRgb);
  ctx.fillRect(0, 0, w, h);

  // Reset pulses across level changes — board size changes so origins and
  // maxRadius would be stale.
  if (state.level !== lastPulseLevel) {
    pulses = [];
    lastHeartbeatMs = -Infinity;
    lastPulseLevel = state.level;
  }

  const pulseEnabled = state.level >= 3;
  if (pulseEnabled) {
    // Pulse all fruits in unison on the downbeat — heartbeat (layer 0) fires
    // on steps 0 and 8 (beats 1 and 3); we want only step 0, the bar's
    // strong beat, so the rings come once per bar instead of twice.
    const heartbeat = beat?.layerFireMs[0];
    const heartbeatStep = beat?.layerFireSteps[0];
    if (
      heartbeat !== undefined &&
      Number.isFinite(heartbeat) &&
      heartbeat > lastHeartbeatMs &&
      heartbeatStep === 0
    ) {
      for (const f of state.food) {
        pulses.push(makePulse(f.x, f.y, cols, now));
      }
      lastHeartbeatMs = heartbeat;
    }
    pulses = pulses.filter((p) => now - p.startMs < PULSE_SWEEP_MS);
  } else if (pulses.length > 0) {
    pulses = [];
  }

  const pulseAt = (x: number, y: number): number => {
    if (pulses.length === 0) return 0;
    let total = 0;
    for (const p of pulses) {
      const ringRadius =
        ((now - p.startMs) / PULSE_SWEEP_MS) * (p.maxRadius + PULSE_BAND);
      const dist = Math.abs(x - p.ox) + Math.abs(y - p.oy);
      const d = Math.abs(dist - ringRadius);
      if (d >= PULSE_BAND) continue;
      // Manhattan ring circumference grows ~4r; without a fade the outer rings
      // light more cells than the inner ones and dominate the cycle visually.
      const ringFade = 1 / (1 + ringRadius * 0.18);
      total += 0.5 * (1 + Math.cos((Math.PI * d) / PULSE_BAND)) * ringFade;
    }
    return total;
  };

  // Tile outlines, batched into one path. Adjacent tiles share edges which get
  // stroked twice — cheap and visually identical.
  ctx.strokeStyle = rgbStr(gridRgb);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < cols; y++) {
    for (let x = 0; x < cols; x++) {
      const c = gridToScreen(x, y, layout);
      addTilePath(ctx, c.px, c.py, layout.tileW, layout.tileH);
    }
  }
  ctx.stroke();

  if (pulses.length > 0) {
    const occupied = new Set<number>();
    for (const f of state.food) occupied.add(f.y * cols + f.x);
    for (const seg of state.snake) occupied.add(seg.y * cols + seg.x);
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < cols; x++) {
        if (occupied.has(y * cols + x)) continue;
        const factor = pulseAt(x, y);
        if (factor <= 0) continue;
        ctx.fillStyle = shiftRgb(bgRgb, factor * PULSE_BG_AMP);
        fillTile(ctx, x, y, layout);
      }
    }
  }

  for (const f of state.food) {
    ctx.fillStyle = shiftRgb(FOOD_RGB, pulseAt(f.x, f.y) * PULSE_AMP);
    fillTile(ctx, f.x, f.y, layout);
  }

  for (let i = 0; i < state.snake.length; i++) {
    const seg = state.snake[i];
    const base = i === 0 ? SNAKE_HEAD_RGB : SNAKE_BODY_RGB;
    ctx.fillStyle = shiftRgb(base, pulseAt(seg.x, seg.y) * PULSE_AMP);
    fillTile(ctx, seg.x, seg.y, layout);
  }

  ctx.fillStyle = rgbStr(accentRgb);
  ctx.font = '14px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'start';
  ctx.fillText(`score ${state.score}`, 8, 8);

  // Level indicator and progress bar are hidden on the tutorial — the player
  // shouldn't know there's a level system until the first level-up reveals it.
  if (state.level >= 1) {
    ctx.textAlign = 'end';
    ctx.fillText(`level ${state.level} / ${LEVELS - 1}`, w - 8, 8);
    ctx.textAlign = 'start';

    if (state.level < LEVELS - 1) {
      const eaten = state.score - scoreToReachLevel(state.level);
      const need = applesToAdvanceFrom(state.level);
      const t = Math.max(0, Math.min(1, eaten / need));
      const barW = 100;
      const barH = 4;
      const barX = w - 8 - barW;
      const barY = 24;
      const accent = `${Math.round(accentRgb[0])}, ${Math.round(accentRgb[1])}, ${Math.round(accentRgb[2])}`;
      ctx.fillStyle = `rgba(${accent}, 0.2)`;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = `rgba(${accent}, 0.9)`;
      ctx.fillRect(barX, barY, barW * t, barH);
    }
  }
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

  const showFlash = level >= 4;
  const showGlow = level >= 3;
  const showWobble = level >= 3;
  const baseScale = level >= 4 ? 1 : level === 3 ? 0.85 : 0.7;

  const palIdx = Math.max(0, Math.min(LEVELS - 1, level));
  const accent = LEVEL_PALETTE[palIdx].accent;
  const [accH, accS, accL] = rgbToHsl(accent);
  const glow = hslToRgb(
    accH,
    Math.max(0.15, accS * 0.4),
    Math.min(0.92, accL + 0.15),
  );
  const coreStr = rgbTriplet(accent);
  const glowStr = rgbTriplet(glow);

  // Soft full-screen flash that quickly decays.
  if (showFlash && elapsed < LEVEL_UP_FLASH_MS) {
    const f = 1 - elapsed / LEVEL_UP_FLASH_MS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${glowStr}, ${f * 0.35})`;
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

  const text = `LEVEL ${level}`;
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
      ctx.shadowColor = `rgba(${glowStr}, 1)`;
      ctx.shadowBlur = blur;
      ctx.fillStyle = `rgba(${glowStr}, ${0.18 * alpha})`;
      drawText(ctx, text, 0, 0, px);
    }
    ctx.restore();
  }

  // Sharp core.
  ctx.fillStyle = `rgba(${coreStr}, ${alpha})`;
  drawText(ctx, text, 0, 0, px);

  ctx.restore();
}

function makePulse(
  foodX: number,
  foodY: number,
  cols: number,
  now: number,
): Pulse {
  // Manhattan distance from the origin to the farthest board corner — how far
  // the ring has to travel to fully clear the board. Computing per pulse keeps
  // the wall-clock sweep duration constant regardless of where on the board
  // the apple sat when the ring was emitted.
  let maxRadius = 0;
  for (const [cx, cy] of [
    [0, 0],
    [cols - 1, 0],
    [0, cols - 1],
    [cols - 1, cols - 1],
  ] as const) {
    const d = Math.abs(cx - foodX) + Math.abs(cy - foodY);
    if (d > maxRadius) maxRadius = d;
  }
  return { ox: foodX, oy: foodY, startMs: now, maxRadius };
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

// Iso diamond tile centered at (cx, cy), full width tileW and full height tileH.
// Adds the polygon to the current path; caller decides whether to fill or stroke.
function addTilePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tileW: number,
  tileH: number,
): void {
  const hw = tileW / 2;
  const hh = tileH / 2;
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

function fillTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  layout: IsoLayout,
): void {
  const { px, py } = gridToScreen(x, y, layout);
  // Shrink each axis by ~1px to leave a thin gap between adjacent fills, so
  // snake body segments and grid lines stay readable.
  const w = Math.max(2, layout.tileW - 2);
  const h = Math.max(1, layout.tileH - 1);
  ctx.beginPath();
  addTilePath(ctx, px, py, w, h);
  ctx.fill();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

// Per-level firework palette: hue/lightness variations around the level's accent
// so bursts read as part of the same world rather than generic confetti.
const LEVEL_FIREWORK_COLORS: string[][] = LEVEL_PALETTE.map(({ accent }) => {
  const [h, s, l] = rgbToHsl(accent);
  const variants: Array<[number, number, number]> = [
    [h, s, l],
    [h, Math.max(0.35, s * 0.85), Math.min(0.85, l + 0.12)],
    [h + 24, Math.min(1, s + 0.05), l],
    [h - 24, Math.min(1, s + 0.05), l],
    [h, Math.min(1, s + 0.2), Math.max(0.45, l - 0.05)],
  ];
  return variants.map(([hh, ss, ll]) => rgbStr(hslToRgb(hh, ss, ll)));
});

export function levelFireworkColors(level: number): readonly string[] {
  const idx = Math.max(0, Math.min(LEVELS - 1, level));
  return LEVEL_FIREWORK_COLORS[idx];
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(hDeg: number, s: number, l: number): Rgb {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 1) [r1, g1, b1] = [c, x, 0];
  else if (h < 2) [r1, g1, b1] = [x, c, 0];
  else if (h < 3) [r1, g1, b1] = [0, c, x];
  else if (h < 4) [r1, g1, b1] = [0, x, c];
  else if (h < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function shiftRgb(rgb: Rgb, amt: number): string {
  const r = clamp255(rgb[0] + amt);
  const g = clamp255(rgb[1] + amt);
  const b = clamp255(rgb[2] + amt);
  return `rgb(${r}, ${g}, ${b})`;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function rgbStr(rgb: Rgb): string {
  return `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
}

function rgbTriplet(rgb: Rgb): string {
  return `${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}`;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
