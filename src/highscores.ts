import { drawText, textWidth } from './pixelFont';
import { BOARD_PX } from './types';

export type HighScore = { initials: string; score: number };

const STORAGE_KEY = 'super-snake.highscores';
export const TABLE_SIZE = 5;

const DEFAULT_TABLE: HighScore[] = [
  { initials: 'AAA', score: 25 },
  { initials: 'BBB', score: 20 },
  { initials: 'CCC', score: 15 },
  { initials: 'DDD', score: 10 },
  { initials: 'EEE', score: 5 },
];

function sanitize(table: unknown): HighScore[] {
  if (!Array.isArray(table)) return DEFAULT_TABLE.slice();
  const cleaned: HighScore[] = [];
  for (const row of table) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const initials =
      typeof r.initials === 'string' ? r.initials.toUpperCase().slice(0, 3) : 'AAA';
    const score = typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0;
    cleaned.push({ initials: initials.padEnd(3, 'A'), score });
  }
  cleaned.sort((a, b) => b.score - a.score);
  return cleaned.slice(0, TABLE_SIZE);
}

export function loadHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TABLE.slice();
    const parsed = JSON.parse(raw);
    const cleaned = sanitize(parsed);
    return cleaned.length > 0 ? cleaned : DEFAULT_TABLE.slice();
  } catch {
    return DEFAULT_TABLE.slice();
  }
}

export function saveHighScores(table: HighScore[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // localStorage unavailable / quota — silently ignore.
  }
}

export function qualifies(score: number, table: HighScore[]): boolean {
  if (score <= 0) return false;
  if (table.length < TABLE_SIZE) return true;
  return score > table[table.length - 1].score;
}

// Inserts new entry into the table, returns the updated table and the index
// (rank) of the new entry. The table is truncated to TABLE_SIZE.
export function insertScore(
  table: HighScore[],
  entry: HighScore,
): { table: HighScore[]; rank: number } {
  const next = table.slice();
  // Find insertion point: first index where existing.score < entry.score.
  // Ties keep the older entry above the new one.
  let idx = next.length;
  for (let i = 0; i < next.length; i++) {
    if (next[i].score < entry.score) {
      idx = i;
      break;
    }
  }
  next.splice(idx, 0, entry);
  next.length = Math.min(next.length, TABLE_SIZE);
  return { table: next, rank: idx };
}

// --- rendering ---

const HEADER_COLOR = '167, 243, 208';
const ROW_COLOR = '226, 232, 240';
const HIGHLIGHT_COLOR = '244, 114, 182';
const PROMPT_COLOR = '244, 114, 182';
const DIM_COLOR = '94, 234, 212';

const HEADER_PIXEL = 6;
const ROW_PIXEL = 5;
const ROW_GAP = ROW_PIXEL;
const ROW_STEP = 7 * ROW_PIXEL + 10; // 7 glyph rows + breathing room

function formatScore(score: number): string {
  return score.toString().padStart(4, '0');
}

function rowText(rank: number, initials: string, score: number): string {
  return `${rank}  ${initials}    ${formatScore(score)}`;
}

export type EntryEditState = {
  initials: string[];
  cursor: number; // 0..2
};

export function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  table: HighScore[],
  now: number,
  highlightRank: number | null,
  editState: EntryEditState | null,
): void {
  const w = BOARD_PX;
  const h = BOARD_PX;

  // Dim the gameplay layer underneath.
  ctx.fillStyle = 'rgba(8, 11, 16, 0.78)';
  ctx.fillRect(0, 0, w, h);

  // Header.
  const headerText = editState ? 'NEW HIGH SCORE' : 'HIGH SCORES';
  const headerW = textWidth(headerText, HEADER_PIXEL);
  const headerX = Math.round((w - headerW) / 2);
  const headerY = 90;

  // Glow pass.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const blur of [16, 8]) {
    ctx.shadowColor = `rgba(${DIM_COLOR}, 1)`;
    ctx.shadowBlur = blur;
    ctx.fillStyle = `rgba(${DIM_COLOR}, 0.18)`;
    drawText(ctx, headerText, headerX, headerY, HEADER_PIXEL);
  }
  ctx.restore();

  ctx.fillStyle = `rgba(${HEADER_COLOR}, 1)`;
  drawText(ctx, headerText, headerX, headerY, HEADER_PIXEL);

  // Rows.
  const rowsTop = headerY + 7 * HEADER_PIXEL + 60;
  const sampleRow = rowText(1, 'AAA', 0);
  const rowW = textWidth(sampleRow, ROW_PIXEL);
  const rowX = Math.round((w - rowW) / 2);

  for (let i = 0; i < table.length; i++) {
    const rank = i + 1;
    const entry = table[i];
    const isHighlight = highlightRank !== null && highlightRank === i;
    const isEditing = editState !== null && isHighlight;
    const initials = isEditing ? editState!.initials.join('') : entry.initials;
    const text = rowText(rank, initials, entry.score);
    const y = rowsTop + i * ROW_STEP;

    if (isHighlight) {
      // Pulsing highlight color (magenta).
      const pulse = 0.65 + 0.35 * Math.sin(now * 0.006);
      ctx.fillStyle = `rgba(${HIGHLIGHT_COLOR}, ${pulse})`;
    } else {
      ctx.fillStyle = `rgba(${ROW_COLOR}, 0.85)`;
    }
    drawText(ctx, text, rowX, y, ROW_PIXEL);

    if (isEditing) {
      // Underline blinking cursor under the active letter.
      const blinkOn = Math.floor(now / 350) % 2 === 0;
      if (blinkOn) {
        // Layout: "N  ABC    SSSS" — initials start at index 3.
        const initialsStart = 3;
        const charStep = 5 * ROW_PIXEL + ROW_GAP;
        const cursorChar = initialsStart + editState!.cursor;
        const cx = rowX + cursorChar * charStep;
        const cy = y + 7 * ROW_PIXEL + 3;
        ctx.fillStyle = `rgba(${HIGHLIGHT_COLOR}, 1)`;
        ctx.fillRect(cx, cy, 5 * ROW_PIXEL, ROW_PIXEL);
      }
    }
  }

  // Footer prompt.
  const blink = 0.5 + 0.5 * Math.sin((now / 900) * Math.PI * 2);
  const promptAlpha = 0.4 + 0.55 * blink;
  ctx.fillStyle = `rgba(${PROMPT_COLOR}, ${promptAlpha})`;
  ctx.font = '14px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const footerY = h - 70;
  if (editState) {
    ctx.fillText('ARROWS TO PICK LETTERS  -  ENTER TO CONFIRM', w / 2, footerY);
  } else {
    ctx.fillText('PRESS SPACE TO PLAY AGAIN', w / 2, footerY);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
}
