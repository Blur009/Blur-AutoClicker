import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { StatsOverview } from "../components/panels/settings/sections/usageSeries";

type Listener = (event: { payload: unknown }) => void;

const listeners = new Map<string, Listener>();

function overview(
  overrides: Partial<StatsOverview["totals"]> = {},
): StatsOverview {
  const totals = {
    totalClicks: 1234,
    totalTimeSecs: 90,
    totalSessions: 7,
    avgCpu: 1.5,
    ...overrides,
  };
  return {
    totals,
    clicksPerSec:
      totals.totalTimeSecs > 0 ? totals.totalClicks / totals.totalTimeSecs : -1,
    activeDays: 0,
    legacyRuns: 0,
    legacyClicks: 0,
    longestRun: null,
    currentStreakDays: 0,
    longestStreakDays: 0,
    clickedToday: false,
    daily: [],
  };
}

let stored: StatsOverview = overview();

let clock = 0;
let frames: FrameRequestCallback[] = [];

function runFrames(totalMs: number) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += 16) {
    clock += 16;
    const pending = frames;
    frames = [];
    act(() => {
      for (const frame of pending) frame(clock);
    });
  }
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: Listener) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => stored),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

async function mountGeneral() {
  const { default: GeneralSection } =
    await import("../components/panels/settings/sections/GeneralSection");
  render(
    <GeneralSection
      appInfo={{ version: "3.9.6", portable: false } as never}
      updateCheckStatus="idle"
      onCheckForUpdate={() => {}}
    />,
  );
  await act(async () => {});
}

async function finishRun(next: Partial<StatsOverview["totals"]>) {
  stored = overview(next);
  const handler = listeners.get("stats-updated");
  expect(handler).toBeDefined();
  await act(async () => {
    handler!({ payload: next });
  });
}

describe("settings usage stats", () => {
  beforeEach(() => {
    listeners.clear();
    stored = overview();
    clock = 1000;
    frames = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    };
    window.cancelAnimationFrame = () => {};
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as never;
  });

  it("shows the stored totals straight away when the page opens", async () => {
    await mountGeneral();

    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it("counts up only once a run finishes while the page is open", async () => {
    await mountGeneral();
    await finishRun({ totalClicks: 2000, totalSessions: 8 });

    expect(screen.queryByText("2,000")).not.toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();

    runFrames(700);

    expect(screen.getByText("2,000")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});
