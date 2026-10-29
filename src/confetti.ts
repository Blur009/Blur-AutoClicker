import { hexToRgb } from "./colorMath";

type Channel = [number, number, number];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  sway: number;
  phase: number;
  color: string;
};

type Motion = {
  gravity: number;
  decay: number;
  lifetimeMs: number;
  fadeMs: number;
};

type Puff = {
  angle: number;
  spreadRad: number;
  minSpeed: number;
  maxSpeed: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};

const BURST_MOTION: Motion = {
  gravity: 780,
  decay: 0.1,
  lifetimeMs: 1200,
  fadeMs: 400,
};

const SHOWER_MOTION: Motion = {
  gravity: 420,
  decay: 0.3,
  lifetimeMs: 3400,
  fadeMs: 800,
};

const MEGA_MOTION: Motion = {
  gravity: 520,
  decay: 0.35,
  lifetimeMs: 5200,
  fadeMs: 1200,
};

const CANNON_MOTION: Motion = {
  gravity: 700,
  decay: 0.4,
  lifetimeMs: 3600,
  fadeMs: 900,
};

const BURST_PUFF: Puff = {
  angle: -Math.PI / 2,
  spreadRad: (58 * Math.PI) / 180,
  minSpeed: 200,
  maxSpeed: 420,
  minWidth: 3,
  maxWidth: 6,
  minHeight: 5,
  maxHeight: 9,
};

const CANNON_PUFF: Puff = {
  angle: -Math.PI / 2,
  spreadRad: (32 * Math.PI) / 180,
  minSpeed: 1500,
  maxSpeed: 2600,
  minWidth: 6,
  maxWidth: 11,
  minHeight: 10,
  maxHeight: 17,
};

const SHOWER_COUNT = 170;
const MEGA_COUNT = 300;
const MEGA_WAVE_COUNT = 130;
const CANNON_COUNT = 70;
const COOLDOWN_MS = 300;
const SHOWER_WINDOW_MS = 15_000;
const SHOWER_HOVER_COUNT = 10;
const MEGA_WINDOW_MS = 60_000;
const MEGA_HOVER_COUNT = 50;
const FALLBACK_PALETTE = ["#19c233", "#7ef07e", "#ffffff", "#fecc2f"];

let lastBurstAt = Number.NEGATIVE_INFINITY;
let showerTimes: number[] = [];
let megaTimes: number[] = [];

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function parseColor(raw: string): Channel | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) {
    const rgb = hexToRgb(value);
    return rgb ? [rgb.red, rgb.green, rgb.blue] : null;
  }
  const numbers = value.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 3) return null;
  return [Number(numbers[0]), Number(numbers[1]), Number(numbers[2])];
}

function toCss([red, green, blue]: Channel): string {
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}

function tint([red, green, blue]: Channel, amount: number): Channel {
  return [
    red + (255 - red) * amount,
    green + (255 - green) * amount,
    blue + (255 - blue) * amount,
  ];
}

function palette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  const accent = parseColor(styles.getPropertyValue("--accent"));
  if (!accent) return FALLBACK_PALETTE;

  const colors = [
    toCss(accent),
    toCss(tint(accent, 0.55)),
    toCss(tint(accent, 0.8)),
  ];
  const warm = parseColor(styles.getPropertyValue("--accent-yellow"));
  if (warm) colors.push(toCss(warm));
  return colors;
}

function pick(colors: string[]): string {
  return (
    colors[Math.floor(Math.random() * colors.length)] ?? FALLBACK_PALETTE[2]
  );
}

function spread(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawnPuff(
  x: number,
  y: number,
  colors: string[],
  puff: Puff,
): Particle {
  const angle = puff.angle + (Math.random() * 2 - 1) * puff.spreadRad;
  const speed = spread(puff.minSpeed, puff.maxSpeed);

  return {
    x: x + (Math.random() * 2 - 1) * 6,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    width: spread(puff.minWidth, puff.maxWidth),
    height: spread(puff.minHeight, puff.maxHeight),
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() * 2 - 1) * 9,
    sway: 0,
    phase: 0,
    color: pick(colors),
  };
}

function spawnShower(width: number, colors: string[]): Particle {
  return {
    x: Math.random() * width,
    y: -20 - Math.random() * 260,
    vx: (Math.random() * 2 - 1) * 50,
    vy: 90 + Math.random() * 160,
    width: spread(4, 8),
    height: spread(7, 14),
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() * 2 - 1) * 7,
    sway: spread(8, 30),
    phase: Math.random() * Math.PI * 2,
    color: pick(colors),
  };
}

function shower(count: number, colors: string[]): Particle[] {
  const width = window.innerWidth;
  return Array.from({ length: count }, () => spawnShower(width, colors));
}

function run(particles: Particle[], motion: Motion): void {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2147483000",
  });

  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.scale(ratio, ratio);

  document.body.appendChild(canvas);

  const startedAt = performance.now();
  let previousAt = startedAt;

  const step = (time: number) => {
    const elapsed = time - startedAt;
    if (elapsed >= motion.lifetimeMs) {
      canvas.remove();
      return;
    }

    const dt = Math.min(0.032, Math.max(0, (time - previousAt) / 1000));
    previousAt = time;

    const decay = motion.decay ** dt;
    const fade = Math.min(1, (motion.lifetimeMs - elapsed) / motion.fadeMs);

    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.vx *= decay;
      particle.vy *= decay;
      particle.vy += motion.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
      particle.phase += 5 * dt;

      const drift =
        particle.sway === 0 ? 0 : Math.sin(particle.phase) * particle.sway;

      context.save();
      context.globalAlpha = fade;
      context.fillStyle = particle.color;
      context.translate(particle.x + drift, particle.y);
      context.rotate(particle.rotation);
      context.fillRect(
        -particle.width / 2,
        -particle.height / 2,
        particle.width,
        particle.height,
      );
      context.restore();
    }

    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function megaShower(colors: string[]): void {
  run(shower(MEGA_COUNT, colors), MEGA_MOTION);

  window.setTimeout(() => {
    run(shower(MEGA_WAVE_COUNT, colors), MEGA_MOTION);
  }, 380);

  window.setTimeout(() => {
    const height = window.innerHeight;
    const width = window.innerWidth;
    const left = Array.from({ length: CANNON_COUNT }, () =>
      spawnPuff(0, height, colors, CANNON_PUFF),
    );
    const right = Array.from({ length: CANNON_COUNT }, () =>
      spawnPuff(width, height, colors, CANNON_PUFF),
    );
    run([...left, ...right], CANNON_MOTION);
  }, 760);
}

type Tier = "mega" | "shower" | null;

function nextTier(now: number): Tier {
  showerTimes = showerTimes.filter((time) => now - time <= SHOWER_WINDOW_MS);
  megaTimes = megaTimes.filter((time) => now - time <= MEGA_WINDOW_MS);
  showerTimes.push(now);
  megaTimes.push(now);

  if (megaTimes.length >= MEGA_HOVER_COUNT) {
    megaTimes = [];
    showerTimes = [];
    return "mega";
  }

  if (showerTimes.length >= SHOWER_HOVER_COUNT) {
    showerTimes = [];
    return "shower";
  }

  return null;
}

export function burstConfetti(clientX: number, clientY: number): void {
  if (prefersReducedMotion()) return;

  const now = performance.now();
  const colors = palette();
  const tier = nextTier(now);

  if (tier !== null) {
    lastBurstAt = now;
    if (tier === "mega") {
      megaShower(colors);
    } else {
      run(shower(SHOWER_COUNT, colors), SHOWER_MOTION);
    }
    return;
  }

  if (now - lastBurstAt < COOLDOWN_MS) return;
  lastBurstAt = now;

  run(
    Array.from({ length: 20 }, () =>
      spawnPuff(clientX, clientY, colors, BURST_PUFF),
    ),
    BURST_MOTION,
  );
}
