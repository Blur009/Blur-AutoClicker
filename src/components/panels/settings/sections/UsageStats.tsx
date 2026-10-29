import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  buildHeatmap,
  buildWindow,
  dayKey,
  formatDay,
  formatFullDay,
  formatMonth,
  formatNumber,
  formatPace,
  formatPaceValue,
  formatStamp,
  formatTime,
  heatLevel,
  parseDay,
  quantileThresholds,
  rollingAverage,
  smoothPath,
  spanDays,
  weekBuckets,
  type StatsOverview,
} from "./usageSeries";
import { SettingsCard } from "./shared";
import "./UsageStats.css";

const METRICS = [
  { key: "clicks", label: "Clicks" },
  { key: "time", label: "Time" },
] as const;

const RANGES = [
  { key: "7", label: "7d", phrase: "the last 7 days" },
  {
    key: "30",
    label: "30d",
    phrase: "the last 30 days",
  },
  {
    key: "90",
    label: "90d",
    phrase: "the last 90 days",
  },
  { key: "all", label: "All", phrase: "all time" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];
type RangeKey = (typeof RANGES)[number]["key"];

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function useAnimatedNumber(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return;
    const instant =
      duration <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].key);
    buttons.current[next]?.focus();
  };

  return (
    <div className="settings-seg-group" role="group" aria-label={label}>
      {options.map((option, index) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            className={`settings-seg-btn${active ? " active" : ""}`}
            aria-pressed={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.key)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function streakNote(overview: StatsOverview): string {
  const { currentStreakDays, longestStreakDays, clickedToday } = overview;
  if (currentStreakDays === 0) {
    return longestStreakDays > 0
      ? `Best was ${longestStreakDays} days. Start a new one.`
      : "Click today to start one.";
  }
  const best =
    longestStreakDays > currentStreakDays
      ? `Best ${longestStreakDays}`
      : "Personal best";
  const today = clickedToday ? "Today counted" : "Click today to keep it";
  return `${best} · ${today}`;
}

const INFO_ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const ALERT_ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

function UsageNotices({ overview }: { overview: StatsOverview }) {
  return (
    <div className="usage-notices">
      {overview.legacyRuns > 0 ? (
        <span className="usage-notice" tabIndex={0}>
          {ALERT_ICON}
          <span className="usage-notice-card" role="tooltip">
            Sessions recorded before v3.9.7 were saved without a date, so{" "}
            {formatNumber(overview.legacyClicks)} clicks of old history cannot
            be placed on the calendar or the charts below. They still count in
            the totals.
          </span>
        </span>
      ) : null}
      <span className="usage-notice" tabIndex={0}>
        {INFO_ICON}
        <span className="usage-notice-card" role="tooltip">
          Everything here is stored in a database on this computer. Nothing is
          uploaded or shared.
        </span>
      </span>
    </div>
  );
}

export default function UsageCard({
  overview,
}: {
  overview: StatsOverview | null;
}) {
  const hasData = overview !== null && overview.totals.totalSessions > 0;

  return (
    <SettingsCard
      title="Usage"
      actions={
        overview && hasData ? <UsageNotices overview={overview} /> : null
      }
    >
      {overview === null ? (
        <div className="stats-empty">Loading stats...</div>
      ) : !hasData ? (
        <div className="stats-empty">No sessions recorded yet.</div>
      ) : (
        <UsageStats overview={overview} />
      )}
    </SettingsCard>
  );
}

const UsageStats = memo(function UsageStats({
  overview,
}: {
  overview: StatsOverview;
}) {
  const [metric, setMetric] = useState<MetricKey>("clicks");
  const [range, setRange] = useState<RangeKey>("30");
  const [hovered, setHovered] = useState<number | null>(null);
  const [today, setToday] = useState(() => new Date());
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  const tipRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<number | null>(null);

  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      const now = new Date();
      setToday((previous) =>
        dayKey(previous) === dayKey(now) ? previous : now,
      );
    };
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = window.setTimeout(
        () => {
          refresh();
          schedule();
        },
        Math.max(1000, midnight.getTime() - now.getTime()),
      );
    };
    schedule();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const clearHover = useCallback(() => {
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHovered(null);
    }
    setTip(null);
  }, []);

  const changeMetric = useCallback(
    (next: MetricKey) => {
      clearHover();
      setMetric(next);
    },
    [clearHover],
  );

  const changeRange = useCallback(
    (next: RangeKey) => {
      clearHover();
      setRange(next);
    },
    [clearHover],
  );

  const showTip = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".usage-bars")) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-tip]",
    );
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setTip({
      text: target.dataset.tip ?? "",
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, []);

  const hideTip = useCallback(() => {
    hoveredRef.current = null;
    setHovered(null);
    setTip(null);
  }, []);

  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!element || !tip) return;
    const half = element.offsetWidth / 2;
    const minX = 8 + half;
    const maxX = Math.max(minX, window.innerWidth - 8 - half);
    element.style.left = `${Math.min(Math.max(tip.x, minX), maxX)}px`;
    element.style.top = `${Math.max(tip.y, 8 + element.offsetHeight)}px`;
  }, [tip]);

  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", hideTip);
    return () => {
      window.removeEventListener("scroll", hideTip, true);
      window.removeEventListener("resize", hideTip);
    };
  }, [tip, hideTip]);

  const animatedClicks = useAnimatedNumber(overview.totals.totalClicks);
  const animatedTime = useAnimatedNumber(overview.totals.totalTimeSecs);
  const animatedSessions = useAnimatedNumber(overview.totals.totalSessions);
  const pace = overview.clicksPerSec;
  const animatedPace = useAnimatedNumber(pace > 0 ? pace : 0);

  const activeRange =
    RANGES.find((option) => option.key === range) ?? RANGES[1];

  const windowDays = useMemo(() => {
    const days =
      range === "all"
        ? Math.max(30, spanDays(overview.daily, today))
        : Number(range);
    return buildWindow(overview.daily, days, today);
  }, [overview.daily, range, today]);

  const weekly = windowDays.length > 60;
  const buckets = useMemo(
    () => (weekly ? weekBuckets(windowDays) : []),
    [weekly, windowDays],
  );

  const points = useMemo(() => {
    if (weekly) {
      return buckets.map((bucket) => ({
        key: bucket.key,
        value: metric === "clicks" ? bucket.clicks : bucket.timeSecs,
        title: `${formatDay(bucket.start)} to ${formatDay(bucket.end)}`,
        full: `${formatFullDay(bucket.start)} to ${formatFullDay(bucket.end)}`,
      }));
    }
    return windowDays.map((day) => ({
      key: day.day,
      value: metric === "clicks" ? day.clicks : day.timeSecs,
      title: formatDay(day.day),
      full: formatFullDay(day.day),
    }));
  }, [weekly, buckets, windowDays, metric]);

  const peak = Math.max(1, ...points.map((point) => point.value));
  const trendWindow = weekly ? 4 : Math.min(7, points.length);
  const trend = rollingAverage(
    points.map((point) => point.value),
    trendWindow,
  );
  const latestAverage = trend[trend.length - 1] ?? 0;
  const averageLabel = weekly ? "week" : "day";

  const measure = (value: number) =>
    metric === "clicks" ? `${formatNumber(value)} clicks` : formatTime(value);
  const shortValue = (value: number) =>
    metric === "clicks" ? formatNumber(value) : formatTime(value);

  const trendCurve = smoothPath(
    trend.map((value, index) => ({
      x: ((index + 0.5) / trend.length) * 100,
      y: 100 - (value / peak) * 100,
    })),
  );

  const activeIndex =
    hovered !== null && hovered < points.length ? hovered : null;

  const handleBarsMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || points.length === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(
      points.length - 1,
      Math.max(0, Math.floor(ratio * points.length)),
    );
    if (hoveredRef.current === index) return;
    hoveredRef.current = index;
    const point = points[index];
    setHovered(index);
    setTip({
      text: `${point.full}: ${measure(point.value)}`,
      x: rect.left + ((index + 0.5) / points.length) * rect.width,
      y: rect.top - 8,
    });
  };

  const weeks = useMemo(
    () => buildHeatmap(overview.daily, today),
    [overview.daily, today],
  );
  const thresholds = useMemo(
    () =>
      quantileThresholds(
        weeks.flat().flatMap((cell) => (cell.clicks > 0 ? [cell.clicks] : [])),
      ),
    [weeks],
  );

  const longest = overview.longestRun;

  return (
    <div
      className="usage-stats"
      onPointerOver={showTip}
      onPointerLeave={hideTip}
    >
      <div className="stats-grid">
        <div className="stats-cell">
          <span className="stats-cell-label">Total clicks</span>
          <span className="stats-cell-value">
            {formatNumber(animatedClicks)}
          </span>
        </div>
        <div className="stats-cell">
          <span className="stats-cell-label">Clicking time</span>
          <span className="stats-cell-value">{formatTime(animatedTime)}</span>
        </div>
        <div className="stats-cell">
          <span className="stats-cell-label">Sessions</span>
          <span className="stats-cell-value">
            {formatNumber(animatedSessions)}
          </span>
        </div>
        <div className="stats-cell">
          <span className="stats-cell-label">Average speed</span>
          <span className="stats-cell-value">
            {pace > 0 ? (
              <>
                {formatPaceValue(animatedPace)}
                <span className="stats-cell-unit">clicks/s</span>
              </>
            ) : (
              "No data"
            )}
          </span>
        </div>
      </div>

      {overview.daily.length === 0 ? (
        <p className="usage-empty">
          No dated sessions yet. History from before v3.9.7 still counts in the
          totals above, and the charts fill in from your next session.
        </p>
      ) : (
        <>
          <div className="usage-controls-row">
            <SegmentedControl
              label="Measure"
              options={METRICS}
              value={metric}
              onChange={changeMetric}
            />
            <SegmentedControl
              label="Time range"
              options={RANGES}
              value={range}
              onChange={changeRange}
            />
          </div>

          <div className="usage-chart">
            <div className="usage-block-head">
              <div className="usage-block-lead">
                <span className="usage-block-title">
                  {weekly ? "Weekly activity" : "Daily activity"}
                </span>
                <span
                  className="usage-legend"
                  data-tip={`Average of the last ${trendWindow} ${
                    weekly ? "weeks" : "days"
                  }`}
                >
                  <i />
                  avg {shortValue(latestAverage)}/{averageLabel}
                </span>
              </div>
            </div>
            <div
              className={`usage-bars${
                points.length > 60 ? " usage-bars--dense" : ""
              }`}
              role="img"
              aria-label={`${weekly ? "Weekly" : "Daily"} ${
                metric === "clicks" ? "clicks" : "time"
              } over ${activeRange.phrase}`}
              onPointerMove={handleBarsMove}
              onPointerLeave={clearHover}
            >
              {points.map((point, index) => {
                const scale =
                  point.value > 0 ? Math.max(0.02, point.value / peak) : 0;
                return (
                  <div
                    key={point.key}
                    className={`usage-bar-slot${
                      activeIndex === index ? " usage-bar-slot--active" : ""
                    }`}
                  >
                    <div
                      className={`usage-bar${point.value > 0 ? "" : " usage-bar--zero"}`}
                      style={
                        point.value > 0
                          ? ({ "--bar-scale": scale } as CSSProperties)
                          : undefined
                      }
                    />
                  </div>
                );
              })}
              <svg
                className="usage-trend"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={trendCurve} vectorEffect="non-scaling-stroke" />
              </svg>
              {activeIndex !== null ? (
                <span
                  className="usage-crosshair"
                  style={{
                    left: `${((activeIndex + 0.5) / points.length) * 100}%`,
                  }}
                />
              ) : null}
            </div>
            <div className="usage-axis">
              <span>{points[0].title}</span>
              {weekly ? (
                <span className="usage-axis-note">weekly totals</span>
              ) : null}
              <span>{points[points.length - 1].title}</span>
            </div>
          </div>

          <div className="usage-heat">
            <div className="usage-block-head">
              <span className="usage-block-title">Last 12 months</span>
              <span className="usage-block-meta">
                {overview.activeDays} active days · since{" "}
                {formatDay(overview.daily[0].day)}
              </span>
            </div>
            <div className="usage-heat-body">
              <div className="usage-heat-labels" aria-hidden="true">
                {WEEKDAY_LABELS.map((label, index) => (
                  <span key={index}>{label}</span>
                ))}
              </div>
              <div className="usage-heat-grid">
                {weeks.map((column) => (
                  <div className="usage-heat-week" key={column[0].day}>
                    {column.map((cell) => (
                      <span
                        key={cell.day}
                        className={`usage-heat-cell usage-heat-l${heatLevel(
                          cell.clicks,
                          thresholds,
                        )}${cell.future ? " usage-heat-cell--future" : ""}`}
                        data-tip={`${formatFullDay(cell.day)}: ${formatNumber(
                          cell.clicks,
                        )} clicks`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="usage-heat-months">
              {weeks.map((column, index) => {
                const date = parseDay(column[0].day);
                const startsMonth =
                  index === 0 ||
                  date.getMonth() !==
                    parseDay(weeks[index - 1][0].day).getMonth();
                return (
                  <span key={column[0].day}>
                    {startsMonth ? formatMonth(date) : ""}
                  </span>
                );
              })}
            </div>
            <div className="usage-heat-legend">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i
                  key={level}
                  className={`usage-heat-cell usage-heat-l${level}`}
                />
              ))}
              <span>More</span>
            </div>
          </div>

          <div className="usage-records">
            <div className="usage-record">
              <span className="usage-record-label">Longest session</span>
              <span className="usage-record-value">
                {longest ? formatTime(longest.timeSecs) : "None yet"}
              </span>
              <span className="usage-record-meta">
                {longest
                  ? `${formatNumber(longest.clicks)} clicks · ${formatPace(
                      longest.clicks / longest.timeSecs,
                    )} · ${formatStamp(longest.startedAt)}`
                  : "Run the clicker to set a record."}
              </span>
            </div>
            <div className="usage-record">
              <span className="usage-record-label">Streak</span>
              <span className="usage-record-value">
                {overview.currentStreakDays}{" "}
                {overview.currentStreakDays === 1 ? "day" : "days"}
              </span>
              <span className="usage-record-meta">{streakNote(overview)}</span>
            </div>
          </div>
        </>
      )}
      {tip
        ? createPortal(
            <div
              ref={tipRef}
              className="usage-tip"
              style={{ left: tip.x, top: tip.y }}
            >
              {tip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
