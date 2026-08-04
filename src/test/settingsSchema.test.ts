import { describe, expect, it } from "vitest";
import {
  FACTORY_PRESETS,
  getPresetSummary,
  sanitizeSettings,
} from "../settingsSchema";

describe("한국어 프리셋 표시", () => {
  it("기존 영어 기본 프리셋 이름을 한국어로 보정한다", () => {
    const legacyPresets = [
      { ...FACTORY_PRESETS[0], name: "Standard Clicking" },
      { ...FACTORY_PRESETS[1], name: "Rapid Fire" },
      { ...FACTORY_PRESETS[2], name: "Precision Mode" },
    ];

    const settings = sanitizeSettings({ presets: legacyPresets }, "3.9.1");

    expect(settings.presets.map((preset) => preset.name)).toEqual([
      "표준 클릭",
      "연속 클릭",
      "정밀 모드",
    ]);
  });

  it("프리셋 요약에서 마우스 버튼을 한국어로 표시한다", () => {
    expect(getPresetSummary(FACTORY_PRESETS[0].settings)).toContain(
      "마우스 왼쪽",
    );
    expect(getPresetSummary(FACTORY_PRESETS[0].settings)).not.toContain("Left");
  });
});
