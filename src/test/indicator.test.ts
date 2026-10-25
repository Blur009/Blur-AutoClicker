import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Listener = (event: { payload: unknown }) => void;

const listeners = new Map<string, Listener>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: Listener) => {
    listeners.set(name, handler);
    return () => {};
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => status()),
}));

function status(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    color: "#bb00ff",
    flashEnabled: true,
    flashDim: 40,
    size: 32,
    active: true,
    theme: "dark",
    corner: "top-right",
    countdown: false,
    countdownMode: "words",
    countdownFont: 10,
    ...overrides,
  };
}

async function mountIndicator() {
  vi.resetModules();
  document.body.innerHTML =
    '<div id="stack"><div id="card"><div id="glyph"></div><div id="countdown" hidden></div></div></div>';
  listeners.clear();
  const module = await import("../indicator");
  await Promise.resolve();
  return {
    formatDuration: module.formatDuration,
    stack: document.getElementById("stack") as HTMLElement,
    countdown: document.getElementById("countdown") as HTMLElement,
  };
}

function send(name: string, payload: unknown) {
  const handler = listeners.get(name);
  if (!handler) throw new Error(`no listener for ${name}`);
  handler({ payload });
}

describe("indicator flash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rests dim and snaps to full without interpolation", async () => {
    const { stack } = await mountIndicator();
    expect(stack.style.opacity).toBe("0.6");

    send("indicator-pulse", { holdMs: 100 });
    expect(stack.style.opacity).toBe("1");

    vi.advanceTimersByTime(99);
    expect(stack.style.opacity).toBe("1");

    vi.advanceTimersByTime(1);
    expect(stack.style.opacity).toBe("0.6");
  });

  it("holds the flash for the full hold duration", async () => {
    const { stack } = await mountIndicator();

    send("indicator-pulse", { holdMs: 2_500 });
    vi.advanceTimersByTime(2_400);
    expect(stack.style.opacity).toBe("1");

    vi.advanceTimersByTime(100);
    expect(stack.style.opacity).toBe("0.6");
  });

  it("stays lit while pulses keep arriving", async () => {
    const { stack } = await mountIndicator();

    send("indicator-pulse", { holdMs: 100 });
    vi.advanceTimersByTime(80);
    send("indicator-pulse", { holdMs: 100 });
    vi.advanceTimersByTime(80);
    expect(stack.style.opacity).toBe("1");

    vi.advanceTimersByTime(100);
    expect(stack.style.opacity).toBe("0.6");
  });

  it("shows at full brightness when flashing is off", async () => {
    const { stack } = await mountIndicator();

    send("indicator-config", status({ flashEnabled: false }));
    send("indicator-pulse", { holdMs: 100 });
    expect(stack.style.opacity).toBe("1");

    vi.advanceTimersByTime(1000);
    expect(stack.style.opacity).toBe("1");
  });
});

describe("indicator countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats shorthand hours, minutes, seconds and milliseconds", async () => {
    const { formatDuration } = await mountIndicator();

    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(50)).toBe("0.1s");
    expect(formatDuration(450)).toBe("0.5s");
    expect(formatDuration(999)).toBe("1.0s");
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(3_000)).toBe("3s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(3_600_000)).toBe("1h 0m 0s");
    expect(formatDuration(6_843_000)).toBe("1h 54m 3s");
    expect(formatDuration(-500)).toBe("0.0s");
  });

  it("shows the waiting phase in words", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "words" }),
    );
    expect(countdown.hidden).toBe(true);

    vi.setSystemTime(1_000_000);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 0,
      waitMs: 5_000,
    });
    vi.advanceTimersByTime(32);
    expect(countdown.hidden).toBe(false);
    expect(countdown.textContent).toBe("Waiting 5s");
  });

  it("shows the hold phase in the short form", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "short" }),
    );
    vi.setSystemTime(1_000_000);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 800,
      waitMs: 1_200,
    });
    vi.advanceTimersByTime(32);
    expect(countdown.textContent).toBe("H 0.8s");
  });

  it("moves to the waiting phase after the hold, using the cycle anchor", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "words" }),
    );
    vi.setSystemTime(1_000_000);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 2_000,
      waitMs: 15_000,
    });

    vi.advanceTimersByTime(32);
    expect(countdown.textContent).toBe("Holding 2s");

    vi.advanceTimersByTime(2_500);
    expect(countdown.textContent).toBe("Waiting 15s");
  });

  it("keeps the countdown honest when the event arrives late", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "words" }),
    );
    vi.setSystemTime(1_000_000);
    vi.advanceTimersByTime(1_500);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 1_000,
      waitMs: 4_000,
    });
    vi.advanceTimersByTime(32);
    expect(countdown.textContent).toBe("Waiting 4s");
  });

  it("shows only the time in plain mode", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "plain" }),
    );
    vi.setSystemTime(1_000_000);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 0,
      waitMs: 5_000,
    });
    vi.advanceTimersByTime(32);
    expect(countdown.textContent).toBe("5s");
  });

  it("anchors the block to the configured corner", async () => {
    const { stack } = await mountIndicator();

    expect(stack.style.alignItems).toBe("flex-start");
    expect(stack.style.justifyContent).toBe("center");

    send("indicator-config", status({ corner: "bottom-left" }));
    expect(stack.style.alignItems).toBe("flex-end");

    send(
      "indicator-config",
      status({ corner: "bottom-right", backgroundMode: "card" }),
    );
    expect(stack.style.alignItems).toBe("flex-end");
    expect(stack.style.justifyContent).toBe("flex-end");
  });

  it("hides the text when the countdown is off", async () => {
    const { countdown } = await mountIndicator();

    send(
      "indicator-config",
      status({ countdown: true, countdownMode: "words" }),
    );
    vi.setSystemTime(1_000_000);
    send("indicator-schedule", {
      cycleStartMs: 1_000_000,
      holdMs: 0,
      waitMs: 5_000,
    });
    vi.advanceTimersByTime(32);
    expect(countdown.hidden).toBe(false);

    send(
      "indicator-config",
      status({ countdown: false, countdownMode: "off" }),
    );
    expect(countdown.hidden).toBe(true);
    expect(countdown.textContent).toBe("");
  });
});
