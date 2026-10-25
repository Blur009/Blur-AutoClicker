import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsageStats from "../components/panels/settings/sections/UsageStats";
import {
  dayKey,
  type StatsOverview,
} from "../components/panels/settings/sections/usageSeries";

function dayOffset(offset: number): string {
  const now = new Date();
  return dayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset),
  );
}

function overview(overrides: Partial<StatsOverview> = {}): StatsOverview {
  const now = new Date();
  return {
    totals: {
      totalClicks: 1234,
      totalTimeSecs: 90,
      totalSessions: 7,
      avgCpu: 1.5,
    },
    clicksPerSec: 13.7,
    activeDays: 2,
    legacyRuns: 0,
    legacyClicks: 0,
    longestRun: {
      clicks: 300,
      timeSecs: 30,
      startedAt: Math.floor(now.getTime() / 1000),
    },
    currentStreakDays: 3,
    longestStreakDays: 10,
    clickedToday: false,
    daily: [
      { day: dayOffset(1), clicks: 30, timeSecs: 3, sessions: 1 },
      { day: dayOffset(0), clicks: 42, timeSecs: 4, sessions: 1 },
    ],
    ...overrides,
  };
}

describe("UsageStats", () => {
  it("shows a tooltip for a day in the heatmap", async () => {
    const user = userEvent.setup();
    const { container } = render(<UsageStats overview={overview()} />);

    const cells = Array.from(
      container.querySelectorAll<HTMLElement>(".usage-heat-cell"),
    );
    const todayCell = cells.find((cell) =>
      cell.dataset.tip?.endsWith("42 clicks"),
    );
    expect(todayCell).toBeDefined();

    await user.hover(todayCell!);
    expect(screen.getByText(/42 clicks$/)).toBeInTheDocument();
  });

  it("shows the average next to the chart title", () => {
    const daily = [7, 11, 13, 4, 9, 21, 50].map((clicks, index) => ({
      day: dayOffset(6 - index),
      clicks,
      timeSecs: 0,
      sessions: 1,
    }));
    const { container } = render(<UsageStats overview={overview({ daily })} />);
    expect(within(container).getByText("avg 16/day")).toBeInTheDocument();
  });

  it("switches to weekly totals for long ranges", async () => {
    const user = userEvent.setup();
    render(<UsageStats overview={overview()} />);

    await user.click(screen.getByRole("button", { name: "90d" }));

    expect(screen.getByText("Weekly activity")).toBeInTheDocument();
    expect(screen.getByText("weekly totals")).toBeInTheDocument();
  });

  it("labels the longest session and the streak", () => {
    render(<UsageStats overview={overview()} />);

    expect(screen.getByText("30s")).toBeInTheDocument();
    expect(screen.getByText(/300 clicks/)).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(
      screen.getByText("Best 10 · Click today to keep it"),
    ).toBeInTheDocument();
  });
});

describe("Usage notices", () => {
  it("always explains that the data stays on this computer", () => {
    const { container } = render(<UsageStats overview={overview()} />);

    const notices = container.querySelectorAll(".usage-notice");
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain("Nothing is uploaded");
  });

  it("warns about undated history only when there is some", () => {
    const { container } = render(
      <UsageStats
        overview={overview({ legacyRuns: 43, legacyClicks: 2_891_660 })}
      />,
    );

    const notices = container.querySelectorAll(".usage-notice");
    expect(notices).toHaveLength(2);
    expect(notices[0].textContent).toContain("v3.9.7");
    expect(notices[0].textContent).toContain("2,891,660 clicks");
    expect(notices[1].textContent).toContain("Nothing is uploaded");
  });
});
