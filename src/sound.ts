import { LEVELS, tickMsForLevel } from './types';

let ctx: AudioContext | null = null;
let muted = false;
let muteGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    muteGain = ctx.createGain();
    muteGain.gain.value = muted ? 0 : 1;
    muteGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  getCtx();
  ensureMusic();
}

export function setMuted(value: boolean): void {
  muted = value;
  const ac = ctx;
  if (!ac || !muteGain) return;
  muteGain.gain.cancelScheduledValues(ac.currentTime);
  muteGain.gain.linearRampToValueAtTime(value ? 0 : 1, ac.currentTime + 0.05);
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  gain = 0.08,
  freqEnd?: number,
): void {
  const ac = getCtx();
  if (!ac || !muteGain) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(freqEnd, 1),
      ac.currentTime + duration,
    );
  }
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g).connect(muteGain);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export function playEat(): void {
  tone(660, 0.08, 'square', 0.08);
  setTimeout(() => tone(990, 0.08, 'square', 0.07), 60);
}

export function playDeath(): void {
  tone(220, 0.45, 'sawtooth', 0.1, 55);
}

// ---------- Music: layered chiptune scheduler ----------

type MusicLayer = {
  unlockLevel: number;
  baseGain: number;
  gain: GainNode;
  trigger: (step: number, time: number, dest: AudioNode, stepDur: number) => void;
};

const STEPS_PER_BAR = 16;
const SCHED_INTERVAL_MS = 25;
const SCHED_LOOKAHEAD_S = 0.12;

// A natural minor patterns. `null` = rest.
const BASS: (number | null)[] = [
  110, null, null, null, 110, null, null, null,
  82.41, null, null, null, 98, null, 110, null,
];
const LEAD: (number | null)[] = [
  440, null, 523.25, null, 659.25, null, 587.33, null,
  523.25, null, 493.88, null, 440, null, 329.63, null,
];
const HARMONY: (number | null)[] = [
  // a third above the lead
  523.25, null, 659.25, null, 783.99, null, 698.46, null,
  659.25, null, 587.33, null, 523.25, null, 392, null,
];
const ARP: number[] = [
  440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 523.25,
  392, 493.88, 587.33, 493.88, 440, 523.25, 659.25, 523.25,
];
const CHORD = [220, 261.63, 329.63]; // A3 C4 E4

let musicMaster: GainNode | null = null;
let layers: MusicLayer[] = [];
let musicLevel = 0;
let stepIndex = 0;
let nextStepTime = 0;
let schedulerTimer: number | null = null;

// Tempo: derived from game tickMs so beat keeps pace with the snake.
// One 16th-note step = 2 game ticks, clamped to a musical range.
function stepDurForLevel(level: number): number {
  const raw = (tickMsForLevel(level) * 2) / 1000;
  return Math.max(0.09, Math.min(0.22, raw));
}

function playOsc(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  time: number,
  duration: number,
  type: OscillatorType,
  peakGain: number,
  attack = 0.005,
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peakGain, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

function playKick(ac: AudioContext, dest: AudioNode, time: number): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  g.gain.setValueAtTime(0.9, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playNoise(
  ac: AudioContext,
  dest: AudioNode,
  time: number,
  duration: number,
  peakGain: number,
  filterFreq: number,
): void {
  const len = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.setValueAtTime(peakGain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  src.connect(filter).connect(g).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.02);
}

function playSnare(ac: AudioContext, dest: AudioNode, time: number): void {
  playNoise(ac, dest, time, 0.13, 0.55, 1500);
  playOsc(ac, dest, 200, time, 0.08, 'triangle', 0.3, 0.002);
}

function playHat(ac: AudioContext, dest: AudioNode, time: number, open: boolean): void {
  playNoise(ac, dest, time, open ? 0.16 : 0.035, open ? 0.35 : 0.4, 7000);
}

function playPad(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  time: number,
  duration: number,
): void {
  const o1 = ac.createOscillator();
  const o2 = ac.createOscillator();
  const g = ac.createGain();
  o1.type = 'square';
  o2.type = 'square';
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.005;
  const peak = 0.16;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.08);
  g.gain.setValueAtTime(peak, Math.max(time + 0.08, time + duration - 0.12));
  g.gain.linearRampToValueAtTime(0.0001, time + duration);
  o1.connect(g);
  o2.connect(g);
  g.connect(dest);
  o1.start(time);
  o2.start(time);
  o1.stop(time + duration + 0.05);
  o2.stop(time + duration + 0.05);
}

function makeLayer(
  ac: AudioContext,
  master: GainNode,
  unlockLevel: number,
  baseGain: number,
  trigger: MusicLayer['trigger'],
): MusicLayer {
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.connect(master);
  return { unlockLevel, baseGain, gain, trigger };
}

function buildLayers(ac: AudioContext, master: GainNode): MusicLayer[] {
  return [
    // L0 — heartbeat: lone low pulse on beats 1 and 3
    makeLayer(ac, master, 0, 0.22, (step, time, dest) => {
      if (step === 0) playOsc(ac, dest, 110, time, 0.42, 'square', 0.55);
      else if (step === 8) playOsc(ac, dest, 110, time, 0.32, 'square', 0.4);
    }),

    // L1 — bassline
    makeLayer(ac, master, 1, 0.28, (step, time, dest) => {
      const f = BASS[step];
      if (f) playOsc(ac, dest, f, time, 0.17, 'square', 0.55, 0.003);
    }),

    // L2 — kick: 4-on-the-floor
    makeLayer(ac, master, 2, 0.55, (step, time, dest) => {
      if (step % 4 === 0) playKick(ac, dest, time);
    }),

    // L3 — lead melody (triangle)
    makeLayer(ac, master, 3, 0.18, (step, time, dest) => {
      const f = LEAD[step];
      if (f) playOsc(ac, dest, f, time, 0.18, 'triangle', 0.65, 0.005);
    }),

    // L4 — hi-hat: 8th notes
    makeLayer(ac, master, 4, 0.18, (step, time, dest) => {
      if (step % 2 === 0) playHat(ac, dest, time, false);
    }),

    // L5 — arpeggio counter, fills the lead's rests
    makeLayer(ac, master, 5, 0.13, (step, time, dest) => {
      if (step % 2 === 1) playOsc(ac, dest, ARP[step], time, 0.08, 'square', 0.45, 0.002);
    }),

    // L6 — snare on beats 2 and 4
    makeLayer(ac, master, 6, 0.32, (step, time, dest) => {
      if (step === 4 || step === 12) playSnare(ac, dest, time);
    }),

    // L7 — chord pad: sustained A-minor triad, refreshed each bar
    makeLayer(ac, master, 7, 0.1, (step, time, dest, stepDur) => {
      if (step === 0) {
        const dur = stepDur * STEPS_PER_BAR;
        for (const f of CHORD) playPad(ac, dest, f, time, dur);
      }
    }),

    // L8 — harmony layer doubling the lead a third above
    makeLayer(ac, master, 8, 0.12, (step, time, dest) => {
      const f = HARMONY[step];
      if (f) playOsc(ac, dest, f, time, 0.18, 'triangle', 0.5, 0.005);
    }),

    // L9 — flourish: octave-up arp and an open hat on the and-of-4
    makeLayer(ac, master, 9, 0.2, (step, time, dest) => {
      playOsc(ac, dest, ARP[step] * 2, time, 0.05, 'triangle', 0.22, 0.002);
      if (step === 14) playHat(ac, dest, time, true);
    }),
  ];
}

function ensureMusic(): void {
  const ac = getCtx();
  if (!ac || !muteGain || musicMaster) return;
  musicMaster = ac.createGain();
  musicMaster.gain.value = 0;
  musicMaster.connect(muteGain);
  layers = buildLayers(ac, musicMaster);
  for (const layer of layers) {
    layer.gain.gain.value = musicLevel >= layer.unlockLevel ? layer.baseGain : 0;
  }
  nextStepTime = ac.currentTime + 0.1;
  stepIndex = 0;
  if (schedulerTimer === null) {
    schedulerTimer = window.setInterval(scheduleAhead, SCHED_INTERVAL_MS);
  }
  // Fade master in once everything is wired.
  musicMaster.gain.setValueAtTime(0, ac.currentTime);
  musicMaster.gain.linearRampToValueAtTime(0.55, ac.currentTime + 0.4);
}

function scheduleAhead(): void {
  const ac = ctx;
  if (!ac || !musicMaster) return;
  const now = ac.currentTime;
  // If the tab was inactive and we drifted, jump forward instead of flooding.
  if (nextStepTime < now - 0.2) nextStepTime = now + 0.05;
  const horizon = now + SCHED_LOOKAHEAD_S;
  const stepDur = stepDurForLevel(musicLevel);
  while (nextStepTime < horizon) {
    for (const layer of layers) {
      if (musicLevel >= layer.unlockLevel) {
        layer.trigger(stepIndex, nextStepTime, layer.gain, stepDur);
      }
    }
    nextStepTime += stepDur;
    stepIndex = (stepIndex + 1) % STEPS_PER_BAR;
  }
}

export function setMusicLevel(level: number): void {
  const clamped = Math.max(0, Math.min(level, LEVELS - 1));
  if (clamped === musicLevel) return;
  musicLevel = clamped;
  const ac = ctx;
  if (!ac || !layers.length) return;
  for (const layer of layers) {
    const target = clamped >= layer.unlockLevel ? layer.baseGain : 0;
    layer.gain.gain.cancelScheduledValues(ac.currentTime);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, ac.currentTime);
    layer.gain.gain.linearRampToValueAtTime(target, ac.currentTime + 0.4);
  }
}

export function setMusicActive(active: boolean): void {
  const ac = ctx;
  if (!ac || !musicMaster) return;
  musicMaster.gain.cancelScheduledValues(ac.currentTime);
  musicMaster.gain.setValueAtTime(musicMaster.gain.value, ac.currentTime);
  musicMaster.gain.linearRampToValueAtTime(active ? 0.55 : 0, ac.currentTime + 0.3);
}
