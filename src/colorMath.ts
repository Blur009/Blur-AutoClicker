export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

export function normalizeHex(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return "";
  return `#${trimmed.replace(/^#/, "").toLowerCase()}`;
}

export function isValidHex(value: unknown): boolean {
  return normalizeHex(value).length > 0;
}

export function hexToRgb(value: unknown): RgbColor | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const digits = hex.slice(1);
  return {
    red: Number.parseInt(digits.slice(0, 2), 16),
    green: Number.parseInt(digits.slice(2, 4), 16),
    blue: Number.parseInt(digits.slice(4, 6), 16),
  };
}

function clampChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  return Math.min(255, Math.max(0, Math.round(channel)));
}

function toPair(channel: number): string {
  return clampChannel(channel).toString(16).padStart(2, "0");
}

export function rgbToHex({ red, green, blue }: RgbColor): string {
  return `#${toPair(red)}${toPair(green)}${toPair(blue)}`;
}

export function rgbToHsv({ red, green, blue }: RgbColor): HsvColor {
  const redNorm = clampChannel(red) / 255;
  const greenNorm = clampChannel(green) / 255;
  const blueNorm = clampChannel(blue) / 255;
  const maxChannel = Math.max(redNorm, greenNorm, blueNorm);
  const minChannel = Math.min(redNorm, greenNorm, blueNorm);
  const delta = maxChannel - minChannel;

  let hue = 0;
  if (delta > 0) {
    if (maxChannel === redNorm) {
      hue = 60 * (((greenNorm - blueNorm) / delta) % 6);
    } else if (maxChannel === greenNorm) {
      hue = 60 * ((blueNorm - redNorm) / delta + 2);
    } else {
      hue = 60 * ((redNorm - greenNorm) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;

  return {
    hue,
    saturation: maxChannel === 0 ? 0 : delta / maxChannel,
    value: maxChannel,
  };
}

export function hsvToRgb({ hue, saturation, value }: HsvColor): RgbColor {
  if (
    !Number.isFinite(hue) ||
    !Number.isFinite(saturation) ||
    !Number.isFinite(value)
  ) {
    return { red: 0, green: 0, blue: 0 };
  }

  const normalizedHue = ((hue % 360) + 360) % 360;
  const clampedSaturation = Math.min(1, Math.max(0, saturation));
  const clampedValue = Math.min(1, Math.max(0, value));
  const chroma = clampedValue * clampedSaturation;
  const intermediate = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const match = clampedValue - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (normalizedHue < 60) {
    red = chroma;
    green = intermediate;
  } else if (normalizedHue < 120) {
    red = intermediate;
    green = chroma;
  } else if (normalizedHue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (normalizedHue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (normalizedHue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255),
  };
}
