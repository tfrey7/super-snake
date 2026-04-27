import { createInitialState, setNextDir, step } from './game';
import {
  clearParticles,
  drawParticles,
  spawnFireworks,
  updateParticles,
} from './particles';
import { draw } from './render';
import { isMuted, playDeath, playEat, setMuted, unlockAudio } from './sound';
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

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#game not found');
const ctx2d = canvas.getContext('2d');
if (!ctx2d) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctx2d;

let state: GameState = createInitialState();
draw(ctx, state, performance.now());

window.addEventListener('keydown', (e) => {
  unlockAudio();
  const dir = KEY_DIRS[e.code];
  if (dir) {
    setNextDir(state, dir);
    e.preventDefault();
    return;
  }
  if (e.code === 'Space' && state.dead) {
    state = createInitialState();
    clearParticles();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyM') {
    setMuted(!isMuted());
    e.preventDefault();
  }
});

let lastTime = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = now - lastTime;
  lastTime = now;
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
    if (!prevDead && state.dead) playDeath();
    else if (state.score > prevScore) {
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
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
