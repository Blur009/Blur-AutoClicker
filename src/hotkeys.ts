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

const MOUSE_BUTTON_ALIASES: Record<string, string> = {
  mbutton: "mbutton",
  middle: "mbutton",
  middlemouse: "mbutton",
  mouse3: "mbutton",
  mb3: "mbutton",
  wheelclick: "mbutton",
  wheelup: "wheelup",
  scrollup: "wheelup",
  mousewheelup: "wheelup",
  mwheelup: "wheelup",
  wheeldown: "wheeldown",
  scrolldown: "wheeldown",
  mousewheeldown: "wheeldown",
  mwheeldown: "wheeldown",
  xbutton1: "xbutton1",
  mouse4: "xbutton1",
  mb4: "xbutton1",
  mouseback: "xbutton1",
  browserback: "xbutton1",
  xbutton2: "xbutton2",
  mouse5: "xbutton2",
  mb5: "xbutton2",
  mouseforward: "xbutton2",
  browserforward: "xbutton2",
};

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

type LayoutMapLike = {
  get(code: string): string | undefined;
};

let layoutMapPromise: Promise<LayoutMapLike | null> | null = null;

function normalizeModifierToken(token: string): string | null {
  return MODIFIER_ALIASES[token.trim().toLowerCase()] ?? null;
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
  };

  if (/^f\d{1,2}$/i.test(key)) {
    return lower;
  }

  return keyMap[lower] ?? null;
}

function normalizeMouseToken(token: string): string | null {
  return MOUSE_BUTTON_ALIASES[token.toLowerCase()] ?? null;
}

type ModifierSnapshot = {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

function buildHotkeyFromModifiers(mainKey: string, modifiers: ModifierSnapshot): string {
  const parts: string[] = [];
  if (modifiers.ctrlKey) parts.push("ctrl");
  if (modifiers.altKey) parts.push("alt");
  if (modifiers.shiftKey) parts.push("shift");
  if (modifiers.metaKey) parts.push("super");
  parts.push(mainKey);
  return parts.join("+");
}

function displayTokenFromStoredValue(token: string, layoutMap: LayoutMapLike | null): string {
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

  const lower = trimmed.toLowerCase();
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
    mbutton: "Middle Mouse",
    middle: "Middle Mouse",
    middlemouse: "Middle Mouse",
    mouse3: "Middle Mouse",
    mb3: "Middle Mouse",
    wheelclick: "Middle Mouse",
    wheelup: "Scroll Up",
    scrollup: "Scroll Up",
    mousewheelup: "Scroll Up",
    mwheelup: "Scroll Up",
    wheeldown: "Scroll Down",
    scrolldown: "Scroll Down",
    mousewheeldown: "Scroll Down",
    mwheeldown: "Scroll Down",
    xbutton1: "Mouse 4",
    xbutton2: "Mouse 5",
    mouse4: "Mouse 4",
    mouse5: "Mouse 5",
    mouseback: "Mouse 4",
    mouseforward: "Mouse 5",
    browserback: "Mouse 4",
    browserforward: "Mouse 5",
  };

  if (namedDisplayMap[lower]) {
    return namedDisplayMap[lower];
  }

  return trimmed;
}

function normalizeStoredMainKey(token: string, layoutMap: LayoutMapLike | null): string {
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

  const lower = trimmed.toLowerCase();
  const mouseToken = normalizeMouseToken(lower);
  if (mouseToken) {
    return mouseToken;
  }

  if (lower === "<" || lower === ">") {
    return "IntlBackslash";
  }

  if (SHIFTED_SYMBOL_BASE_MAP[trimmed]) {
    return SHIFTED_SYMBOL_BASE_MAP[trimmed];
  }

  return normalizeNamedKey(trimmed) ?? lower;
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

export function captureHotkey(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const lower = event.key.toLowerCase();

  if (MODIFIER_KEYS.has(lower)) return null;
  if (lower === "escape") return null;
  if (event.key === " ") return "space";

  const normalizedNamedKey = normalizeNamedKey(event.key);
  const mainKey =
    normalizedNamedKey ??
    (SHIFTED_SYMBOL_BASE_MAP[event.key] ?? (event.key.length === 1 ? lower : null));

  if (!mainKey) return null;
  return buildHotkeyFromModifiers(mainKey, event);
}

export function captureMouseHotkey(event: {
  button: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  let mainKey: string | null = null;
  if (event.button === 1) {
    mainKey = "mbutton";
  } else if (event.button === 3) {
    mainKey = "xbutton1";
  } else if (event.button === 4) {
    mainKey = "xbutton2";
  }

  if (!mainKey) return null;
  return buildHotkeyFromModifiers(mainKey, event);
}

export function captureWheelHotkey(event: {
  deltaY: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (event.deltaY === 0) return null;
  const mainKey = event.deltaY < 0 ? "wheelup" : "wheeldown";
  return buildHotkeyFromModifiers(mainKey, event);
}

export function formatHotkeyForDisplay(value: string, layoutMap: LayoutMapLike | null): string {
  if (!value) return "Press keys, click, or scroll";

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

function canonicalizeHotkeyString(value: string, layoutMap: LayoutMapLike | null): string {
  const parts: string[] = [];
  let mainKey: string | null = null;

  for (const rawPart of value.split("+")) {
    const part = rawPart.trim();
    if (!part) continue;

    const modifier = normalizeModifierToken(part);
    if (modifier) {
      if (!parts.includes(modifier)) {
        parts.push(modifier);
      }
      continue;
    }

    mainKey = normalizeStoredMainKey(part, layoutMap);
  }

  if (mainKey) {
    parts.push(mainKey);
  }

  return parts.join("+");
}
