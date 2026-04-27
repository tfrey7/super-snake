type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

const particles: Particle[] = [];

const COLORS = [
  '#fbbf24',
  '#f59e0b',
  '#ef4444',
  '#f472b6',
  '#fde047',
  '#a7f3d0',
  '#60a5fa',
];

export function spawnFireworks(cx: number, cy: number, scale = 1): void {
  const count = 40;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = (70 + Math.random() * 120) * scale;
    const life = 500 + Math.random() * 500;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: (2 + Math.random() * 3) * scale,
    });
  }
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (20 + Math.random() * 50) * scale;
    const life = 700 + Math.random() * 600;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color: '#ffffff',
      size: (1 + Math.random() * 2) * scale,
    });
  }
}

export function spawnLevelUpFireworks(boardPx: number): void {
  const cx = boardPx / 2;
  const cy = boardPx / 2;
  // Big central blast, then satellite bursts in a ring around it.
  spawnFireworks(cx, cy, 1.6);
  const ring = 6;
  const radius = boardPx * 0.28;
  for (let i = 0; i < ring; i++) {
    const angle = (Math.PI * 2 * i) / ring + Math.random() * 0.4;
    const sx = cx + Math.cos(angle) * radius;
    const sy = cy + Math.sin(angle) * radius;
    const delay = 90 + i * 70 + Math.random() * 60;
    setTimeout(() => spawnFireworks(sx, sy, 0.9 + Math.random() * 0.4), delay);
  }
}

export function updateParticles(dtMs: number): void {
  const dt = dtMs / 1000;
  const drag = Math.pow(0.5, dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dtMs;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 220 * dt;
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of particles) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export function clearParticles(): void {
  particles.length = 0;
}
