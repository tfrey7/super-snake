import { cheatEat, createInitialState, setNextDir, step } from './game';
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
  DIR_E,
  DIR_NE,
  DIR_NW,
  DIR_SE,
  DIR_SW,
  DIR_W,
  hexCenter,
  hexLayout,
  tickMsForLevel,
  type Dir,
  type GameState,
} from './types';

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

function startGame(now: number): void {
  unlockAudio();
  state = createInitialState();
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

// Pointy-top hex direction angles in canvas coords (y-down):
//   E=0°, SE=60°, SW=120°, W=180°, NW=240°, NE=300°.
// Bucket boundaries sit at 30° + 60°·k, so a swipe at angle θ maps to bucket
// floor((θ + 30) / 60) mod 6, and bucket → Dir uses this lookup.
const SWIPE_BUCKET_TO_DIR: Dir[] = [
  DIR_E,
  DIR_SE,
  DIR_SW,
  DIR_W,
  DIR_NW,
  DIR_NE,
];

function swipeToHexDir(dx: number, dy: number): Dir {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const norm = (deg + 360) % 360;
  const bucket = Math.floor((norm + 30) / 60) % 6;
  return SWIPE_BUCKET_TO_DIR[bucket];
}

window.addEventListener('keydown', (e) => {
  if (phase === 'title') {
    startGame(performance.now());
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
      startGame(performance.now());
      e.preventDefault();
    }
    return;
  }

  // Cheat: Shift+A bumps the score (and level) to fast-forward into later levels.
  if (phase === 'playing' && e.shiftKey && e.code === 'KeyA') {
    const prevLevel = state.level;
    cheatEat(state);
    setMusicLevel(state.level);
    playEat();
    if (state.level > prevLevel) {
      playLevelUp();
      if (state.level >= 3) {
        spawnLevelUpFireworks(BOARD_PX, levelFireworkColors(state.level));
      }
      levelUpStartedAt = performance.now();
      levelUpLevel = state.level;
    }
    e.preventDefault();
    return;
  }
});

const SWIPE_THRESHOLD_PX = 20;
let dragPointerId: number | null = null;
let dragAnchorX = 0;
let dragAnchorY = 0;
let dragSwipedThisGesture = false;

function handleSwipe(dx: number, dy: number): void {
  unlockAudio();

  if (phase === 'title') {
    startGame(performance.now());
    return;
  }

  if (phase === 'enter-initials' && editState) {
    // Initials use 4-direction quantization regardless of pointy-top angles.
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx > ady) {
      editState.cursor =
        dx > 0
          ? Math.min(2, editState.cursor + 1)
          : Math.max(0, editState.cursor - 1);
    } else {
      editState.initials[editState.cursor] = cycleLetter(
        editState.initials[editState.cursor],
        dy < 0 ? 1 : -1,
      );
    }
    return;
  }

  if (phase === 'leaderboard') {
    startGame(performance.now());
    return;
  }

  if (phase === 'death-pause') return;

  setNextDir(state, swipeToHexDir(dx, dy));
}

function applyTap(): void {
  unlockAudio();

  if (phase === 'title') {
    startGame(performance.now());
    return;
  }

  if (phase === 'enter-initials' && editState) {
    commitInitials();
    return;
  }

  if (phase === 'leaderboard') {
    startGame(performance.now());
    return;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (dragPointerId !== null) return;
  dragPointerId = e.pointerId;
  dragAnchorX = e.clientX;
  dragAnchorY = e.clientY;
  dragSwipedThisGesture = false;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragPointerId) return;
  const dx = e.clientX - dragAnchorX;
  const dy = e.clientY - dragAnchorY;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) {
    return;
  }
  handleSwipe(dx, dy);
  dragSwipedThisGesture = true;
  dragAnchorX = e.clientX;
  dragAnchorY = e.clientY;
  e.preventDefault();
});

function endDragGesture(e: PointerEvent, fireTap: boolean): void {
  if (e.pointerId !== dragPointerId) return;
  if (fireTap && !dragSwipedThisGesture) applyTap();
  dragPointerId = null;
  dragSwipedThisGesture = false;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  e.preventDefault();
}

canvas.addEventListener('pointerup', (e) => endDragGesture(e, true));
canvas.addEventListener('pointercancel', (e) => endDragGesture(e, false));

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
      const prevLayout = hexLayout(state.level);
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
          const { px, py } = hexCenter(foodX, foodY, prevLayout);
          spawnFireworks(
            px,
            py,
            levelFireworkColors(prevLevel),
            prevLayout.width / 24,
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
