export type Cell = { x: number; y: number };

// 4-cardinal directions, indexed clockwise from north.
export type Dir = 0 | 1 | 2 | 3;
export const DIR_N: Dir = 0;
export const DIR_E: Dir = 1;
export const DIR_S: Dir = 2;
export const DIR_W: Dir = 3;

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [+1, 0], // E
  [0, +1], // S
  [-1, 0], // W
];

export function neighborOf(cell: Cell, dir: Dir): Cell {
  const [dx, dy] = NEIGHBORS[dir];
  return { x: cell.x + dx, y: cell.y + dy };
}

export function oppositeDir(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

export type Transition = {
  fromLevel: number;
  toLevel: number;
  elapsedMs: number;
  durationMs: number;
};

export type GameState = {
  snake: Cell[];
  dir: Dir;
  nextDir: Dir;
  food: Cell[];
  score: number;
  dead: boolean;
  level: number;
  transition: Transition | null;
};

export const BOARD_PX = 720;
export const LEVELS = 11;
export const INITIAL_LENGTH = 3;
export const TRANSITION_MS = 600;

// Level 0 is a tiny, fixed-layout tutorial. Levels 1..LEVELS-1 follow the ramp.
const TUTORIAL_COLS = 10;
const TUTORIAL_TICK_MS = 240;
const TUTORIAL_APPLES = 3;
const COLS_BASE = 15;
const COLS_STEP = 3;
const TICK_MS_BASE = 180;
const TICK_MS_FINAL = 50;
const APPLES_BASE = 2;
const APPLES_STEP = 1;

function clampLevel(level: number): number {
  return Math.max(0, Math.min(level, LEVELS - 1));
}

export function applesToAdvanceFrom(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_APPLES;
  return APPLES_BASE + APPLES_STEP * (n - 1);
}

export function scoreToReachLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return 0;
  const k = n - 1;
  return TUTORIAL_APPLES + APPLES_BASE * k + (APPLES_STEP * k * (k - 1)) / 2;
}

export function levelForScore(score: number): number {
  let lvl = 0;
  for (let n = 1; n < LEVELS; n++) {
    if (scoreToReachLevel(n) <= score) lvl = n;
    else break;
  }
  return lvl;
}

export function colsForLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_COLS;
  return COLS_BASE + COLS_STEP * (n - 1);
}

export function tickMsForLevel(level: number): number {
  const n = clampLevel(level);
  if (n === 0) return TUTORIAL_TICK_MS;
  const t = (n - 1) / (LEVELS - 2);
  return TICK_MS_BASE * Math.pow(TICK_MS_FINAL / TICK_MS_BASE, t);
}

// Generalized 2D-basis projection. A grid cell (x, y) projects to
//   sx = originX + x*ax + y*bx
//   sy = originY + x*ay + y*by
// The (ax, ay) and (bx, by) basis vectors fully describe rotation, shear,
// non-uniform scale, and aspect squash. Two named knobs drive them:
//   rotation — angle the unit grid is rotated by before squashing.
//   aspect   — screen-y squash (1 = top-down square; <1 = isometric squat).
// Step is solved per-level so the grid bounding box always fills BOARD_PX
// horizontally regardless of rotation, so the board doesn't change size as
// the angle shifts.
export type BoardLayout = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  originX: number;
  originY: number;
  step: number;
  // Screen-space bounding box of one tile. Useful for sizing things scaled to
  // a tile (block lift, firework radius, etc.) without re-deriving from basis.
  tileBoundsW: number;
  tileBoundsH: number;
  // Four corner offsets relative to a tile center, in screen pixels, in CCW
  // order starting from grid (-x, -y). Precomputed so tile drawing doesn't
  // re-project the same constants per tile per frame.
  tileCorners: ReadonlyArray<readonly [number, number]>;
};

// Projection per level. Depth controls block extrusion strength (0..1) and
// lives here too so rotation/aspect/depth ramp together as one move.
export type LevelProjection = {
  rotation: number;
  aspect: number;
  depth: number;
};

const PROJ_FLAT: LevelProjection = { rotation: 0, aspect: 1, depth: 0 };
const PROJ_ISO_FLAT: LevelProjection = {
  rotation: Math.PI / 4,
  aspect: 0.7,
  depth: 0,
};
const PROJ_ISO: LevelProjection = {
  rotation: Math.PI / 4,
  aspect: 0.7,
  depth: 1,
};

// Phased reveal: levels 0–2 read as classic top-down snake. Level 3 tilts the
// board into iso (still no extrusion). Level 4 adds the height — splitting
// the iso reveal across two level-ups keeps each surprise distinct rather
// than throwing both visual changes at the player at once.
export function projectionForLevel(level: number): LevelProjection {
  const n = clampLevel(level);
  if (n >= 4) return PROJ_ISO;
  if (n === 3) return PROJ_ISO_FLAT;
  return PROJ_FLAT;
}

// During a level-up where rotation changes, lengthen the transition window
// so the tilt is given room to read instead of flicking by in 600ms.
export const REVEAL_TRANSITION_MS = 1500;

export function transitionDurationFor(
  fromLevel: number,
  toLevel: number,
): number {
  const from = projectionForLevel(fromLevel);
  const to = projectionForLevel(toLevel);
  return from.rotation !== to.rotation ? REVEAL_TRANSITION_MS : TRANSITION_MS;
}

// Peak slowdown multiplier applied to the tick interval at the midpoint of
// the transition. A peak of 2.6 means the snake moves at ~38% of its normal
// speed at the apex of the iso reveal, then ramps back up. Returns 1 (no
// slowdown) for transitions that don't visibly tilt the board.
export function transitionTickPeak(
  fromLevel: number,
  toLevel: number,
): number {
  const from = projectionForLevel(fromLevel);
  const to = projectionForLevel(toLevel);
  return from.rotation !== to.rotation ? 2.6 : 1;
}

// Build a layout from raw basis vectors centered on a cols×cols grid. Used
// directly during a level transition — we lerp the basis vectors between the
// from-layout and to-layout and rebuild around the integer toCols.
export function buildBoardLayout(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cols: number,
  step: number,
): BoardLayout {
  const half = (cols - 1) / 2;
  const originX = BOARD_PX / 2 - half * (ax + bx);
  const originY = BOARD_PX / 2 - half * (ay + by);
  const tileBoundsW = Math.abs(ax) + Math.abs(bx);
  const tileBoundsH = Math.abs(ay) + Math.abs(by);
  const tileCorners: ReadonlyArray<readonly [number, number]> = [
    [-0.5 * ax - 0.5 * bx, -0.5 * ay - 0.5 * by],
    [+0.5 * ax - 0.5 * bx, +0.5 * ay - 0.5 * by],
    [+0.5 * ax + 0.5 * bx, +0.5 * ay + 0.5 * by],
    [-0.5 * ax + 0.5 * bx, -0.5 * ay + 0.5 * by],
  ];
  return {
    ax,
    ay,
    bx,
    by,
    originX,
    originY,
    step,
    tileBoundsW,
    tileBoundsH,
    tileCorners,
  };
}

export function boardLayoutFor(
  cols: number,
  projection: LevelProjection,
): BoardLayout {
  const c = Math.cos(projection.rotation);
  const s = Math.sin(projection.rotation);
  // Solve step so the tile bounding-box widths sum to BOARD_PX. tileBoundsW
  // = step * (|cos| + |sin|), so step shrinks at 45° to keep the diamond from
  // overflowing the canvas.
  const step = BOARD_PX / (cols * (Math.abs(c) + Math.abs(s)));
  const ax = step * c;
  const ay = step * s * projection.aspect;
  const bx = -step * s;
  const by = step * c * projection.aspect;
  return buildBoardLayout(ax, ay, bx, by, cols, step);
}

export function boardLayout(level: number): BoardLayout {
  return boardLayoutFor(colsForLevel(level), projectionForLevel(level));
}

export function gridToScreen(
  x: number,
  y: number,
  layout: BoardLayout,
): { px: number; py: number } {
  return {
    px: layout.originX + x * layout.ax + y * layout.bx,
    py: layout.originY + x * layout.ay + y * layout.by,
  };
}
