import type { ChangeEvent } from "react";
import type { Settings, TimeLimitUnit } from "../store";
import { formatTimerDuration, timeLimitDurationMs } from "../timerUtils";
import "./TimerWidget.css";

interface TimerWidgetProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  running: boolean;
  paused: boolean;
  sessionElapsedMs: number;
  lastSessionDurationMs: number;
  stopwatchElapsedMs: number;
  stopwatchRunning: boolean;
  onStopwatchToggle: () => void;
  onStopwatchReset: () => void;
}

function normalizePositiveNumber(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function TimerValue({ value }: { value: number }) {
  return <span className="timer-value">{formatTimerDuration(value)}</span>;
}

function TimerWidget({
  settings,
  update,
  running,
  paused,
  sessionElapsedMs,
  lastSessionDurationMs,
  stopwatchElapsedMs,
  stopwatchRunning,
  onStopwatchToggle,
  onStopwatchReset,
}: TimerWidgetProps) {
  const countdownMs = timeLimitDurationMs(settings);
  const countdownRemainingMs = Math.max(0, countdownMs - sessionElapsedMs);
  const stopwatchButtonLabel = stopwatchRunning
    ? "Pause"
    : stopwatchElapsedMs > 0
      ? "Resume"
      : "Start";

  const handleCountdownToggle = () => {
    const nextEnabled = !settings.timeLimitEnabled;
    update({
      timeLimitEnabled: nextEnabled,
      clickLimitEnabled: nextEnabled ? false : settings.clickLimitEnabled,
    });
  };

  const handleCountdownValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    update({ timeLimit: normalizePositiveNumber(event.target.value) });
  };

  const handleCountdownUnitChange = (timeLimitUnit: TimeLimitUnit) => {
    update({ timeLimitUnit });
  };

  return (
    <section className="timer-widget" aria-label="Timers">
      <div className="timer-card timer-card--session" data-active={running}>
        <div className="timer-card-head">
          <span className="timer-label">Session</span>
          <span className="timer-status-dot" aria-hidden="true" />
        </div>
        <TimerValue value={sessionElapsedMs} />
        <span className="timer-subvalue">
          {running
            ? paused
              ? "Paused"
              : "Running"
            : lastSessionDurationMs > 0
              ? `Last ${formatTimerDuration(lastSessionDurationMs)}`
              : "Ready"}
        </span>
      </div>

      <div
        className="timer-card timer-card--stopwatch"
        data-active={stopwatchRunning}
      >
        <div className="timer-card-head">
          <span className="timer-label">Stopwatch</span>
          <div className="timer-actions">
            <button
              type="button"
              className="timer-btn timer-btn-primary"
              onClick={onStopwatchToggle}
            >
              {stopwatchButtonLabel}
            </button>
            <button
              type="button"
              className="timer-btn"
              onClick={onStopwatchReset}
              disabled={!stopwatchRunning && stopwatchElapsedMs === 0}
            >
              Reset
            </button>
          </div>
        </div>
        <TimerValue value={stopwatchElapsedMs} />
        <span className="timer-subvalue">
          {stopwatchRunning ? "Counting" : "Independent timer"}
        </span>
      </div>

      <div
        className="timer-card timer-card--countdown"
        data-active={settings.timeLimitEnabled}
      >
        <div className="timer-card-head">
          <span className="timer-label">Auto-stop</span>
          <button
            type="button"
            className={`timer-pill-toggle ${settings.timeLimitEnabled ? "active" : ""}`}
            onClick={handleCountdownToggle}
            aria-pressed={settings.timeLimitEnabled}
            disabled={running}
            title={
              running ? "Countdown changes apply before starting" : undefined
            }
          >
            {settings.timeLimitEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className="timer-countdown-controls">
          <input
            className="timer-countdown-input"
            type="number"
            min={1}
            value={settings.timeLimit}
            onChange={handleCountdownValueChange}
            aria-label="Countdown duration"
            disabled={running}
          />
          <div className="timer-seg-group" aria-label="Countdown unit">
            {(["s", "m", "h"] as const).map((unit) => (
              <button
                type="button"
                key={unit}
                className={`timer-seg-btn ${settings.timeLimitUnit === unit ? "active" : ""}`}
                onClick={() => handleCountdownUnitChange(unit)}
                disabled={running}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        <span className="timer-subvalue">
          {settings.timeLimitEnabled
            ? running
              ? `${formatTimerDuration(countdownRemainingMs)} left`
              : `Stops after ${formatTimerDuration(countdownMs)}`
            : "Optional countdown"}
        </span>
      </div>
    </section>
  );
}

export default TimerWidget;
