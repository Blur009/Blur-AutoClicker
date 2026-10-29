import { describe, expect, it } from "vitest";
import {
  WEBVIEW_ZOOM_MAX,
  WEBVIEW_ZOOM_MIN,
  clampUiScale,
  formatUiScale,
  scaleStep,
  stepUiScale,
  uiScaleFactor,
  webviewZoom,
} from "../uiScale";
import { UI_SCALE_MAX, UI_SCALE_MIN } from "../settingsSchema";

const plain = { shiftKey: false, ctrlKey: false };
const shift = { shiftKey: true, ctrlKey: false };
const both = { shiftKey: true, ctrlKey: true };

describe("uiScale", () => {
  it("clamps to the supported range", () => {
    expect(clampUiScale(5)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(9999)).toBe(UI_SCALE_MAX);
    expect(clampUiScale(150)).toBe(150);
  });

  it("falls back to the default for junk", () => {
    expect(clampUiScale(Number.NaN)).toBe(100);
    expect(clampUiScale("150")).toBe(100);
    expect(clampUiScale(null)).toBe(100);
  });

  it("rounds fractional percentages", () => {
    expect(clampUiScale(133.4)).toBe(133);
    expect(clampUiScale(133.6)).toBe(134);
  });

  it("picks the step from the modifiers", () => {
    expect(scaleStep(plain)).toBe(10);
    expect(scaleStep(shift)).toBe(25);
    expect(scaleStep(both)).toBe(50);
    expect(scaleStep({ shiftKey: false, ctrlKey: true })).toBe(10);
  });

  it("steps up and down", () => {
    expect(stepUiScale(100, 1, plain)).toBe(110);
    expect(stepUiScale(100, -1, plain)).toBe(90);
    expect(stepUiScale(100, 1, shift)).toBe(125);
    expect(stepUiScale(100, 1, both)).toBe(150);
    expect(stepUiScale(100, -1, both)).toBe(50);
  });

  it("stops at the bounds instead of overshooting", () => {
    expect(stepUiScale(UI_SCALE_MIN, -1, both)).toBe(UI_SCALE_MIN);
    expect(stepUiScale(UI_SCALE_MAX, 1, both)).toBe(UI_SCALE_MAX);
    expect(stepUiScale(20, 1, plain)).toBe(35);
  });

  it("recovers a clamped value before stepping", () => {
    expect(stepUiScale(Number.NaN, 1, plain)).toBe(110);
    expect(stepUiScale(-40, 1, plain)).toBe(35);
  });

  it("formats as a percentage", () => {
    expect(formatUiScale(100)).toBe("100%");
    expect(formatUiScale(250)).toBe("250%");
    expect(formatUiScale(9999)).toBe("300%");
  });

  it("converts to a layout factor", () => {
    expect(uiScaleFactor(100)).toBe(1);
    expect(uiScaleFactor(150)).toBe(1.5);
    expect(uiScaleFactor(25)).toBe(0.25);
    expect(uiScaleFactor(undefined)).toBe(1);
  });
});

describe("webviewZoom", () => {
  it("is the ui scale at 100 percent windows text scale", () => {
    expect(webviewZoom(100, 1)).toBe(1);
    expect(webviewZoom(150, 1)).toBe(1.5);
    expect(webviewZoom(300, 1)).toBe(3);
  });

  it("cancels the windows text scale so sizes compose instead of stacking", () => {
    expect(webviewZoom(100, 1.25)).toBe(0.8);
    expect(webviewZoom(150, 1.25)).toBe(1.2);
    expect(webviewZoom(200, 2)).toBe(1);
  });

  it("stays inside the range webview2 accepts", () => {
    expect(webviewZoom(25, 4)).toBe(WEBVIEW_ZOOM_MIN);
    expect(webviewZoom(300, 0.5)).toBe(WEBVIEW_ZOOM_MAX);
  });

  it("falls back to 1 for a broken text scale", () => {
    expect(webviewZoom(100, 0)).toBe(1);
    expect(webviewZoom(100, Number.NaN)).toBe(1);
  });
});
