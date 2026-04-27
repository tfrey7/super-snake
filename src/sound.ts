import { LEVELS, tickMsForLevel } from './types';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  getCtx();
  ensureMusic();
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  gain = 0.08,
  freqEnd?: number,
): void {
  const ac = getCtx();
  if (!ac) return;
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
  osc.connect(g).connect(ac.destination);
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

export function playLevelUp(): void {
  // Ascending A-minor arpeggio with an octave-stamp at the top.
  const notes: [number, number][] = [
    [440, 0], // A4
    [523.25, 60], // C5
    [659.25, 120], // E5
    [880, 180], // A5
  ];
  for (const [f, delay] of notes) {
    setTimeout(() => tone(f, 0.18, 'square', 0.1), delay);
  }
  setTimeout(() => {
    tone(1318.51, 0.32, 'triangle', 0.12); // E6 sparkle
    tone(880, 0.32, 'square', 0.08); // sustain A5 underneath
  }, 260);
}

// ---------- Music: layered chiptune scheduler ----------

type MusicLayer = {
  unlockLevel: number;
  baseGain: number;
  gain: GainNode;
  trigger: (
    step: number,
    bar: number,
    time: number,
    dest: AudioNode,
    stepDur: number,
  ) => boolean;
  lastFireAudioTime: number;
  lastFireStep: number;
};

const STEPS_PER_BAR = 16;
const BARS_PER_LOOP = 4;
const SCHED_INTERVAL_MS = 25;
const SCHED_LOOKAHEAD_S = 0.12;

// 4-bar progression in A natural minor / C major: Am - F - C - G.
// Each pattern is indexed [bar][step]; `null` = rest.
const BASS: (number | null)[][] = [
  // Am: A2, low E2, walk via G2
  [110, null, null, null, 110, null, null, null,
   82.41, null, null, null, 98, null, 110, null],
  // F: F2, low C2, walk via E2
  [87.31, null, null, null, 87.31, null, null, null,
   65.41, null, null, null, 82.41, null, 87.31, null],
  // C: C3, low G2, walk via A2
  [130.81, null, null, null, 130.81, null, null, null,
   98, null, null, null, 110, null, 130.81, null],
  // G: G2, low D2, walk via F2
  [98, null, null, null, 98, null, null, null,
   73.42, null, null, null, 87.31, null, 98, null],
];
const LEAD: (number | null)[][] = [
  // Am: A C E D | C B A E
  [440, null, 523.25, null, 659.25, null, 587.33, null,
   523.25, null, 493.88, null, 440, null, 329.63, null],
  // F: F A C B | A G F C
  [349.23, null, 440, null, 523.25, null, 493.88, null,
   440, null, 392, null, 349.23, null, 261.63, null],
  // C: C E G F | E D C G  (octave up — peak of the progression)
  [523.25, null, 659.25, null, 783.99, null, 698.46, null,
   659.25, null, 587.33, null, 523.25, null, 392, null],
  // G: G B D C | B A G D
  [392, null, 493.88, null, 587.33, null, 523.25, null,
   493.88, null, 440, null, 392, null, 293.66, null],
];
const HARMONY: (number | null)[][] = [
  // each line is a diatonic third above the corresponding LEAD bar
  [523.25, null, 659.25, null, 783.99, null, 698.46, null,
   659.25, null, 587.33, null, 523.25, null, 392, null],
  [440, null, 523.25, null, 659.25, null, 587.33, null,
   523.25, null, 493.88, null, 440, null, 329.63, null],
  [659.25, null, 783.99, null, 987.77, null, 880, null,
   783.99, null, 698.46, null, 659.25, null, 493.88, null],
  [493.88, null, 587.33, null, 698.46, null, 659.25, null,
   587.33, null, 523.25, null, 493.88, null, 349.23, null],
];
const ARP: number[][] = [
  // Am: A C E C, last note jumps an octave for sparkle
  [440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 523.25,
   440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 880],
  // F: F A C A
  [349.23, 440, 523.25, 440, 349.23, 440, 523.25, 440,
   349.23, 440, 523.25, 440, 349.23, 440, 523.25, 698.46],
  // C: C E G E
  [523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 783.99, 659.25,
   523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 783.99, 1046.5],
  // G: G B D B
  [392, 493.88, 587.33, 493.88, 392, 493.88, 587.33, 493.88,
   392, 493.88, 587.33, 493.88, 392, 493.88, 587.33, 783.99],
];
const CHORDS: number[][] = [
  [220, 261.63, 329.63], // Am: A3 C4 E4
  [174.61, 220, 261.63], // F:  F3 A3 C4
  [261.63, 329.63, 392], // C:  C4 E4 G4
  [196, 246.94, 293.66], // G:  G3 B3 D4
];

let musicMaster: GainNode | null = null;
let layers: MusicLayer[] = [];
let musicLevel = 0;
let musicActive = true;
let stepIndex = 0;
let barIndex = 0;
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
  return {
    unlockLevel,
    baseGain,
    gain,
    trigger,
    lastFireAudioTime: -Infinity,
    lastFireStep: -1,
  };
}

function buildLayers(ac: AudioContext, master: GainNode): MusicLayer[] {
  return [
    // L1 — heartbeat: lone low pulse on beats 1 and 3
    makeLayer(ac, master, 1, 0.22, (step, _bar, time, dest) => {
      if (step === 0) {
        playOsc(ac, dest, 110, time, 0.42, 'square', 0.55);
        return true;
      }
      if (step === 8) {
        playOsc(ac, dest, 110, time, 0.32, 'square', 0.4);
        return true;
      }
      return false;
    }),

    // L2 — bassline (follows the chord progression)
    makeLayer(ac, master, 2, 0.28, (step, bar, time, dest) => {
      const f = BASS[bar][step];
      if (!f) return false;
      playOsc(ac, dest, f, time, 0.17, 'square', 0.55, 0.003);
      return true;
    }),

    // L3 — kick: 4-on-the-floor
    makeLayer(ac, master, 3, 0.55, (step, _bar, time, dest) => {
      if (step % 4 !== 0) return false;
      playKick(ac, dest, time);
      return true;
    }),

    // L4 — lead melody (triangle), transposed per chord
    makeLayer(ac, master, 4, 0.18, (step, bar, time, dest) => {
      const f = LEAD[bar][step];
      if (!f) return false;
      playOsc(ac, dest, f, time, 0.18, 'triangle', 0.65, 0.005);
      return true;
    }),

    // L5 — hi-hat: 8th notes
    makeLayer(ac, master, 5, 0.18, (step, _bar, time, dest) => {
      if (step % 2 !== 0) return false;
      playHat(ac, dest, time, false);
      return true;
    }),

    // L6 — arpeggio counter, fills the lead's rests with chord tones
    makeLayer(ac, master, 6, 0.13, (step, bar, time, dest) => {
      if (step % 2 !== 1) return false;
      playOsc(ac, dest, ARP[bar][step], time, 0.08, 'square', 0.45, 0.002);
      return true;
    }),

    // L7 — snare on beats 2 and 4, plus a fill on the last bar of the loop
    makeLayer(ac, master, 7, 0.32, (step, bar, time, dest) => {
      if (step === 4 || step === 12) {
        playSnare(ac, dest, time);
        return true;
      }
      // Telegraph the loop reset with two extra hits at the end of bar 3.
      if (bar === BARS_PER_LOOP - 1 && (step === 14 || step === 15)) {
        playSnare(ac, dest, time);
        return true;
      }
      return false;
    }),

    // L8 — chord pad: refreshed each bar with the current progression chord
    makeLayer(ac, master, 8, 0.1, (step, bar, time, dest, stepDur) => {
      if (step !== 0) return false;
      const dur = stepDur * STEPS_PER_BAR;
      for (const f of CHORDS[bar]) playPad(ac, dest, f, time, dur);
      return true;
    }),

    // L9 — harmony layer doubling the lead a third above
    makeLayer(ac, master, 9, 0.12, (step, bar, time, dest) => {
      const f = HARMONY[bar][step];
      if (!f) return false;
      playOsc(ac, dest, f, time, 0.18, 'triangle', 0.5, 0.005);
      return true;
    }),

    // L10 — flourish: octave-up arp and an open hat on the and-of-4
    makeLayer(ac, master, 10, 0.2, (step, bar, time, dest) => {
      playOsc(ac, dest, ARP[bar][step] * 2, time, 0.05, 'triangle', 0.22, 0.002);
      if (step === 14) playHat(ac, dest, time, true);
      return true;
    }),
  ];
}

function ensureMusic(): void {
  const ac = getCtx();
  if (!ac || musicMaster) return;
  musicMaster = ac.createGain();
  musicMaster.gain.value = 0;
  musicMaster.connect(ac.destination);
  layers = buildLayers(ac, musicMaster);
  for (const layer of layers) {
    layer.gain.gain.value = musicLevel >= layer.unlockLevel ? layer.baseGain : 0;
  }
  nextStepTime = ac.currentTime + 0.1;
  stepIndex = 0;
  barIndex = 0;
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
        const fired = layer.trigger(stepIndex, barIndex, nextStepTime, layer.gain, stepDur);
        if (fired && musicActive) {
          layer.lastFireAudioTime = nextStepTime;
          layer.lastFireStep = stepIndex;
        }
      }
    }
    nextStepTime += stepDur;
    stepIndex++;
    if (stepIndex >= STEPS_PER_BAR) {
      stepIndex = 0;
      barIndex = (barIndex + 1) % BARS_PER_LOOP;
    }
  }
}

export type BeatState = {
  layerFireMs: number[];
  layerFireSteps: number[];
  unlockLevels: number[];
  musicLevel: number;
  stepDurMs: number;
};

export function getBeatState(): BeatState | null {
  const ac = ctx;
  if (!ac || !layers.length) return null;
  const offsetMs = performance.now() - ac.currentTime * 1000;
  return {
    layerFireMs: layers.map((l) =>
      Number.isFinite(l.lastFireAudioTime) ? l.lastFireAudioTime * 1000 + offsetMs : -Infinity,
    ),
    layerFireSteps: layers.map((l) => l.lastFireStep),
    unlockLevels: layers.map((l) => l.unlockLevel),
    musicLevel,
    stepDurMs: stepDurForLevel(musicLevel) * 1000,
  };
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
  musicActive = active;
  const ac = ctx;
  if (!ac || !musicMaster) return;
  musicMaster.gain.cancelScheduledValues(ac.currentTime);
  musicMaster.gain.setValueAtTime(musicMaster.gain.value, ac.currentTime);
  musicMaster.gain.linearRampToValueAtTime(active ? 0.55 : 0, ac.currentTime + 0.3);
}
