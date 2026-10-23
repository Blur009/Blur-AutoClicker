export interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

export interface DayStat {
  day: string;
  clicks: number;
  timeSecs: number;
  sessions: number;
}

export interface RunHighlight {
  clicks: number;
  timeSecs: number;
  startedAt: number;
}

export interface StatsOverview {
  totals: CumulativeStats;
  clicksPerSec: number;
  activeDays: number;
  legacyRuns: number;
  legacyClicks: number;
  longestRun: RunHighlight | null;
  currentStreakDays: number;
  longestStreakDays: number;
  clickedToday: boolean;
  daily: DayStat[];
}

export interface HeatCell {
  day: string;
  clicks: number;
  future: boolean;
}

const MS_PER_DAY = 86_400_000;

const DAY_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});
const FULL_FORMAT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const MONTH_FORMAT = new Intl.DateTimeFormat("en", { month: "short" });

export interface ChartPoint {
  x: number;
  y: number;
}

export function smoothPath(points: ChartPoint[], smoothing = 0.5): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const next = points[index + 2] ?? end;
    const low = Math.min(start.y, end.y);
    const high = Math.max(start.y, end.y);
    const control1X = start.x + ((end.x - previous.x) / 6) * smoothing;
    const control1Y = Math.min(
      Math.max(start.y + ((end.y - previous.y) / 6) * smoothing, low),
      high,
    );
    const control2X = end.x - ((next.x - start.x) / 6) * smoothing;
    const control2Y = Math.min(
      Math.max(end.y - ((next.y - start.y) / 6) * smoothing, low),
      high,
    );
    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${end.x} ${end.y}`;
  }
  return path;
}

export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatDay(day: string): string {
  return DAY_FORMAT.format(parseDay(day));
}

export function formatFullDay(day: string): string {
  return FULL_FORMAT.format(parseDay(day));
}

export function formatStamp(seconds: number): string {
  return FULL_FORMAT.format(new Date(seconds * 1000));
}

export function formatMonth(date: Date): string {
  return MONTH_FORMAT.format(date);
}

export function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString("en");
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0.01) return "0s";
  const seconds = Math.floor(totalSeconds);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m ${seconds % 60}s`;
}

export function formatPaceValue(clicksPerSecond: number): string {
  if (!Number.isFinite(clicksPerSecond) || clicksPerSecond <= 0)
    return "No data";
  return clicksPerSecond.toLocaleString("en", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatPace(clicksPerSecond: number): string {
  const value = formatPaceValue(clicksPerSecond);
  return value === "No data" ? value : `${value} clicks/s`;
}

export function buildWindow(
  daily: DayStat[],
  days: number,
  today: Date,
): DayStat[] {
  const byDay = new Map(daily.map((entry) => [entry.day, entry]));
  const window: DayStat[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKey(shiftDays(today, -offset));
    window.push(
      byDay.get(key) ?? { day: key, clicks: 0, timeSecs: 0, sessions: 0 },
    );
  }
  return window;
}

export function spanDays(daily: DayStat[], today: Date): number {
  if (daily.length === 0) return 0;
  const first = parseDay(daily[0].day);
  const start = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate(),
  ).getTime();
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

export interface WeekBucket {
  key: string;
  start: string;
  end: string;
  clicks: number;
  timeSecs: number;
  days: number;
}

export function weekBuckets(window: DayStat[]): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let end = window.length - 1; end >= 0; end -= 7) {
    const start = Math.max(0, end - 6);
    let clicks = 0;
    let timeSecs = 0;
    for (let index = start; index <= end; index += 1) {
      clicks += window[index].clicks;
      timeSecs += window[index].timeSecs;
    }
    buckets.push({
      key: window[start].day,
      start: window[start].day,
      end: window[end].day,
      clicks,
      timeSecs,
      days: end - start + 1,
    });
  }
  return buckets.reverse();
}

export function rollingAverage(values: number[], window: number): number[] {
  const averages: number[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= window) sum -= values[index - window];
    averages.push(sum / Math.min(index + 1, window));
  }
  return averages;
}

export function buildHeatmap(
  daily: DayStat[],
  today: Date,
  weeks = 53,
): HeatCell[][] {
  const byDay = new Map(daily.map((entry) => [entry.day, entry]));
  const todayKey = dayKey(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  const firstMonday = shiftDays(today, -mondayOffset - (weeks - 1) * 7);

  const columns: HeatCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const key = dayKey(shiftDays(firstMonday, week * 7 + row));
      column.push({
        day: key,
        clicks: byDay.get(key)?.clicks ?? 0,
        future: key > todayKey,
      });
    }
    columns.push(column);
  }
  return columns;
}

export function quantileThresholds(values: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return [0.25, 0.5, 0.75].map(
    (quantile) => sorted[Math.floor(quantile * (sorted.length - 1))],
  );
}

export function heatLevel(clicks: number, thresholds: number[]): number {
  if (clicks <= 0) return 0;
  let level = 1;
  for (const threshold of thresholds) {
    if (clicks > threshold) level += 1;
  }
  return Math.min(4, level);
}
