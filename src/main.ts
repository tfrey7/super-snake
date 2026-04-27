import { createInitialState, setNextDir, step } from './game';
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

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#game not found');
const ctx2d = canvas.getContext('2d');
if (!ctx2d) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctx2d;

type Phase = 'title' | 'transitioning' | 'playing';
let phase: Phase = 'title';
let transitionStart = 0;

let state: GameState = createInitialState();

function startGame(initialDir: Dir | null, now: number): void {
  unlockAudio();
  state = createInitialState();
  if (initialDir) setNextDir(state, initialDir);
  clearParticles();
  setMusicLevel(state.level);
  setMusicActive(true);
  phase = 'transitioning';
  transitionStart = now;
}

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.code] ?? null;

  if (phase === 'title') {
    // Any key begins the game; movement keys also seed the starting direction.
    startGame(dir, performance.now());
    e.preventDefault();
    return;
  }

  if (dir) {
    unlockAudio();
    setNextDir(state, dir);
    e.preventDefault();
    return;
  }
  if (e.code === 'Space' && state.dead) {
    unlockAudio();
    state = createInitialState();
    clearParticles();
    setMusicLevel(state.level);
    setMusicActive(true);
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
    } else if (state.score > prevScore) {
      playEat();
      spawnFireworks(
        foodX * prevCell + prevCell / 2,
        foodY * prevCell + prevCell / 2,
        prevCell / 24,
      );
    }
  }
  updateParticles(dt);
  draw(ctx, state, now);
  drawParticles(ctx);
  drawBeatBorder(ctx, getBeatState(), now);

  if (phase === 'transitioning') {
    const t = Math.min((now - transitionStart) / TITLE_FADE_MS, 1);
    drawTitle(ctx, now, 1 - t);
    if (t >= 1) phase = 'playing';
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
