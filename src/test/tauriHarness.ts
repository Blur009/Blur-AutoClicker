import { createDefaultSettings, type Settings } from "../settingsSchema";

export type InvokeRecord = {
  command: string;
  args: Record<string, unknown> | undefined;
};

export type EmitRecord = {
  event: string;
  payload: unknown;
};

export type WindowRecord = {
  method: string;
  args: unknown[];
};

export type SequenceEntry = {
  kind: "invoke" | "emit" | "window" | "exit";
  name: string;
};

type InvokeHandler = (args: Record<string, unknown> | undefined) => unknown;
type CloseRequestedHandler = (event: { preventDefault: () => void }) => void;

type HarnessState = {
  invokes: InvokeRecord[];
  exits: number[];
  emits: EmitRecord[];
  sequence: SequenceEntry[];
  windowCalls: WindowRecord[];
  storedSettings: Settings;
  savedSettings: Settings[];
  loadError: unknown;
  recoveryWarning: string | null;
  invokeResults: Map<string, unknown>;
  invokeHandlers: Map<string, InvokeHandler>;
  closeRequestedHandler: CloseRequestedHandler | null;
  listeners: BackendListener[];
};

type BackendListener = {
  event: string;
  handler: (event: { event: string; payload: unknown }) => void;
};

const APP_INFO = {
  version: "3.9.6",
  updateStatus: "Update checks are disabled in development",
  screenshotProtectionSupported: false,
  portable: false,
};

const CLICKER_STATUS = {
  running: false,
  paused: false,
  clickCount: 0,
  lastError: null,
  stopReason: null,
  warning: null,
  activeClickPointIndex: null,
  activeClickPointTick: 0,
  masterAllowed: true,
  elevationBlocked: false,
  elevationBlockedWindow: null,
};

const STATS_OVERVIEW = {
  totals: { totalClicks: 0, totalTimeSecs: 0, totalSessions: 0, avgCpu: 0 },
  clicksPerSec: 0,
  activeDays: 0,
  legacyRuns: 0,
  legacyClicks: 0,
  longestRun: null,
  currentStreakDays: 0,
  longestStreakDays: 0,
  clickedToday: false,
  daily: [],
};

const DEFAULT_INVOKE_RESULTS: Record<string, unknown> = {
  get_text_scale_factor: 1,
  get_app_info: APP_INFO,
  get_status: CLICKER_STATUS,
  was_autostart_launch: false,
  get_elevation_state: { elevated: false, canElevate: false },
  set_accent_color: null,
  set_webview_zoom: null,
  get_cursor_position: null,
  register_master: null,
  set_elevation_notice_enabled: null,
  prepare_main_window: null,
  report_startup_ready: null,
  update_settings: null,
  reset_settings: null,
  set_autostart_enabled: null,
  clear_elevation_blocked: null,
  check_for_updates: null,
  list_font_families: [],
  get_autostart_enabled: false,
  get_stats_overview: STATS_OVERVIEW,
  list_processes: [],
  fetch_changelog: "",
};

function initialState(): HarnessState {
  return {
    invokes: [],
    exits: [],
    emits: [],
    sequence: [],
    windowCalls: [],
    storedSettings: createDefaultSettings("0.0.0"),
    savedSettings: [],
    loadError: null,
    recoveryWarning: null,
    invokeResults: new Map(),
    invokeHandlers: new Map(),
    closeRequestedHandler: null,
    listeners: [],
  };
}

const state = initialState();

function recordWindowCall(method: string, args: unknown[]) {
  state.windowCalls.push({ method, args });
  state.sequence.push({ kind: "window", name: method });
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  state.invokes.push({ command, args });
  state.sequence.push({ kind: "invoke", name: command });

  const handler = state.invokeHandlers.get(command);
  if (handler) {
    return (await handler(args)) as T;
  }
  if (state.invokeResults.has(command)) {
    return state.invokeResults.get(command) as T;
  }
  if (command in DEFAULT_INVOKE_RESULTS) {
    const value = DEFAULT_INVOKE_RESULTS[command];
    return (typeof value === "object" ? structuredClone(value) : value) as T;
  }
  return undefined as T;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  state.emits.push({ event, payload });
  state.sequence.push({ kind: "emit", name: event });
}

export async function listen(
  event: string,
  handler: (event: { event: string; payload: unknown }) => void,
): Promise<() => void> {
  const listener = { event, handler };
  state.listeners.push(listener);
  return () => {
    const index = state.listeners.indexOf(listener);
    if (index >= 0) state.listeners.splice(index, 1);
  };
}

export function emitBackendEvent(event: string, payload?: unknown) {
  for (const listener of [...state.listeners]) {
    if (listener.event === event) {
      listener.handler({ event, payload });
    }
  }
}

export function convertFileSrc(path: string): string {
  return `asset://localhost/${path}`;
}

export class LogicalSize {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export class PhysicalPosition {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

const appWindow = {
  setAlwaysOnTop: async (value: boolean) => {
    recordWindowCall("setAlwaysOnTop", [value]);
  },
  outerPosition: async () => {
    recordWindowCall("outerPosition", []);
    return { x: 10, y: 20 };
  },
  center: async () => {
    recordWindowCall("center", []);
  },
  setSize: async (size: unknown) => {
    recordWindowCall("setSize", [size]);
  },
  setPosition: async (position: unknown) => {
    recordWindowCall("setPosition", [position]);
  },
  show: async () => {
    recordWindowCall("show", []);
  },
  hide: async () => {
    recordWindowCall("hide", []);
  },
  minimize: async () => {
    recordWindowCall("minimize", []);
  },
  close: async () => {
    recordWindowCall("close", []);
  },
  setFocus: async () => {
    recordWindowCall("setFocus", []);
  },
  innerSize: async () => ({ width: 750, height: 220 }),
  scaleFactor: async () => 1,
  onResized: async () => () => {},
  onCloseRequested: async (handler: CloseRequestedHandler) => {
    recordWindowCall("onCloseRequested", []);
    state.closeRequestedHandler = handler;
    return () => {
      if (state.closeRequestedHandler === handler) {
        state.closeRequestedHandler = null;
      }
    };
  },
};

export function getCurrentWindow() {
  return appWindow;
}

export async function currentMonitor() {
  return {
    name: "mock-monitor",
    scaleFactor: 1,
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1040 },
    },
  };
}

export async function monitorFromPoint() {
  return { name: "mock-monitor" };
}

export function reset() {
  const fresh = initialState();
  state.invokes = fresh.invokes;
  state.exits = fresh.exits;
  state.emits = fresh.emits;
  state.sequence = fresh.sequence;
  state.windowCalls = fresh.windowCalls;
  state.storedSettings = fresh.storedSettings;
  state.savedSettings = fresh.savedSettings;
  state.loadError = fresh.loadError;
  state.recoveryWarning = fresh.recoveryWarning;
  state.invokeResults = fresh.invokeResults;
  state.invokeHandlers = fresh.invokeHandlers;
  state.closeRequestedHandler = fresh.closeRequestedHandler;
  state.listeners = fresh.listeners;
}

export function setStoredSettings(overrides: Partial<Settings>) {
  state.storedSettings = {
    ...createDefaultSettings("0.0.0"),
    ...overrides,
  };
}

export function failLoadSettings(error: unknown) {
  state.loadError = error;
}

export function setRecoveryWarning(warning: string | null) {
  state.recoveryWarning = warning;
}

export function setInvokeResult(command: string, value: unknown) {
  state.invokeResults.set(command, value);
}

export function setInvokeHandler(command: string, handler: InvokeHandler) {
  state.invokeHandlers.set(command, handler);
}

export function invokes(command?: string): InvokeRecord[] {
  if (command === undefined) return state.invokes;
  return state.invokes.filter((record) => record.command === command);
}

export function emits(event?: string): EmitRecord[] {
  if (event === undefined) return state.emits;
  return state.emits.filter((record) => record.event === event);
}

export function firstIndexOf(kind: SequenceEntry["kind"], name: string) {
  return state.sequence.findIndex(
    (entry) => entry.kind === kind && entry.name === name,
  );
}

export function windowCalls(method?: string): WindowRecord[] {
  if (method === undefined) return state.windowCalls;
  return state.windowCalls.filter((record) => record.method === method);
}

export function requestClose(): boolean {
  const handler = state.closeRequestedHandler;
  if (!handler) throw new Error("No close handler registered");
  let prevented = false;
  handler({
    preventDefault: () => {
      prevented = true;
    },
  });
  return prevented;
}

export function savedSettings(): Settings[] {
  return state.savedSettings;
}

export const tauri = {
  reset,
  setStoredSettings,
  savedSettings,
  failLoadSettings,
  setRecoveryWarning,
  setInvokeResult,
  setInvokeHandler,
  invokes,
  exits: () => [...state.exits],
  emits,
  emitBackendEvent,
  firstIndexOf,
  windowCalls,
  requestClose,
};

export function registerHotkeyEcho(args: Record<string, unknown> | undefined) {
  return args?.hotkey;
}

export async function loadStoredSettings(): Promise<Settings> {
  if (state.loadError) {
    throw state.loadError;
  }
  return state.storedSettings;
}

export async function saveStoredSettings(settings: Settings): Promise<void> {
  state.savedSettings.push(structuredClone(settings));
}

export async function clearStoredSettings(): Promise<void> {}

export function recoveryWarning(): string | null {
  return state.recoveryWarning;
}

export const coreModule = { invoke, convertFileSrc };

export const eventModule = { emit, listen };

export const windowModule = {
  getCurrentWindow,
  currentMonitor,
  monitorFromPoint,
  LogicalSize,
  PhysicalPosition,
};

export const dialogModule = {
  open: async () => null,
  save: async () => null,
};

export const processModule = {
  exit: async (code?: number) => {
    state.exits.push(code ?? 0);
    state.sequence.push({ kind: "exit", name: "exit" });
  },
};

export const storeModule = {
  APP_VERSION: "0.0.0",
  DEFAULT_SETTINGS: createDefaultSettings("0.0.0"),
  initAppVersion: async () => {},
  loadSettings: loadStoredSettings,
  saveSettings: saveStoredSettings,
  clearSavedSettings: clearStoredSettings,
  settingsRecoveryWarning: recoveryWarning,
  isPortableMode: async () => false,
};

export function installBrowserGlobals() {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(
        () => callback(performance.now()),
        0,
      )) as unknown as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      clearTimeout(
        handle,
      )) as unknown as typeof globalThis.cancelAnimationFrame;
  }
}
