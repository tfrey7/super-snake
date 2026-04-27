import { createInitialState, setNextDir, step } from './game';
import {
  drawLeaderboard,
  insertScore,
  loadHighScores,
  qualifies,
  saveHighScores,
  type EntryEditState,
  type HighScore,
} from './highscores';
import {
  clearParticles,
  drawParticles,
  spawnFireworks,
  spawnLevelUpFireworks,
  updateParticles,
} from './particles';
import {
  draw,
  drawBeatBorder,
  drawLevelUpOverlay,
  levelFireworkColors,
} from './render';
import {
  getBeatState,
  playDeath,
  playEat,
  playLevelUp,
  setMusicActive,
  setMusicLevel,
  unlockAudio,
} from './sound';
import { drawTitle } from './title';
import {
  BOARD_PX,
  cellPx,
  tickMsForLevel,
  type Dir,
  type GameState,
} from './types';

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

const TITLE_FADE_MS = 700;
const DEATH_PAUSE_MS = 1400;

const canvasEl = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('canvas#game not found');
const canvas: HTMLCanvasElement = canvasEl;
const ctx2d = canvas.getContext('2d');
if (!ctx2d) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctx2d;

type Phase =
  | 'title'
  | 'transitioning'
  | 'playing'
  | 'death-pause'
  | 'enter-initials'
  | 'leaderboard';

let phase: Phase = 'title';
let transitionStart = 0;
let deathPauseUntil = 0;
let highScores: HighScore[] = loadHighScores();
let editState: EntryEditState | null = null;
let highlightRank: number | null = null;
let levelUpStartedAt = -Infinity;
let levelUpLevel = 0;

let state: GameState = createInitialState();

function startGame(initialDir: Dir | null, now: number): void {
  unlockAudio();
  state = createInitialState();
  if (initialDir) setNextDir(state, initialDir);
  clearParticles();
  setMusicLevel(state.level);
  setMusicActive(true);
  highlightRank = null;
  editState = null;
  levelUpStartedAt = -Infinity;
  phase = 'transitioning';
  transitionStart = now;
}

function commitInitials(): void {
  if (!editState) return;
  const initials = editState.initials.join('');
  const result = insertScore(highScores, { initials, score: state.score });
  highScores = result.table;
  highlightRank = result.rank;
  saveHighScores(highScores);
  editState = null;
  phase = 'leaderboard';
}

function cycleLetter(ch: string, delta: number): string {
  const A = 'A'.charCodeAt(0);
  const idx = (ch.charCodeAt(0) - A + delta + 26) % 26;
  return String.fromCharCode(A + idx);
}

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.code] ?? null;

  if (phase === 'title') {
    // Any key begins the game; movement keys also seed the starting direction.
    startGame(dir, performance.now());
    e.preventDefault();
    return;
  }

  if (phase === 'enter-initials' && editState) {
    if (e.code === 'ArrowUp') {
      editState.initials[editState.cursor] = cycleLetter(
        editState.initials[editState.cursor],
        1,
      );
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowDown') {
      editState.initials[editState.cursor] = cycleLetter(
        editState.initials[editState.cursor],
        -1,
      );
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowLeft') {
      editState.cursor = Math.max(0, editState.cursor - 1);
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowRight') {
      editState.cursor = Math.min(2, editState.cursor + 1);
      e.preventDefault();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      commitInitials();
      e.preventDefault();
      return;
    }
    // Letter key shortcut: type A-Z to set the current slot and advance.
    if (e.key.length === 1) {
      const ch = e.key.toUpperCase();
      if (ch >= 'A' && ch <= 'Z') {
        editState.initials[editState.cursor] = ch;
        if (editState.cursor < 2) editState.cursor++;
        e.preventDefault();
        return;
      }
    }
    return;
  }

  if (phase === 'leaderboard') {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      unlockAudio();
      startGame(null, performance.now());
      e.preventDefault();
    }
    return;
  }

  if (phase === 'death-pause') {
    // Ignore input until the pause resolves.
    return;
  }

  if (dir) {
    unlockAudio();
    setNextDir(state, dir);
    e.preventDefault();
    return;
  }
});

const SWIPE_THRESHOLD_PX = 20;
let touchPointerId: number | null = null;
let touchAnchorX = 0;
let touchAnchorY = 0;
let touchSwipedThisGesture = false;

function applySwipe(dir: Dir): void {
  unlockAudio();

  if (phase === 'title') {
    startGame(dir, performance.now());
    return;
  }

  if (phase === 'enter-initials' && editState) {
    if (dir.y === -1) {
      editState.initials[editState.cursor] = cycleLetter(
        editState.initials[editState.cursor],
        1,
      );
    } else if (dir.y === 1) {
      editState.initials[editState.cursor] = cycleLetter(
        editState.initials[editState.cursor],
        -1,
      );
    } else if (dir.x === -1) {
      editState.cursor = Math.max(0, editState.cursor - 1);
    } else if (dir.x === 1) {
      editState.cursor = Math.min(2, editState.cursor + 1);
    }
    return;
  }

  if (phase === 'leaderboard') {
    startGame(null, performance.now());
    return;
  }

  if (phase === 'death-pause') return;

  setNextDir(state, dir);
}

function applyTap(): void {
  unlockAudio();

  if (phase === 'title') {
    startGame(null, performance.now());
    return;
  }

  if (phase === 'enter-initials' && editState) {
    commitInitials();
    return;
  }

  if (phase === 'leaderboard') {
    startGame(null, performance.now());
    return;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  if (touchPointerId !== null) return;
  touchPointerId = e.pointerId;
  touchAnchorX = e.clientX;
  touchAnchorY = e.clientY;
  touchSwipedThisGesture = false;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch' || e.pointerId !== touchPointerId) return;
  const dx = e.clientX - touchAnchorX;
  const dy = e.clientY - touchAnchorY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < SWIPE_THRESHOLD_PX && ady < SWIPE_THRESHOLD_PX) return;
  const dir: Dir =
    adx > ady
      ? { x: dx > 0 ? 1 : -1, y: 0 }
      : { x: 0, y: dy > 0 ? 1 : -1 };
  applySwipe(dir);
  touchSwipedThisGesture = true;
  touchAnchorX = e.clientX;
  touchAnchorY = e.clientY;
  e.preventDefault();
});

function endTouchGesture(e: PointerEvent, fireTap: boolean): void {
  if (e.pointerType !== 'touch' || e.pointerId !== touchPointerId) return;
  if (fireTap && !touchSwipedThisGesture) applyTap();
  touchPointerId = null;
  touchSwipedThisGesture = false;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  e.preventDefault();
}

canvas.addEventListener('pointerup', (e) => endTouchGesture(e, true));
canvas.addEventListener('pointercancel', (e) => endTouchGesture(e, false));

let lastTime = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = now - lastTime;
  lastTime = now;

  if (phase === 'title') {
    drawTitle(ctx, now, 1);
    requestAnimationFrame(frame);
    return;
  }

  if (state.transition) {
    state.transition.elapsedMs += dt;
    if (state.transition.elapsedMs >= state.transition.durationMs) {
      state.transition = null;
    }
  }

  // Only step gameplay while alive.
  if (!state.dead) {
    acc += dt;
    while (acc >= tickMsForLevel(state.level)) {
      acc -= tickMsForLevel(state.level);
      const prevScore = state.score;
      const prevDead = state.dead;
      const prevLevel = state.level;
      const prevCell = cellPx(state.level);
      const foodX = state.food.x;
      const foodY = state.food.y;
      step(state);
      setMusicLevel(state.level);
      if (!prevDead && state.dead) {
        playDeath();
        setMusicActive(false);
        phase = 'death-pause';
        deathPauseUntil = now + DEATH_PAUSE_MS;
      } else if (state.score > prevScore) {
        playEat();
        if (prevLevel >= 3) {
          spawnFireworks(
            foodX * prevCell + prevCell / 2,
            foodY * prevCell + prevCell / 2,
            levelFireworkColors(prevLevel),
            prevCell / 24,
          );
        }
      }
      if (state.level > prevLevel) {
        playLevelUp();
        if (state.level >= 3) {
          spawnLevelUpFireworks(BOARD_PX, levelFireworkColors(state.level));
        }
        levelUpStartedAt = now;
        levelUpLevel = state.level;
      }
    }
  } else {
    // Drain accumulator while dead so we don't burst-step on restart.
    acc = 0;
  }

  updateParticles(dt);
  draw(ctx, state, now);
  drawParticles(ctx);
  if (state.level >= 2) drawBeatBorder(ctx, getBeatState(), now);
  drawLevelUpOverlay(ctx, levelUpLevel, levelUpStartedAt, now);

  if (phase === 'death-pause' && now >= deathPauseUntil) {
    if (qualifies(state.score, highScores)) {
      editState = { initials: ['A', 'A', 'A'], cursor: 0 };
      // Compute provisional rank for highlight (where the new entry will land).
      const provisional = insertScore(highScores, {
        initials: '...',
        score: state.score,
      });
      highlightRank = provisional.rank;
      phase = 'enter-initials';
    } else {
      highlightRank = null;
      phase = 'leaderboard';
    }
  }

  if (phase === 'enter-initials' || phase === 'leaderboard') {
    const tableForDisplay =
      phase === 'enter-initials' && editState && highlightRank !== null
        ? insertScore(highScores, {
            initials: editState.initials.join(''),
            score: state.score,
          }).table
        : highScores;
    drawLeaderboard(ctx, tableForDisplay, now, highlightRank, editState);
  }

  if (phase === 'transitioning') {
    const t = Math.min((now - transitionStart) / TITLE_FADE_MS, 1);
    drawTitle(ctx, now, 1 - t);
    if (t >= 1) phase = 'playing';
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
