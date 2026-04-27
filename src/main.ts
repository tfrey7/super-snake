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
  updateParticles,
} from './particles';
import { draw, drawBeatBorder } from './render';
import {
  getBeatState,
  playDeath,
  playEat,
  setMusicActive,
  setMusicLevel,
  unlockAudio,
} from './sound';
import { drawTitle } from './title';
import { cellPx, tickMsForLevel, type Dir, type GameState } from './types';

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

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#game not found');
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
        spawnFireworks(
          foodX * prevCell + prevCell / 2,
          foodY * prevCell + prevCell / 2,
          prevCell / 24,
        );
      }
    }
  } else {
    // Drain accumulator while dead so we don't burst-step on restart.
    acc = 0;
  }

  updateParticles(dt);
  draw(ctx, state, now);
  drawParticles(ctx);
  drawBeatBorder(ctx, getBeatState(), now);

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
