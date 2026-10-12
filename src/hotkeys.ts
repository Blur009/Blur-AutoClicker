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

const MODIFIER_CODE_MAIN_KEY_MAP: Record<string, string> = {
  ControlLeft: "leftctrl",
  ControlRight: "rightctrl",
  ShiftLeft: "leftshift",
  ShiftRight: "rightshift",
  AltLeft: "leftalt",
  AltRight: "rightalt",
  MetaLeft: "leftsuper",
  MetaRight: "rightsuper",
  OSLeft: "leftsuper",
  OSRight: "rightsuper",
};

const SHIFTED_SYMBOL_BASE_MAP: Record<string, string> = {
  "?": "/",
  ":": ";",
  '"': "'",
  "{": "[",
  "}": "]",
  "|": "\\",
  "+": "=",
  _: "-",
  "~": "`",
  ">": "<",
};

const NUMPAD_CODE_MAP: Record<string, string> = {
  Numpad0: "numpad0",
  Numpad1: "numpad1",
  Numpad2: "numpad2",
  Numpad3: "numpad3",
  Numpad4: "numpad4",
  Numpad5: "numpad5",
  Numpad6: "numpad6",
  Numpad7: "numpad7",
  Numpad8: "numpad8",
  Numpad9: "numpad9",
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

const MOUSE_TOKEN_MAP: Record<string, string> = {
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

const NUMPAD_TOKEN_MAP: Record<string, string> = {
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

const NAMED_KEY_MAP: Record<string, string> = {
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
  leftctrl: "leftctrl",
  ctrlleft: "leftctrl",
  lctrl: "leftctrl",
  rightctrl: "rightctrl",
  ctrlright: "rightctrl",
  rctrl: "rightctrl",
  leftshift: "leftshift",
  shiftleft: "leftshift",
  lshift: "leftshift",
  rightshift: "rightshift",
  shiftright: "rightshift",
  rshift: "rightshift",
  leftalt: "leftalt",
  altleft: "leftalt",
  lalt: "leftalt",
  rightalt: "rightalt",
  altright: "rightalt",
  ralt: "rightalt",
  altgr: "rightalt",
  leftsuper: "leftsuper",
  superleft: "leftsuper",
  leftwin: "leftsuper",
  winleft: "leftsuper",
  lwin: "leftsuper",
  rightsuper: "rightsuper",
  superright: "rightsuper",
  rightwin: "rightsuper",
  winright: "rightsuper",
  rwin: "rightsuper",
};

const NAMED_DISPLAY_MAP: Record<string, string> = {
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
  leftctrl: "Left Ctrl",
  rightctrl: "Right Ctrl",
  leftshift: "Left Shift",
  rightshift: "Right Shift",
  leftalt: "Left Alt",
  rightalt: "Right Alt",
  leftsuper: "Left Super",
  rightsuper: "Right Super",
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

export type HotkeyDisplayLabels = {
  empty: string;
  modifiers: Record<"ctrl" | "alt" | "shift" | "super", string>;
  keys: Partial<Record<string, string>>;
};

export const defaultHotkeyLabels: HotkeyDisplayLabels = {
  empty: "No hotkey set",
  modifiers: {
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    super: "Super",
  },
  keys: {
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
    leftctrl: "Left Ctrl",
    rightctrl: "Right Ctrl",
    leftshift: "Left Shift",
    rightshift: "Right Shift",
    leftalt: "Left Alt",
    rightalt: "Right Alt",
    leftsuper: "Left Super",
    rightsuper: "Right Super",
    mouseleft: "Mouse Left",
    mouseright: "Mouse Right",
    mousemiddle: "Scroll Button",
    mouse4: "Mouse Back",
    mouse5: "Mouse Forward",
    numpad0: "Num 0",
    numpad1: "Num 1",
    numpad2: "Num 2",
    numpad3: "Num 3",
    numpad4: "Num 4",
    numpad5: "Num 5",
    numpad6: "Num 6",
    numpad7: "Num 7",
    numpad8: "Num 8",
    numpad9: "Num 9",
    numpadadd: "Num +",
    numpadsubtract: "Num -",
    numpadmultiply: "Num *",
    numpaddivide: "Num /",
    numpaddecimal: "Num .",
  },
};

let layoutMapPromise: Promise<LayoutMapLike | null> | null = null;

function normalizeModifierToken(token: string): string | null {
  return MODIFIER_ALIASES[token.trim().toLowerCase()] ?? null;
}

function normalizeMouseToken(token: string): string | null {
  const lower = token.trim().toLowerCase();
  return MOUSE_TOKEN_MAP[lower] ?? null;
}

function normalizeNumpadToken(token: string): string | null {
  const lower = token.trim().toLowerCase();

  if (/^numpad[0-9]$/.test(lower)) {
    return lower;
  }

  if (/^num[0-9]$/.test(lower)) {
    return `numpad${lower.slice(3)}`;
  }

  return NUMPAD_TOKEN_MAP[lower] ?? null;
}

function normalizeNamedKey(key: string): string | null {
  const lower = key.toLowerCase();

  if (/^f\d{1,2}$/i.test(key)) {
    return lower;
  }

  return NAMED_KEY_MAP[lower] ?? null;
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
    SHIFTED_SYMBOL_BASE_MAP[key] ??
    (key.length === 1 ? key.toLowerCase() : null)
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

const HELD_ORDER = [
  "ctrl",
  "leftctrl",
  "rightctrl",
  "alt",
  "leftalt",
  "rightalt",
  "shift",
  "leftshift",
  "rightshift",
  "super",
  "leftsuper",
  "rightsuper",
];

export function sortHeld(held: string[]): string[] {
  return [...held].sort(
    (a, b) => HELD_ORDER.indexOf(a) - HELD_ORDER.indexOf(b),
  );
}

function normalizeMainKeyForStorage(raw: string): string {
  if (/^Key[A-Z]$/.test(raw)) return raw.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(raw)) return raw.slice(5);
  return raw.toLowerCase();
}

export function getMainKey(
  event: Pick<KeyboardCaptureEvent, "key" | "code" | "location">,
): string | null {
  const lowerKey = event.key.toLowerCase();
  if (MODIFIER_KEYS.has(lowerKey)) return null;
  if (event.code && MODIFIER_CODES.has(event.code)) return null;
  if (lowerKey === "escape" || event.code === "Escape") return null;
  const raw =
    (event.code
      ? mainKeyFromCode(event.code, event.key, event.location)
      : null) ?? mainKeyFromKey(event.key);
  if (!raw) return null;
  return normalizeMainKeyForStorage(raw);
}

export const MAX_CHORD_MAINS = 5;

export function buildHotkeyWithHeld(mainKey: string, held: string[]): string {
  if (held.length === 0) return normalizeMainKeyForStorage(mainKey);
  return `${sortHeld(held).join("+")}+${normalizeMainKeyForStorage(mainKey)}`;
}

export function buildChordHotkey(
  mains: string[],
  held: string[],
): string | null {
  if (mains.length === 0) return null;
  if (mains.length > MAX_CHORD_MAINS) return null;
  const normalized = mains.map((m) => normalizeMainKeyForStorage(m)).sort();
  if (new Set(normalized).size !== normalized.length) return null;
  const prefix = held.length > 0 ? `${sortHeld(held).join("+")}+` : "";
  return `${prefix}${normalized.join("+")}`;
}

const SIDE_MODIFIER_TOKENS = new Set([
  "leftctrl",
  "ctrlleft",
  "lctrl",
  "rightctrl",
  "ctrlright",
  "rctrl",
  "leftalt",
  "altleft",
  "lalt",
  "rightalt",
  "altright",
  "ralt",
  "altgr",
  "leftshift",
  "shiftleft",
  "lshift",
  "rightshift",
  "shiftright",
  "rshift",
  "leftsuper",
  "superleft",
  "leftwin",
  "winleft",
  "lwin",
  "rightsuper",
  "superright",
  "rightwin",
  "winright",
  "rwin",
]);

const LEFT_CTRL_TOKENS = new Set(["leftctrl", "ctrlleft", "lctrl"]);
const RIGHT_CTRL_TOKENS = new Set(["rightctrl", "ctrlright", "rctrl"]);
const LEFT_ALT_TOKENS = new Set(["leftalt", "altleft", "lalt"]);
const RIGHT_ALT_TOKENS = new Set(["rightalt", "altright", "ralt", "altgr"]);
const LEFT_SHIFT_TOKENS = new Set(["leftshift", "shiftleft", "lshift"]);
const RIGHT_SHIFT_TOKENS = new Set(["rightshift", "shiftright", "rshift"]);
const LEFT_SUPER_TOKENS = new Set([
  "leftsuper",
  "superleft",
  "leftwin",
  "winleft",
  "lwin",
]);
const RIGHT_SUPER_TOKENS = new Set([
  "rightsuper",
  "superright",
  "rightwin",
  "winright",
  "rwin",
]);

export function hotkeyMainKeys(hotkey: string): string[] {
  if (!hotkey) return [];
  const parts = hotkey
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  // solo side modifier is treated as main (backend early return for SIDE_VKS)
  if (parts.length === 1 && SIDE_MODIFIER_TOKENS.has(parts[0]!)) {
    return [parts[0]!];
  }
  const mains: string[] = [];
  for (const p of parts) {
    if (SIDE_MODIFIER_TOKENS.has(p)) continue;
    const mod = normalizeModifierToken(p);
    if (mod) continue;
    mains.push(p);
  }
  return mains;
}

function displayTokenFromStoredValue(
  token: string,
  layoutMap: LayoutMapLike | null,
  labels?: HotkeyDisplayLabels,
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

  if (NUMPAD_CODE_MAP[trimmed]) {
    return displayTokenFromStoredValue(
      NUMPAD_CODE_MAP[trimmed],
      layoutMap,
      labels,
    );
  }

  const lower = trimmed.toLowerCase();

  if (/^numpad[0-9]$/.test(lower)) {
    return `Num ${lower.slice(6)}`;
  }

  if (NAMED_DISPLAY_MAP[lower]) {
    return labels?.keys[lower] ?? NAMED_DISPLAY_MAP[lower];
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
    const keyboard = (
      navigator as Navigator & {
        keyboard?: { getLayoutMap?: () => Promise<LayoutMapLike> };
      }
    ).keyboard;

    layoutMapPromise = keyboard?.getLayoutMap
      ? keyboard.getLayoutMap().catch(() => null)
      : Promise.resolve(null);
  }

  return layoutMapPromise;
}

export async function canonicalizeHotkeyForBackend(
  value: string,
): Promise<string> {
  const layoutMap = await getKeyboardLayoutMap();
  return canonicalizeHotkeyString(value, layoutMap);
}

export function captureModifierHotkey(
  event: KeyboardCaptureEvent,
): string | null {
  if (event.code) {
    const codeMapped = MODIFIER_CODE_MAIN_KEY_MAP[event.code];
    if (codeMapped) return codeMapped;
  }

  const lowerKey = event.key.toLowerCase();
  if (!MODIFIER_KEYS.has(lowerKey)) return null;

  const side = event.location === 2 ? "right" : "left";
  if (lowerKey === "control" || lowerKey === "ctrl") return `${side}ctrl`;
  if (lowerKey === "shift") return `${side}shift`;
  if (lowerKey === "alt" || lowerKey === "altgraph") return `${side}alt`;
  if (lowerKey === "meta" || lowerKey === "os") return `${side}super`;

  return null;
}

export function captureHotkey(event: KeyboardCaptureEvent): string | null {
  const lowerKey = event.key.toLowerCase();

  if (MODIFIER_KEYS.has(lowerKey)) return null;
  if (event.code && MODIFIER_CODES.has(event.code)) return null;
  if (lowerKey === "escape" || event.code === "Escape") return null;

  const mainKey =
    (event.code
      ? mainKeyFromCode(event.code, event.key, event.location)
      : null) ?? mainKeyFromKey(event.key);

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
  labels?: HotkeyDisplayLabels,
): string {
  if (!value) return labels?.empty ?? "Click and press keys";

  return value
    .split("+")
    .map((part) => {
      const lower = part.trim().toLowerCase();
      const aliasCanonical = normalizeNamedKey(lower) ?? lower;
      const modifier = normalizeModifierToken(aliasCanonical);
      if (modifier) {
        if (modifier === "ctrl") return labels?.modifiers.ctrl ?? "Ctrl";
        if (modifier === "alt") return labels?.modifiers.alt ?? "Alt";
        if (modifier === "shift") return labels?.modifiers.shift ?? "Shift";
        return labels?.modifiers.super ?? "Super";
      }

      const display = displayTokenFromStoredValue(
        aliasCanonical,
        layoutMap,
        labels,
      );
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
  let leftCtrl = false;
  let rightCtrl = false;
  let leftAlt = false;
  let rightAlt = false;
  let leftShift = false;
  let rightShift = false;
  let leftSuper = false;
  let rightSuper = false;
  const mainKeys: string[] = [];

  for (const rawPart of value.split("+")) {
    const part = rawPart.trim().toLowerCase();
    if (!part) continue;

    // side-specific first
    if (LEFT_CTRL_TOKENS.has(part)) {
      leftCtrl = true;
      continue;
    }
    if (RIGHT_CTRL_TOKENS.has(part)) {
      rightCtrl = true;
      continue;
    }
    if (LEFT_ALT_TOKENS.has(part)) {
      leftAlt = true;
      continue;
    }
    if (RIGHT_ALT_TOKENS.has(part)) {
      rightAlt = true;
      continue;
    }
    if (LEFT_SHIFT_TOKENS.has(part)) {
      leftShift = true;
      continue;
    }
    if (RIGHT_SHIFT_TOKENS.has(part)) {
      rightShift = true;
      continue;
    }
    if (LEFT_SUPER_TOKENS.has(part)) {
      leftSuper = true;
      continue;
    }
    if (RIGHT_SUPER_TOKENS.has(part)) {
      rightSuper = true;
      continue;
    }

    const modifier = normalizeModifierToken(part);
    if (modifier) {
      if (modifier === "ctrl") ctrl = true;
      if (modifier === "alt") alt = true;
      if (modifier === "shift") shift = true;
      if (modifier === "super") superKey = true;
      continue;
    }

    mainKeys.push(normalizeStoredMainKey(part, layoutMap));
  }

  // chord: sort lexical (keep duplicates so backend can reject)
  const sortedMains = [...mainKeys].sort();
  const parts: string[] = [];
  if (ctrl) parts.push("ctrl");
  if (leftCtrl) parts.push("leftctrl");
  if (rightCtrl) parts.push("rightctrl");
  if (alt) parts.push("alt");
  if (leftAlt) parts.push("leftalt");
  if (rightAlt) parts.push("rightalt");
  if (shift) parts.push("shift");
  if (leftShift) parts.push("leftshift");
  if (rightShift) parts.push("rightshift");
  if (superKey) parts.push("super");
  if (leftSuper) parts.push("leftsuper");
  if (rightSuper) parts.push("rightsuper");
  for (const mk of sortedMains) parts.push(mk);
  return parts.join("+");
}

export function hotkeyMainKey(hotkey: string): string | null {
  if (!hotkey) return null;
  const mains = hotkeyMainKeys(hotkey);
  if (mains.length > 0) return mains[mains.length - 1] ?? null;
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase());
  return parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;
}

export function hotkeyModifiers(hotkey: string): string[] {
  const mains = hotkeyMainKeys(hotkey);
  const allParts = hotkey
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  // solo side modifier is main, not modifier
  if (allParts.length === 1 && SIDE_MODIFIER_TOKENS.has(allParts[0]!)) {
    return [];
  }
  return allParts.filter((p) => {
    if (SIDE_MODIFIER_TOKENS.has(p)) {
      // if this side token is also a main (solo case), don't count as modifier
      if (mains.includes(p)) return false;
      return true;
    }
    return normalizeModifierToken(p) !== null;
  });
}

export function conflictsWithAutoPressKey(
  hotkey: string,
  keyboardKey: string,
  keyboardKeyCaseIsUpper: boolean,
): boolean {
  if (!hotkey || !keyboardKey) return false;
  const mains = hotkeyMainKeys(hotkey);
  const modifiers = hotkeyModifiers(hotkey);
  const kbKey = keyboardKey.toLowerCase();
  // chord hotkeys need both mains, single auto key never triggers loop
  if (mains.length !== 1 || mains[0] !== kbKey) return false;
  if (modifiers.length === 0) return true;
  if (
    keyboardKeyCaseIsUpper &&
    modifiers.length === 1 &&
    modifiers[0] === "shift"
  )
    return true;
  return false;
}

export function getStateClass(
  listening: boolean,
  hasConflict: boolean,
  hasValue: boolean,
): string {
  if (listening) return "hk-listening";
  if (hasConflict) return "hk-conflict";
  if (hasValue) return "hk-idle-set";
  return "hk-idle-empty";
}
