import { GLYPHS } from './pixelFont';
import { BOARD_PX } from './types';

const TITLE_CORE = '167, 243, 208';
const TITLE_GLOW = '94, 234, 212';
const PROMPT_COLOR = '244, 114, 182';
const STAR_COLOR = '226, 232, 240';

const TITLE = 'SNUMINES';
const PIXEL = 12;
const LETTER_W = 5 * PIXEL;
const LETTER_H = 7 * PIXEL;
const LETTER_GAP = PIXEL;

type Star = { x: number; y: number; phase: number; speed: number; size: number };
let stars: Star[] | null = null;

function ensureStars(): Star[] {
  if (stars) return stars;
  // Deterministic positions seeded by a tiny LCG so the field is stable across reloads.
  let s = 0x9e3779b1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const out: Star[] = [];
  for (let i = 0; i < 70; i++) {
    out.push({
      x: rand() * BOARD_PX,
      y: rand() * BOARD_PX,
      phase: rand() * Math.PI * 2,
      speed: 0.0006 + rand() * 0.0022,
      size: rand() < 0.75 ? 1 : 2,
    });
  }
  stars = out;
  return out;
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  now: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const w = BOARD_PX;
  const h = BOARD_PX;

  ctx.fillStyle = `rgba(14, 17, 22, ${alpha})`;
  ctx.fillRect(0, 0, w, h);

  // Twinkling stars.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const star of ensureStars()) {
    const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * star.speed + star.phase));
    ctx.fillStyle = `rgba(${STAR_COLOR}, ${tw * 0.55 * alpha})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.restore();

  // Pixel art title.
  const totalW = TITLE.length * LETTER_W + (TITLE.length - 1) * LETTER_GAP;
  const startX = Math.round((w - totalW) / 2);
  const startY = Math.round((h - LETTER_H) / 2 - 40);

  const pulse = 0.5 + 0.5 * Math.sin(now * 0.0022);

  // Soft glow halos.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const blur of [22, 12, 5]) {
    ctx.shadowColor = `rgba(${TITLE_GLOW}, 1)`;
    ctx.shadowBlur = blur;
    const a = (0.06 + pulse * 0.07) * alpha;
    drawTitleText(ctx, startX, startY, `rgba(${TITLE_GLOW}, ${a})`);
  }
  ctx.restore();

  // Sharp core letters.
  ctx.save();
  const coreAlpha = (0.85 + pulse * 0.15) * alpha;
  drawTitleText(ctx, startX, startY, `rgba(${TITLE_CORE}, ${coreAlpha})`);
  ctx.restore();

  // Diagonal shimmer band sweeping across the letters — ties the title to gameplay aesthetic.
  drawTitleShimmer(ctx, startX, startY, now, alpha);

  // Subtitle (blinking prompt).
  const blink = 0.5 + 0.5 * Math.sin((now / 1100) * Math.PI * 2);
  const promptAlpha = (0.35 + 0.55 * blink) * alpha;
  ctx.fillStyle = `rgba(${PROMPT_COLOR}, ${promptAlpha})`;
  ctx.font = '14px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRESS ANY KEY TO BEGIN', w / 2, startY + LETTER_H + 70);

  // Tagline.
  ctx.fillStyle = `rgba(${TITLE_GLOW}, ${0.45 * alpha})`;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('a luminous serpent', w / 2, startY - 28);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
}

function drawTitleText(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillStyle: string,
): void {
  ctx.fillStyle = fillStyle;
  for (let i = 0; i < TITLE.length; i++) {
    const ch = TITLE[i];
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    const gx = startX + i * (LETTER_W + LETTER_GAP);
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          ctx.fillRect(gx + col * PIXEL, startY + row * PIXEL, PIXEL, PIXEL);
        }
      }
    }
  }
}

const SHIMMER_PERIOD_MS = 4200;
const SHIMMER_BAND_PX = 110;

function drawTitleShimmer(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  now: number,
  alpha: number,
): void {
  const totalW = TITLE.length * LETTER_W + (TITLE.length - 1) * LETTER_GAP;
  const span = totalW + LETTER_H + SHIMMER_BAND_PX * 2;
  const t = (now % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
  const bandPos = -SHIMMER_BAND_PX + t * span;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < TITLE.length; i++) {
    const ch = TITLE[i];
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    const gx = startX + i * (LETTER_W + LETTER_GAP);
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (!(bits & (1 << (4 - col)))) continue;
        const px = gx + col * PIXEL - startX;
        const py = row * PIXEL;
        const diag = px + py;
        const d = Math.abs(diag - bandPos);
        if (d >= SHIMMER_BAND_PX) continue;
        const factor = 0.5 * (1 + Math.cos((Math.PI * d) / SHIMMER_BAND_PX));
        ctx.fillStyle = `rgba(255, 255, 255, ${factor * 0.35 * alpha})`;
        ctx.fillRect(gx + col * PIXEL, startY + row * PIXEL, PIXEL, PIXEL);
      }
    }
  }
  ctx.restore();
}
