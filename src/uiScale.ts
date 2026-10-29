import { UI_SCALE_DEFAULT, UI_SCALE_MAX, UI_SCALE_MIN } from "./settingsSchema";

export type ScaleModifiers = { shiftKey: boolean; ctrlKey: boolean };

export const SCALE_STEP_PLAIN = 10;
export const SCALE_STEP_SHIFT = 25;
export const SCALE_STEP_BOTH = 50;

export function clampUiScale(value: unknown): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : UI_SCALE_DEFAULT;
  return Math.round(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, parsed)));
}

export function scaleStep(modifiers: ScaleModifiers): number {
  if (modifiers.ctrlKey && modifiers.shiftKey) return SCALE_STEP_BOTH;
  if (modifiers.shiftKey) return SCALE_STEP_SHIFT;
  return SCALE_STEP_PLAIN;
}

export function stepUiScale(
  current: number,
  direction: 1 | -1,
  modifiers: ScaleModifiers,
): number {
  return clampUiScale(clampUiScale(current) + direction * scaleStep(modifiers));
}

export function formatUiScale(value: number): string {
  return `${clampUiScale(value)}%`;
}

export function uiScaleFactor(value: unknown): number {
  return clampUiScale(value) / 100;
}

export const WEBVIEW_ZOOM_MIN = 0.25;
export const WEBVIEW_ZOOM_MAX = 5;

export function webviewZoom(uiScale: number, textScale: number): number {
  const text = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const requested = uiScaleFactor(uiScale) / text;
  return Math.min(WEBVIEW_ZOOM_MAX, Math.max(WEBVIEW_ZOOM_MIN, requested));
}
