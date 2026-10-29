import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface IndicatorStatus {
  enabled: boolean;
  color: string;
  flashEnabled: boolean;
  flashDim: number;
  size: number;
  active: boolean;
  theme: string;
  corner: string;
  countdown: boolean;
  countdownMode: string;
  countdownFont: number;
  backgroundMode: string;
  backgroundStrength: number;
  backgroundPad: number;
}

interface PulsePayload {
  holdMs: number;
}

interface SchedulePayload {
  cycleStartMs: number;
  holdMs: number;
  waitMs: number;
}

const stack = document.getElementById("stack");
const card = document.getElementById("card");
const countdown = document.getElementById("countdown");

const FLASH_MIN_MS = 16;
const COUNTDOWN_GRACE_MS = 300;

let flashEnabled = false;
let restingOpacity = 1;
let offTimer: number | null = null;
let countdownEnabled = false;
let countdownMode: "plain" | "short" | "words" = "words";
let scheduled = false;
let cycleStart = 0;
let holdMs = 0;
let waitMs = 0;
let frame: number | null = null;

export function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 1000) {
    return `${(Math.ceil(clamped / 100) / 10).toFixed(1)}s`;
  }

  const total = Math.ceil(clamped / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`, `${minutes}m`);
  } else if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

function phaseLabel(holding: boolean): string {
  if (countdownMode === "plain") return "";
  if (countdownMode === "words") return holding ? "Holding" : "Waiting";
  return holding ? "H" : "W";
}

function applyStatus(status: IndicatorStatus) {
  const root = document.documentElement;
  root.style.setProperty("--glyph-color", status.color);
  root.style.setProperty("--glyph-size", `${status.size}px`);
  root.style.setProperty("--countdown-font", `${status.countdownFont}px`);
  root.style.setProperty("--bg-pad", `${status.backgroundPad}px`);
  root.style.setProperty(
    "--bg-alpha",
    String(Math.min(100, Math.max(0, status.backgroundStrength)) / 100),
  );
  root.dataset.theme = status.theme === "light" ? "light" : "dark";
  const hasBackground =
    status.backgroundMode === "card" || status.backgroundMode === "shadow";
  if (card) {
    card.dataset.bg = hasBackground ? status.backgroundMode : "off";
  }
  if (stack) {
    stack.style.justifyContent = hasBackground
      ? status.corner.endsWith("right")
        ? "flex-end"
        : "flex-start"
      : "center";
    stack.style.alignItems = status.corner.startsWith("bottom")
      ? "flex-end"
      : "flex-start";
  }

  flashEnabled = status.flashEnabled;
  restingOpacity = flashEnabled
    ? 1 - Math.min(100, Math.max(0, status.flashDim)) / 100
    : 1;

  if (offTimer !== null) {
    window.clearTimeout(offTimer);
    offTimer = null;
  }
  if (stack) {
    stack.style.opacity = String(restingOpacity);
  }

  countdownEnabled = status.countdown;
  countdownMode =
    status.countdownMode === "words"
      ? "words"
      : status.countdownMode === "short"
        ? "short"
        : "plain";
  if (!countdownEnabled) {
    stopCountdown();
  }
}

function flash(payload: PulsePayload) {
  if (!stack || !flashEnabled) return;

  const duration = Math.max(FLASH_MIN_MS, payload.holdMs);

  stack.style.opacity = "1";
  if (offTimer !== null) {
    window.clearTimeout(offTimer);
  }
  offTimer = window.setTimeout(() => {
    offTimer = null;
    if (stack) {
      stack.style.opacity = String(restingOpacity);
    }
  }, duration);
}

function stopCountdown() {
  scheduled = false;
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
  if (countdown) {
    countdown.hidden = true;
    countdown.textContent = "";
  }
}

function tick() {
  frame = null;
  if (!scheduled || !countdownEnabled || !countdown) return;

  const elapsed = Math.max(0, Date.now() - cycleStart);
  const total = holdMs + waitMs;
  if (elapsed > total + COUNTDOWN_GRACE_MS) {
    stopCountdown();
    return;
  }

  const holding = elapsed < holdMs;
  const remaining = holding ? holdMs - elapsed : total - elapsed;
  const label = phaseLabel(holding);
  const time = formatDuration(remaining);
  const text = label ? `${label} ${time}` : time;
  if (countdown.textContent !== text) {
    countdown.textContent = text;
  }
  countdown.hidden = false;
  frame = requestAnimationFrame(tick);
}

function schedule(payload: SchedulePayload) {
  if (!countdownEnabled || !countdown) return;

  cycleStart = payload.cycleStartMs;
  holdMs = payload.holdMs;
  waitMs = payload.waitMs;
  scheduled = true;
  if (frame === null) {
    frame = requestAnimationFrame(tick);
  }
}

listen<IndicatorStatus>("indicator-config", (event) =>
  applyStatus(event.payload),
);
listen<PulsePayload>("indicator-pulse", (event) => flash(event.payload));
listen<SchedulePayload>("indicator-schedule", (event) =>
  schedule(event.payload),
);

invoke<IndicatorStatus>("get_indicator_config")
  .then(applyStatus)
  .catch(() => {});
