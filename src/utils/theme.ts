import type { CustomThemeColors } from "../store";

export type KofiStyle = "1" | "2" | "3" | "4" | "5" | "6";

let parseCanvas: HTMLCanvasElement | null = null;
function getParseCtx(): CanvasRenderingContext2D | null {
  if (!parseCanvas) parseCanvas = document.createElement("canvas");
  return parseCanvas.getContext("2d");
}

export function parseColorToRgba(
  color: string,
): [number, number, number, number] | null {
  const ctx = getParseCtx();
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  try {
    ctx.fillStyle = color;
  } catch {
    return null;
  }
  const c = ctx.fillStyle;
  if (typeof c === "string" && c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 6) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    if (hex.length === 8) {
      const n = parseInt(hex.slice(0, 6), 16);
      const a = parseInt(hex.slice(6), 16) / 255;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

export function getLuminance(color: string): number {
  const rgba = parseColorToRgba(color);
  if (!rgba) return 0.5;
  const [r, g, b] = rgba;
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

export function isLightColor(color: string): boolean {
  return getLuminance(color) > 0.5;
}

export function getAutoKofiStyle(color: string): KofiStyle {
  const rgba = parseColorToRgba(color);
  if (!rgba) return "3";
  const [r8, g8, b8] = rgba;
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const luminance = r * 0.299 + g * 0.587 + b * 0.114;
  if (max === min) return luminance > 0.5 ? "1" : "3";
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (s < 0.15) return luminance > 0.5 ? "1" : "3";
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 30 || h >= 330) return "6";
  if (h < 70) return "2";
  if (h < 165) return luminance > 0.5 ? "1" : "3";
  if (h < 255) return "5";
  return "4";
}

function relativeLuminance(color: string): number {
  const rgba = parseColorToRgba(color);
  if (!rgba) return 0.5;
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgba;
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function getContrastRatio(bg: string, fg: string): number {
  const L1 = relativeLuminance(bg);
  const L2 = relativeLuminance(fg);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
}

export function splitHexAlpha(color: string): { hex6: string; alpha: number } {
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    return {
      hex6: color.slice(0, 7).toLowerCase(),
      alpha: parseInt(color.slice(7), 16) / 255,
    };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { hex6: color.toLowerCase(), alpha: 1 };
  }
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const h = color
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("");
    return { hex6: ("#" + h).toLowerCase(), alpha: 1 };
  }
  const rgba = parseColorToRgba(color);
  if (!rgba) return { hex6: "#121212", alpha: 1 };
  const [r, g, b, a] = rgba;
  const hex6 =
    "#" +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("");
  return { hex6: hex6.toLowerCase(), alpha: a };
}

export function combineHexAlpha(hex6: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  if (clamped >= 0.999) return hex6.toLowerCase();
  const aa = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return (hex6 + aa).toLowerCase();
}

export const CUSTOM_THEME_VAR_MAP: ReadonlyArray<
  [keyof CustomThemeColors, string]
> = [
  ["bgBase", "--bg-base"],
  ["textPrimary", "--text-primary"],
  ["accentGreen", "--accent-green"],
  ["accentYellow", "--accent-yellow"],
  ["accentRed", "--accent-red"],
  ["bgSurface", "--bg-surface"],
  ["bgElevated", "--bg-elevated"],
  ["bgInput", "--bg-input"],
  ["bgInputOff", "--bg-input-off"],
  ["border", "--border"],
  ["borderFocus", "--border-focus"],
  ["borderSubtle", "--border-subtle"],
  ["textMuted", "--text-muted"],
  ["textDim", "--text-dim"],
  ["radiusSm", "--radius-sm"],
  ["radiusMd", "--radius-md"],
  ["radiusLg", "--radius-lg"],
  ["containerShadow", "--container-shadow"],
  ["dividerColor", "--divider-color"],
  ["statusSuccess", "--status-success"],
  ["statusError", "--status-error"],
];

export interface ThemePreset {
  name: string;
  colors: CustomThemeColors;
}

export const THEME_PRESETS: ReadonlyArray<ThemePreset> = [
  {
    name: "Midnight",
    colors: {
      bgBase: "#121212",
      textPrimary: "#f9fefe",
      accentGreen: "#19c233bf",
      accentYellow: "#febc2fbf",
      accentRed: "#ff726bbf",
    },
  },
  {
    name: "Dracula",
    colors: {
      bgBase: "#282a36",
      textPrimary: "#f8f8f2",
      accentGreen: "#50fa7bcc",
      accentYellow: "#f1fa8ccc",
      accentRed: "#ff5555cc",
    },
  },
  {
    name: "Nord",
    colors: {
      bgBase: "#2e3440",
      textPrimary: "#eceff4",
      accentGreen: "#a3be8ccc",
      accentYellow: "#ebcb8bcc",
      accentRed: "#bf616acc",
    },
  },
  {
    name: "Solarized",
    colors: {
      bgBase: "#002b36",
      textPrimary: "#eee8d5",
      accentGreen: "#859900cc",
      accentYellow: "#b58900cc",
      accentRed: "#dc322fcc",
    },
  },
  {
    name: "Paper",
    colors: {
      bgBase: "#fafafa",
      textPrimary: "#1a1a1a",
      accentGreen: "#1b7a32e6",
      accentYellow: "#b5790ae6",
      accentRed: "#c0392be6",
    },
  },
  {
    name: "Monokai",
    colors: {
      bgBase: "#272822",
      textPrimary: "#f8f8f2",
      accentGreen: "#a6e22ee6",
      accentYellow: "#e6db74e6",
      accentRed: "#f92672e6",
    },
  },
  {
    name: "Catppuccin",
    colors: {
      bgBase: "#1e1e2e",
      textPrimary: "#cdd6f4",
      accentGreen: "#a6e3a1cc",
      accentYellow: "#f9e2afcc",
      accentRed: "#f38ba8cc",
    },
  },
  {
    name: "Tokyo Night",
    colors: {
      bgBase: "#1a1b26",
      textPrimary: "#c0caf5",
      accentGreen: "#9ece6acc",
      accentYellow: "#e0af68cc",
      accentRed: "#f7768ecc",
    },
  },
  {
    name: "Gruvbox",
    colors: {
      bgBase: "#282828",
      textPrimary: "#ebdbb2",
      accentGreen: "#b8bb26cc",
      accentYellow: "#fabd2fcc",
      accentRed: "#fb4934cc",
    },
  },
];

export async function fileToBackgroundDataUrl(
  file: File,
  maxDim = 1920,
  quality = 0.85,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(mime, mime === "image/jpeg" ? quality : undefined);
}

export function validateRadius(value: string): boolean {
  if (!value) return true;
  return /^\d*\.?\d+(px|rem|em|%)?$/.test(value.trim());
}

export function sanitizeImportedTheme(
  raw: unknown,
): CustomThemeColors | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const isStr = (v: unknown): v is string =>
    typeof v === "string" && v.trim().length > 0;
  if (!isStr(r.bgBase) || !isStr(r.textPrimary)) return null;
  if (!isStr(r.accentGreen) || !isStr(r.accentYellow) || !isStr(r.accentRed))
    return null;

  const out: CustomThemeColors = {
    bgBase: r.bgBase,
    textPrimary: r.textPrimary,
    accentGreen: r.accentGreen,
    accentYellow: r.accentYellow,
    accentRed: r.accentRed,
  };
  const optionalKeys: Array<keyof CustomThemeColors> = [
    "bgSurface",
    "bgElevated",
    "bgInput",
    "bgInputOff",
    "border",
    "borderFocus",
    "borderSubtle",
    "textMuted",
    "textDim",
    "radiusSm",
    "radiusMd",
    "radiusLg",
    "containerShadow",
    "dividerColor",
    "statusSuccess",
    "statusError",
  ];
  for (const k of optionalKeys) {
    const v = r[k];
    if (isStr(v)) (out as Record<string, string>)[k] = v;
  }
  if (["1", "2", "3", "4", "5", "6"].includes(r.kofiStyle as string)) {
    out.kofiStyle = r.kofiStyle as KofiStyle;
  }
  return out;
}
