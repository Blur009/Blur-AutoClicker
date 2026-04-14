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
  lbutton: "lbutton",
  leftmouse: "lbutton",
  mouse1: "lbutton",
  mb1: "lbutton",
  rbutton: "rbutton",
  rightmouse: "rbutton",
  mouse2: "rbutton",
  mb2: "rbutton",
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

const SIDE_MOUSE_TOKENS = new Set(["xbutton1", "xbutton2"]);

const NUMPAD_CODE_TO_TOKEN: Record<string, string> = {
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
  NumpadDecimal: "numpaddecimal",
  NumpadAdd: "numpadadd",
  NumpadSubtract: "numpadsubtract",
  NumpadMultiply: "numpadmultiply",
  NumpadDivide: "numpaddivide",
  NumpadEnter: "numpadenter",
};

const NUMPAD_TOKEN_ALIASES: Record<string, string> = {
  num0: "numpad0",
  num1: "numpad1",
  num2: "numpad2",
  num3: "numpad3",
  num4: "numpad4",
  num5: "numpad5",
  num6: "numpad6",
  num7: "numpad7",
  num8: "numpad8",
  num9: "numpad9",
  numpaddec: "numpaddecimal",
  numdecimal: "numpaddecimal",
  numpadplus: "numpadadd",
  numadd: "numpadadd",
  numpadminus: "numpadsubtract",
  numsub: "numpadsubtract",
  numpadtimes: "numpadmultiply",
  nummul: "numpadmultiply",
  numpaddiv: "numpaddivide",
  numdiv: "numpaddivide",
  numenter: "numpadenter",
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

function normalizeNumpadCode(code: string): string | null {
  return NUMPAD_CODE_TO_TOKEN[code.trim()] ?? null;
}

function normalizeNumpadToken(token: string): string | null {
  const lower = token.trim().toLowerCase();
  if (/^numpad[0-9]$/.test(lower)) return lower;
  if (
    lower === "numpaddecimal" ||
    lower === "numpadadd" ||
    lower === "numpadsubtract" ||
    lower === "numpadmultiply" ||
    lower === "numpaddivide" ||
    lower === "numpadenter"
  ) {
    return lower;
  }
  return NUMPAD_TOKEN_ALIASES[lower] ?? null;
}

type ModifierSnapshot = {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

function getSideMouseModifiersFromButtons(buttons: number, mainKey: string): string[] {
  const tokens: string[] = [];
  if ((buttons & 8) !== 0 && mainKey !== "xbutton1") {
    tokens.push("xbutton1");
  }
  if ((buttons & 16) !== 0 && mainKey !== "xbutton2") {
    tokens.push("xbutton2");
  }
  return tokens;
}

function buildHotkeyFromModifiers(
  mainKey: string,
  modifiers: ModifierSnapshot,
  extraModifiers: string[] = [],
): string {
  const parts: string[] = [];
  if (modifiers.ctrlKey) parts.push("ctrl");
  if (modifiers.altKey) parts.push("alt");
  if (modifiers.shiftKey) parts.push("shift");
  if (modifiers.metaKey) parts.push("super");
  for (const token of extraModifiers) {
    if (!parts.includes(token)) {
      parts.push(token);
    }
  }
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

  const normalizedNumpad =
    normalizeNumpadCode(trimmed) ?? normalizeNumpadToken(trimmed);
  if (normalizedNumpad) {
    const numpadDisplayMap: Record<string, string> = {
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
      numpaddecimal: "Num .",
      numpadadd: "Num +",
      numpadsubtract: "Num -",
      numpadmultiply: "Num *",
      numpaddivide: "Num /",
      numpadenter: "Num Enter",
    };
    return numpadDisplayMap[normalizedNumpad] ?? normalizedNumpad;
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
    lbutton: "Left Mouse",
    leftmouse: "Left Mouse",
    mouse1: "Left Mouse",
    mb1: "Left Mouse",
    rbutton: "Right Mouse",
    rightmouse: "Right Mouse",
    mouse2: "Right Mouse",
    mb2: "Right Mouse",
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

  const numpadCodeToken = normalizeNumpadCode(trimmed);
  if (numpadCodeToken) {
    return numpadCodeToken;
  }

  const numpadToken = normalizeNumpadToken(trimmed);
  if (numpadToken) {
    return numpadToken;
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
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const numpadFromCode = event.code ? normalizeNumpadCode(event.code) : null;
  if (numpadFromCode) {
    return buildHotkeyFromModifiers(numpadFromCode, event);
  }

  const lower = event.key.toLowerCase();

  if (MODIFIER_KEYS.has(lower)) return null;
  if (lower === "escape") return null;
  if (event.key === " ") return buildHotkeyFromModifiers("space", event);

  const normalizedNamedKey = normalizeNamedKey(event.key);
  const mainKey =
    normalizedNamedKey ??
    (SHIFTED_SYMBOL_BASE_MAP[event.key] ?? (event.key.length === 1 ? lower : null));

  if (!mainKey) return null;
  return buildHotkeyFromModifiers(mainKey, event);
}

export function captureMouseHotkey(event: {
  type?: string;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  let mainKey: string | null = null;

  if ((event.button === 3 || event.button === 4) && event.type === "mousedown") {
    if ((event.buttons & 1) !== 0) {
      mainKey = "lbutton";
    } else if ((event.buttons & 2) !== 0) {
      mainKey = "rbutton";
    } else if ((event.buttons & 4) !== 0) {
      mainKey = "mbutton";
    } else {
      return null;
    }
  } else if (event.button === 0) {
    mainKey = "lbutton";
  } else if (event.button === 1) {
    mainKey = "mbutton";
  } else if (event.button === 2) {
    mainKey = "rbutton";
  } else if (event.button === 3) {
    mainKey = "xbutton1";
  } else if (event.button === 4) {
    mainKey = "xbutton2";
  }

  if (!mainKey) return null;
  const normalizedSideModifiers = getSideMouseModifiersFromButtons(
    event.buttons,
    mainKey,
  );
  if ((mainKey === "lbutton" || mainKey === "rbutton") && normalizedSideModifiers.length === 0) {
    return null;
  }
  return buildHotkeyFromModifiers(
    mainKey,
    event,
    normalizedSideModifiers,
  );
}

export function captureWheelHotkey(event: {
  deltaY: number;
  buttons?: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (event.deltaY === 0) return null;
  const mainKey = event.deltaY < 0 ? "wheelup" : "wheeldown";
  return buildHotkeyFromModifiers(
    mainKey,
    event,
    getSideMouseModifiersFromButtons(event.buttons ?? 0, mainKey),
  );
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
  const keyboardModifiers: string[] = [];
  const sideMouseCandidates: string[] = [];
  let mainKey: string | null = null;

  for (const rawPart of value.split("+")) {
    const part = rawPart.trim();
    if (!part) continue;

    const modifier = normalizeModifierToken(part);
    if (modifier) {
      if (!keyboardModifiers.includes(modifier)) {
        keyboardModifiers.push(modifier);
      }
      continue;
    }

    const normalized = normalizeStoredMainKey(part, layoutMap);
    if (SIDE_MOUSE_TOKENS.has(normalized)) {
      sideMouseCandidates.push(normalized);
      continue;
    }

    mainKey = normalized;
  }

  const parts: string[] = [...keyboardModifiers];

  if (mainKey) {
    for (const token of sideMouseCandidates) {
      if (!parts.includes(token)) {
        parts.push(token);
      }
    }
    parts.push(mainKey);
    return parts.join("+");
  }

  if (sideMouseCandidates.length > 0) {
    const sideMain = sideMouseCandidates[sideMouseCandidates.length - 1];
    for (const token of sideMouseCandidates.slice(0, -1)) {
      if (token !== sideMain && !parts.includes(token)) {
        parts.push(token);
      }
    }
    parts.push(sideMain);
  }

  return parts.join("+");
}
