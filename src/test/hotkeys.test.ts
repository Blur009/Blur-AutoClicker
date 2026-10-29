import { describe, expect, it } from "vitest";
import {
  canonicalizeHotkeyForBackend,
  captureHotkey,
  conflictsWithAutoPressKey,
  formatHotkeyForDisplay,
  getMainKey,
  normalizeStoredMainKey,
} from "../hotkeys";

type CaptureEvent = {
  key: string;
  code?: string;
  location?: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

function captureEvent(patch: Partial<CaptureEvent>): CaptureEvent {
  return {
    key: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...patch,
  };
}

const PUNCTUATION_CODES: Array<[string, string]> = [
  ["Backquote", "`"],
  ["Minus", "-"],
  ["Equal", "="],
  ["BracketLeft", "["],
  ["BracketRight", "]"],
  ["Backslash", "\\"],
  ["Semicolon", ";"],
  ["Quote", "'"],
  ["Comma", ","],
  ["Period", "."],
  ["Slash", "/"],
  ["IntlBackslash", "<"],
];

const LEGACY_SYMBOLS: Array<[string, string]> = [
  [";", "Semicolon"],
  [":", "Semicolon"],
  ["'", "Quote"],
  ['"', "Quote"],
  [",", "Comma"],
  [".", "Period"],
  ["/", "Slash"],
  ["?", "Slash"],
  ["[", "BracketLeft"],
  ["{", "BracketLeft"],
  ["]", "BracketRight"],
  ["}", "BracketRight"],
  ["\\", "Backslash"],
  ["|", "Backslash"],
  ["-", "Minus"],
  ["_", "Minus"],
  ["=", "Equal"],
  ["`", "Backquote"],
  ["~", "Backquote"],
];

describe("punctuation capture", () => {
  it("stores the physical code instead of the produced character", () => {
    expect(captureHotkey(captureEvent({ code: "Semicolon", key: ";" }))).toBe(
      "Semicolon",
    );
    expect(getMainKey(captureEvent({ code: "Semicolon", key: ";" }))).toBe(
      "semicolon",
    );
    expect(
      captureHotkey(
        captureEvent({ code: "Semicolon", key: ";", shiftKey: true }),
      ),
    ).toBe("shift+Semicolon");
  });

  it("stores the physical code for every punctuation key", () => {
    for (const [code, key] of PUNCTUATION_CODES) {
      expect(captureHotkey(captureEvent({ code, key }))).toBe(code);
    }
  });

  it("leaves digits, letters, function keys and numpad alone", () => {
    expect(captureHotkey(captureEvent({ code: "Digit1", key: "1" }))).toBe(
      "Digit1",
    );
    expect(captureHotkey(captureEvent({ code: "KeyQ", key: "q" }))).toBe(
      "KeyQ",
    );
    expect(captureHotkey(captureEvent({ code: "F5", key: "F5" }))).toBe("f5");
    expect(
      captureHotkey(captureEvent({ code: "Numpad7", key: "7", location: 3 })),
    ).toBe("numpad7");
    expect(
      captureHotkey(captureEvent({ code: "ArrowUp", key: "ArrowUp" })),
    ).toBe("up");
  });
});

describe("legacy punctuation migration", () => {
  it("normalizes a stored character to the physical code", async () => {
    await expect(canonicalizeHotkeyForBackend(";")).resolves.toBe("Semicolon");
    await expect(canonicalizeHotkeyForBackend("ctrl+:")).resolves.toBe(
      "ctrl+Semicolon",
    );
    await expect(canonicalizeHotkeyForBackend("IntlBackslash")).resolves.toBe(
      "IntlBackslash",
    );
  });

  it("normalizes shifted glyphs to the physical code", async () => {
    for (const [symbol, code] of LEGACY_SYMBOLS) {
      await expect(canonicalizeHotkeyForBackend(symbol)).resolves.toBe(code);
    }
    await expect(canonicalizeHotkeyForBackend("<")).resolves.toBe(
      "IntlBackslash",
    );
    await expect(canonicalizeHotkeyForBackend(">")).resolves.toBe(
      "IntlBackslash",
    );
  });

  it("keeps a migrated binding stable across round trips", async () => {
    const migrated = await canonicalizeHotkeyForBackend("ctrl+;");
    await expect(canonicalizeHotkeyForBackend(migrated)).resolves.toBe(
      migrated,
    );
  });

  it("detects the auto-press conflict for legacy and migrated spellings", () => {
    expect(conflictsWithAutoPressKey("Semicolon", ";", false)).toBe(true);
    expect(conflictsWithAutoPressKey(";", "semicolon", false)).toBe(true);
    expect(conflictsWithAutoPressKey("Semicolon", "semicolon", false)).toBe(
      true,
    );
    expect(conflictsWithAutoPressKey("Equal", "+", false)).toBe(true);
    expect(conflictsWithAutoPressKey("Comma", "semicolon", false)).toBe(false);
  });
});

describe("stored key normalization", () => {
  const dvorakMap = {
    get: (code: string): string | undefined =>
      ({ KeyQ: "'", KeyW: ",", KeyE: ".", KeyR: "p" })[code],
  };

  const STORED_TOKENS = [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyA",
    "KeyZ",
    ";",
    ":",
    "'",
    '"',
    ",",
    ".",
    "/",
    "?",
    "[",
    "{",
    "]",
    "}",
    "\\",
    "|",
    "-",
    "_",
    "=",
    "+",
    "`",
    "~",
    "<",
    ">",
    "Semicolon",
    "Quote",
    "Backquote",
    "BracketLeft",
    "IntlBackslash",
    "semicolon",
    "quote",
    "slash",
    "a",
    "q",
    "z",
    "A",
    "Z",
    "0",
    "5",
    "Digit5",
    "Numpad3",
    "numpad3",
    "spacebar",
    "lmb",
    "f5",
  ];

  it("returns the same value when applied twice", () => {
    for (const token of STORED_TOKENS) {
      const once = normalizeStoredMainKey(token, dvorakMap);
      const twice = normalizeStoredMainKey(once, dvorakMap);
      expect(twice, `${token} normalized to ${once} on the first pass`).toBe(
        once,
      );
    }
  });

  it("resolves a legacy KeyX to a physical code in one pass", () => {
    expect(normalizeStoredMainKey("KeyQ", dvorakMap)).toBe("Quote");
    expect(normalizeStoredMainKey("KeyW", dvorakMap)).toBe("Comma");
    expect(normalizeStoredMainKey("KeyE", dvorakMap)).toBe("Period");
    expect(normalizeStoredMainKey("KeyR", dvorakMap)).toBe("p");
    expect(normalizeStoredMainKey("KeyA", dvorakMap)).toBe("a");
  });
});

describe("punctuation display", () => {
  const layoutMap = {
    get: (code: string) => (code === "Semicolon" ? "ö" : undefined),
  };

  it("renders the glyph the current layout produces", () => {
    expect(formatHotkeyForDisplay("Semicolon", layoutMap)).toBe("ö");
    expect(formatHotkeyForDisplay("ctrl+Semicolon", layoutMap)).toBe(
      "Ctrl + ö",
    );
  });

  it("falls back to a plain label when the layout map is unavailable", () => {
    expect(formatHotkeyForDisplay("Semicolon", null)).toBe(";");
    expect(formatHotkeyForDisplay("ctrl+shift+Semicolon", null)).toBe(
      "Ctrl + Shift + ;",
    );
    expect(formatHotkeyForDisplay("Quote", null)).toBe("'");
    expect(formatHotkeyForDisplay("IntlBackslash", null)).toBe("<");
  });
});
