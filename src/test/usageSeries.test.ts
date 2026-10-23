import { describe, it, expect } from "vitest";
import {
  buildHeatmap,
  buildWindow,
  dayKey,
  formatPace,
  formatTime,
  weekBuckets,
  heatLevel,
  parseDay,
  quantileThresholds,
  rollingAverage,
  smoothPath,
  spanDays,
  type DayStat,
} from "../components/panels/settings/sections/usageSeries";

function day(value: string, clicks = 0): DayStat {
  return {
    day: value,
    clicks,
    timeSecs: clicks / 10,
    sessions: clicks > 0 ? 1 : 0,
  };
}

const TODAY = new Date(2026, 9, 12);

describe("buildWindow", () => {
  it("ends today and fills missing days with zeroes", () => {
    const window = buildWindow(
      [day("2026-10-10", 50), day("2026-10-12", 80)],
      3,
      TODAY,
    );

    expect(window.map((entry) => entry.day)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
    expect(window.map((entry) => entry.clicks)).toEqual([50, 0, 80]);
  });

  it("ignores days outside the window", () => {
    const window = buildWindow([day("2026-09-01", 999)], 2, TODAY);
    expect(window.map((entry) => entry.clicks)).toEqual([0, 0]);
  });
});

describe("spanDays", () => {
  it("counts the first active day through today", () => {
    expect(spanDays([day("2026-10-06")], TODAY)).toBe(7);
    expect(spanDays([], TODAY)).toBe(0);
  });

  it("never reports less than a day", () => {
    expect(spanDays([day("2026-10-12")], TODAY)).toBe(1);
  });
});

describe("rollingAverage", () => {
  it("trails the last seven values", () => {
    const values = [0, 0, 0, 0, 0, 0, 7, 0];
    expect(rollingAverage(values, 7)).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it("averages fewer values at the start", () => {
    expect(rollingAverage([2, 4], 7)).toEqual([2, 3]);
  });
});

describe("smoothPath", () => {
  it("returns nothing for an empty series", () => {
    expect(smoothPath([])).toBe("");
  });

  it("moves to a lone point without drawing", () => {
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M 1 2");
  });

  it("draws one cubic per segment", () => {
    const path = smoothPath([
      { x: 0, y: 10 },
      { x: 50, y: 0 },
      { x: 100, y: 10 },
    ]);
    expect(path.startsWith("M 0 10")).toBe(true);
    expect(path.match(/C /g)).toHaveLength(2);
    expect(path.endsWith("100 10")).toBe(true);
  });

  it("never draws outside the plot when a spike ends", () => {
    const path = smoothPath([
      { x: 0, y: 100 },
      { x: 25, y: 60 },
      { x: 50, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
    ]);
    const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("keeps a straight series straight", () => {
    const path = smoothPath([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ]);
    const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    for (let index = 0; index < numbers.length; index += 2) {
      expect(numbers[index]).toBeCloseTo(numbers[index + 1], 6);
    }
  });
});

describe("weekBuckets", () => {
  const days = Array.from({ length: 16 }, (_, index) =>
    day(`2026-10-${String(index + 1).padStart(2, "0")}`, index + 1),
  );

  it("anchors the last bucket at the end of the window", () => {
    const buckets = weekBuckets(days);
    expect(buckets.at(-1)?.end).toBe("2026-10-16");
    expect(buckets.at(-1)?.start).toBe("2026-10-10");
  });

  it("sums clicks and tracks how many days a bucket covers", () => {
    const buckets = weekBuckets(days);
    expect(buckets).toHaveLength(3);
    expect(buckets[0].days).toBe(2);
    expect(buckets[0].clicks).toBe(3);
    expect(buckets.at(-1)?.clicks).toBe(10 + 11 + 12 + 13 + 14 + 15 + 16);
  });
});

describe("buildHeatmap", () => {
  it("starts the grid on a Monday and ends on the current week", () => {
    const weeks = buildHeatmap([day("2026-10-12", 12)], TODAY);

    expect(weeks).toHaveLength(53);
    expect(weeks.every((column) => column.length === 7)).toBe(true);
    expect(parseDay(weeks[0][0].day).getDay()).toBe(1);
    expect(weeks[52][0].day).toBe("2026-10-12");
  });

  it("marks days after today as future and keeps their clicks out of the grid", () => {
    const weeks = buildHeatmap([], TODAY);
    const cells = weeks.flat();
    const future = cells.filter((cell) => cell.future);

    expect(future).toHaveLength(6);
    expect(cells.find((cell) => cell.day === "2026-10-12")?.future).toBe(false);
  });

  it("carries recorded clicks into the right cell", () => {
    const weeks = buildHeatmap([day("2026-10-12", 42)], TODAY);
    const cell = weeks.flat().find((entry) => entry.day === "2026-10-12");
    expect(cell?.clicks).toBe(42);
  });
});

describe("heat levels", () => {
  it("splits non-zero values into four buckets", () => {
    const thresholds = quantileThresholds([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(heatLevel(0, thresholds)).toBe(0);
    expect(heatLevel(1, thresholds)).toBe(1);
    expect(heatLevel(8, thresholds)).toBe(4);
  });

  it("treats an empty history as level zero", () => {
    expect(heatLevel(0, quantileThresholds([]))).toBe(0);
    expect(heatLevel(5, quantileThresholds([]))).toBe(1);
  });
});

describe("formatting", () => {
  it("keeps seconds on the clock", () => {
    expect(formatTime(45)).toBe("45s");
    expect(formatTime(125)).toBe("2m 5s");
    expect(formatTime(3900)).toBe("1h 5m 0s");
    expect(formatTime(190_000)).toBe("52h 46m 40s");
  });

  it("labels missing pace instead of printing zero", () => {
    expect(formatPace(0)).toBe("No data");
    expect(formatPace(-1)).toBe("No data");
    expect(formatPace(12.3456)).toBe("12.3 clicks/s");
  });

  it("keys dates in local time", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(parseDay("2026-01-05").getDate()).toBe(5);
  });
});
