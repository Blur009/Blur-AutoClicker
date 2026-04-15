const MODIFIER_ALIASES: Record<string, string> = {
  control: "ctrl",
  ctrl: "ctrl",
  option: "alt",
  alt: "alt",
  shift: "shift",
  meta: "super",
  command: "super",
  cmd: "super",
  super: "super",
  win: "super",
};

const MODIFIER_KEYS = new Set([
  "control",
  "ctrl",
  "shift",
  "alt",
  "meta",
  "os",
  "altgraph",
]);

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

const SHIFTED_SYMBOL_BASE_MAP: Record<string, string> = {
  "?": "/",
  ":": ";",
  "\"": "'",
  "{": "[",
  "}": "]",
  "|": "\\",
  "+": "=",
  "_": "-",
  "~": "`",
  ">": "<",
};

const KEY_CODE_MAIN_KEY_MAP: Record<string, string> = {
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Tab: "tab",
  Space: "space",
  Escape: "escape",
  CapsLock: "capslock",
  NumLock: "numlock",
  ScrollLock: "scrolllock",
  PrintScreen: "printscreen",
  Pause: "pause",
  ContextMenu: "menu",
  NumpadAdd: "numpadadd",
  NumpadSubtract: "numpadsubtract",
  NumpadMultiply: "numpadmultiply",
  NumpadDivide: "numpaddivide",
  NumpadDecimal: "numpaddecimal",
};

const NUMPAD_LOCATION_KEY_MAP: Record<string, string> = {
  "0": "numpad0",
  "1": "numpad1",
  "2": "numpad2",
  "3": "numpad3",
  "4": "numpad4",
  "5": "numpad5",
  "6": "numpad6",
  "7": "numpad7",
  "8": "numpad8",
  "9": "numpad9",
  "+": "numpadadd",
  "-": "numpadsubtract",
  "*": "numpadmultiply",
  "/": "numpaddivide",
  ".": "numpaddecimal",
};

type LayoutMapLike = {
  get(code: string): string | undefined;
};

type KeyboardCaptureEvent = {
  key: string;
  code?: string;
  location?: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

type MouseCaptureEvent = {
  button: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

let layoutMapPromise: Promise<LayoutMapLike | null> | null = null;

function normalizeModifierToken(token: string): string | null {
  return MODIFIER_ALIASES[token.trim().toLowerCase()] ?? null;
}

function normalizeMouseToken(token: string): string | null {
  const lower = token.trim().toLowerCase();

  const mouseMap: Record<string, string> = {
    mouseleft: "mouseleft",
    leftmouse: "mouseleft",
    leftbutton: "mouseleft",
    mouse1: "mouseleft",
    lmb: "mouseleft",
    mouseright: "mouseright",
    rightmouse: "mouseright",
    rightbutton: "mouseright",
    mouse2: "mouseright",
    rmb: "mouseright",
    mousemiddle: "mousemiddle",
    middlemouse: "mousemiddle",
    middlebutton: "mousemiddle",
    mouse3: "mousemiddle",
    mmb: "mousemiddle",
    scrollbutton: "mousemiddle",
    middleclick: "mousemiddle",
    mouse4: "mouse4",
    xbutton1: "mouse4",
    mouseback: "mouse4",
    browserback: "mouse4",
    backbutton: "mouse4",
    mouse5: "mouse5",
    xbutton2: "mouse5",
    mouseforward: "mouse5",
    browserforward: "mouse5",
    forwardbutton: "mouse5",
  };

  return mouseMap[lower] ?? null;
}

function normalizeNumpadToken(token: string): string | null {
  const lower = token.trim().toLowerCase();

  if (/^numpad[0-9]$/.test(lower)) {
    return lower;
  }

  if (/^num[0-9]$/.test(lower)) {
    return `numpad${lower.slice(3)}`;
  }

  const numpadMap: Record<string, string> = {
    numpadadd: "numpadadd",
    numadd: "numpadadd",
    numplus: "numpadadd",
    numpadplus: "numpadadd",
    numpadsubtract: "numpadsubtract",
    numsubtract: "numpadsubtract",
    numsub: "numpadsubtract",
    numminus: "numpadsubtract",
    numpadminus: "numpadsubtract",
    numpadmultiply: "numpadmultiply",
    nummultiply: "numpadmultiply",
    nummul: "numpadmultiply",
    numpadmul: "numpadmultiply",
    numpaddivide: "numpaddivide",
    numdivide: "numpaddivide",
    numdiv: "numpaddivide",
    numpaddiv: "numpaddivide",
    numpaddecimal: "numpaddecimal",
    numdecimal: "numpaddecimal",
    numdot: "numpaddecimal",
    numdel: "numpaddecimal",
    numpadpoint: "numpaddecimal",
  };

  return numpadMap[lower] ?? null;
}

function normalizeNamedKey(key: string): string | null {
  const lower = key.toLowerCase();

  const keyMap: Record<string, string> = {
    enter: "enter",
    tab: "tab",
    spacebar: "space",
    backspace: "backspace",
    delete: "delete",
    insert: "insert",
    home: "home",
    end: "end",
    pageup: "pageup",
    pagedown: "pagedown",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
    capslock: "capslock",
    numlock: "numlock",
    scrolllock: "scrolllock",
    printscreen: "printscreen",
    pause: "pause",
    break: "pause",
    contextmenu: "menu",
    apps: "menu",
    menu: "menu",
    escape: "escape",
    esc: "escape",
  };

  if (/^f\d{1,2}$/i.test(key)) {
    return lower;
  }

  return keyMap[lower] ?? null;
}

function mainKeyFromCode(
  code: string,
  key: string,
  location?: number,
): string | null {
  if (code === "IntlBackslash") {
    return "IntlBackslash";
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code;
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code;
  }

  if (/^Numpad[0-9]$/.test(code)) {
    return `numpad${code.slice(6)}`;
  }

  if (location === 3) {
    const locationMapped = NUMPAD_LOCATION_KEY_MAP[key.toLowerCase()];
    if (locationMapped) {
      return locationMapped;
    }
  }

  return KEY_CODE_MAIN_KEY_MAP[code] ?? null;
}

function mainKeyFromKey(key: string): string | null {
  if (key === " ") return "space";

  const normalizedNamedKey = normalizeNamedKey(key);
  return (
    normalizedNamedKey ??
    normalizeNumpadToken(key) ??
    normalizeMouseToken(key) ??
    (SHIFTED_SYMBOL_BASE_MAP[key] ?? (key.length === 1 ? key.toLowerCase() : null))
  );
}

function buildHotkeyString(
  mainKey: string,
  event: Pick<
    KeyboardCaptureEvent,
    "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
  >,
): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("super");
  parts.push(mainKey);
  return parts.join("+");
}

function displayTokenFromStoredValue(
  token: string,
  layoutMap: LayoutMapLike | null,
): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;

  if (trimmed === "IntlBackslash") {
    return layoutMap?.get("IntlBackslash") ?? "<";
  }

  if (/^Key[A-Z]$/.test(trimmed)) {
    const mapped = layoutMap?.get(trimmed);
    if (mapped) return mapped;
    return trimmed.slice(3).toLowerCase();
  }

  if (/^Digit[0-9]$/.test(trimmed)) {
    return trimmed.slice(5);
  }

  if (/^Numpad[0-9]$/.test(trimmed)) {
    return `Num ${trimmed.slice(6)}`;
  }

  const lower = trimmed.toLowerCase();

  if (/^numpad[0-9]$/.test(lower)) {
    return `Num ${lower.slice(6)}`;
  }

  const namedDisplayMap: Record<string, string> = {
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    pageup: "Page Up",
    pagedown: "Page Down",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    enter: "Enter",
    tab: "Tab",
    space: "Space",
    escape: "Esc",
    esc: "Esc",
    capslock: "Caps Lock",
    numlock: "Num Lock",
    scrolllock: "Scroll Lock",
    printscreen: "Print Screen",
    pause: "Pause",
    menu: "Menu",
    numpadadd: "Num +",
    numpadsubtract: "Num -",
    numpadmultiply: "Num *",
    numpaddivide: "Num /",
    numpaddecimal: "Num .",
    mouseleft: "Mouse Left",
    mouseright: "Mouse Right",
    mousemiddle: "Mouse Middle",
    mouse4: "Mouse Back",
    mouse5: "Mouse Forward",
  };

  if (namedDisplayMap[lower]) {
    return namedDisplayMap[lower];
  }

  return trimmed;
}

function normalizeStoredMainKey(
  token: string,
  layoutMap: LayoutMapLike | null,
): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;

  if (trimmed === "IntlBackslash") {
    return "IntlBackslash";
  }

  if (/^Key[A-Z]$/.test(trimmed)) {
    const mapped = layoutMap?.get(trimmed);
    return mapped ? mapped.toLowerCase() : trimmed.slice(3).toLowerCase();
  }

  if (/^Digit[0-9]$/.test(trimmed)) {
    return trimmed.slice(5);
  }

  if (/^Numpad[0-9]$/.test(trimmed)) {
    return `numpad${trimmed.slice(6)}`;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "<" || lower === ">" || lower === "intlbackslash") {
    return "IntlBackslash";
  }

  if (SHIFTED_SYMBOL_BASE_MAP[trimmed]) {
    return SHIFTED_SYMBOL_BASE_MAP[trimmed];
  }

  return (
    normalizeMouseToken(trimmed) ??
    normalizeNumpadToken(trimmed) ??
    normalizeNamedKey(trimmed) ??
    lower
  );
}

export async function getKeyboardLayoutMap(): Promise<LayoutMapLike | null> {
  if (!layoutMapPromise) {
    const keyboard = (navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<LayoutMapLike> };
    }).keyboard;

    layoutMapPromise = keyboard?.getLayoutMap
      ? keyboard.getLayoutMap().catch(() => null)
      : Promise.resolve(null);
  }

  return layoutMapPromise;
}

export async function canonicalizeHotkeyForBackend(value: string): Promise<string> {
  const layoutMap = await getKeyboardLayoutMap();
  return canonicalizeHotkeyString(value, layoutMap);
}

export function captureHotkey(event: KeyboardCaptureEvent): string | null {
  const lowerKey = event.key.toLowerCase();

  if (MODIFIER_KEYS.has(lowerKey)) return null;
  if (event.code && MODIFIER_CODES.has(event.code)) return null;
  if (lowerKey === "escape" || event.code === "Escape") return null;

  const mainKey =
    (event.code ? mainKeyFromCode(event.code, event.key, event.location) : null) ??
    mainKeyFromKey(event.key);

  if (!mainKey) return null;

  return buildHotkeyString(mainKey, event);
}

export function captureMouseHotkey(event: MouseCaptureEvent): string | null {
  const mainKey =
    {
      0: "mouseleft",
      1: "mousemiddle",
      2: "mouseright",
      3: "mouse4",
      4: "mouse5",
    }[event.button] ?? null;

  if (!mainKey) return null;
  return buildHotkeyString(mainKey, event);
}

export function formatHotkeyForDisplay(
  value: string,
  layoutMap: LayoutMapLike | null,
): string {
  if (!value) return "Click and press keys";

  return value
    .split("+")
    .map((part) => {
      const modifier = normalizeModifierToken(part);
      if (modifier) {
        if (modifier === "ctrl") return "Ctrl";
        if (modifier === "alt") return "Alt";
        if (modifier === "shift") return "Shift";
        return "Super";
      }

      const display = displayTokenFromStoredValue(part, layoutMap);
      return display.length === 1 ? display.toUpperCase() : display;
    })
    .join(" + ");
}

function canonicalizeHotkeyString(
  value: string,
  layoutMap: LayoutMapLike | null,
): string {
  let ctrl = false;
  let alt = false;
  let shift = false;
  let superKey = false;
  let mainKey: string | null = null;

  for (const rawPart of value.split("+")) {
    const part = rawPart.trim();
    if (!part) continue;

    const modifier = normalizeModifierToken(part);
    if (modifier) {
      if (modifier === "ctrl") ctrl = true;
      if (modifier === "alt") alt = true;
      if (modifier === "shift") shift = true;
      if (modifier === "super") superKey = true;
      continue;
    }

    mainKey = normalizeStoredMainKey(part, layoutMap);
  }

  const parts: string[] = [];
  if (ctrl) parts.push("ctrl");
  if (alt) parts.push("alt");
  if (shift) parts.push("shift");
  if (superKey) parts.push("super");
  if (mainKey) parts.push(mainKey);
  return parts.join("+");
}
