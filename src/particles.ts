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

export function spawnFireworks(cx: number, cy: number): void {
  const count = 40;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = 70 + Math.random() * 120;
    const life = 500 + Math.random() * 500;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 2 + Math.floor(Math.random() * 3),
    });
  }
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 50;
    const life = 700 + Math.random() * 600;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color: '#ffffff',
      size: 1 + Math.floor(Math.random() * 2),
    });
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
