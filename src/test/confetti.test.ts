import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ConfettiModule = typeof import("../confetti");

const context = {
  scale: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  fillRect: vi.fn(),
  globalAlpha: 1,
  fillStyle: "",
};

let frames: FrameRequestCallback[] = [];
let clock = 1000;

function canvasCount(): number {
  return document.querySelectorAll("canvas").length;
}

function drainFrames(): number {
  const pending = frames;
  frames = [];
  context.fillRect.mockClear();
  for (const step of pending) step(clock + 16);
  return context.fillRect.mock.calls.length;
}

function hover(module: ConfettiModule, count: number, gapMs: number): void {
  for (let index = 0; index < count; index += 1) {
    frames = [];
    module.burstConfetti(40, 80);
    clock += gapMs;
  }
}

function motionPermission(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

async function freshModule(): Promise<ConfettiModule> {
  vi.resetModules();
  return import("../confetti");
}

beforeEach(() => {
  clock = 1000;
  frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (step: FrameRequestCallback) => {
    frames.push(step);
    return frames.length;
  });
  vi.stubGlobal(
    "setTimeout",
    vi.fn(() => 0),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("burstConfetti", () => {
  it("does nothing when the user asks for reduced motion", async () => {
    motionPermission(true);
    const module = await freshModule();

    module.burstConfetti(10, 10);

    expect(canvasCount()).toBe(0);
  });

  it("does nothing without a 2d context", async () => {
    motionPermission(false);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const module = await freshModule();

    module.burstConfetti(10, 10);

    expect(canvasCount()).toBe(0);
  });

  it("draws a small puff on a single hover", async () => {
    motionPermission(false);
    const module = await freshModule();

    module.burstConfetti(40, 80);
    const drawn = drainFrames();

    expect(canvasCount()).toBe(1);
    expect(drawn).toBeGreaterThan(10);
    expect(drawn).toBeLessThan(60);
  });

  it("ignores a second hover inside the cooldown window", async () => {
    motionPermission(false);
    const module = await freshModule();

    module.burstConfetti(40, 80);
    module.burstConfetti(40, 80);

    expect(canvasCount()).toBe(1);
  });

  it("showers the whole page after ten quick hovers", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 10, 400);
    const drawn = drainFrames();

    expect(canvasCount()).toBe(10);
    expect(drawn).toBeGreaterThan(100);
  });

  it("starts counting again after a shower", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 10, 400);
    hover(module, 1, 400);
    const drawn = drainFrames();

    expect(canvasCount()).toBe(11);
    expect(drawn).toBeGreaterThan(10);
    expect(drawn).toBeLessThan(60);
  });

  it("forgets hovers older than the rage window", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 9, 400);
    clock += 16_000;
    hover(module, 1, 0);
    const drawn = drainFrames();

    expect(drawn).toBeLessThan(60);
  });

  it("throws the mega shower after fifty hovers inside a minute", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 50, 800);
    const drawn = drainFrames();

    expect(drawn).toBeGreaterThan(200);
    expect(setTimeout).toHaveBeenCalledTimes(2);
  });

  it("keeps counting toward the mega shower across a pause", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 10, 800);
    clock += 20_000;
    hover(module, 40, 800);
    const drawn = drainFrames();

    expect(drawn).toBeGreaterThan(200);
    expect(setTimeout).toHaveBeenCalledTimes(2);
  });

  it("does not reach the mega shower when the hovers take over a minute", async () => {
    motionPermission(false);
    const module = await freshModule();

    hover(module, 50, 1300);
    drainFrames();

    expect(setTimeout).not.toHaveBeenCalled();
  });
});

describe("popConfetti", () => {
  it("fires a small fixed puff without touching the tiers", async () => {
    motionPermission(false);
    const module = await freshModule();

    module.popConfetti(20, 40);
    const drawn = drainFrames();

    expect(drawn).toBeGreaterThan(4);
    expect(drawn).toBeLessThan(20);
  });

  it("does nothing when the user asks for reduced motion", async () => {
    motionPermission(true);
    const module = await freshModule();

    module.popConfetti(20, 40);

    expect(canvasCount()).toBe(0);
  });

  it("does not count clicks toward the hover tiers", async () => {
    motionPermission(false);
    const module = await freshModule();

    for (let index = 0; index < 20; index += 1) {
      frames = [];
      module.popConfetti(20, 40);
      clock += 400;
    }
    frames = [];
    module.burstConfetti(20, 40);
    const drawn = drainFrames();

    expect(drawn).toBeLessThan(60);
  });
});
