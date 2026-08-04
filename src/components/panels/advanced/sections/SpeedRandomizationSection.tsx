import type { Settings } from "../../../../store";

import { SETTINGS_LIMITS } from "../../../../settingsSchema";
import { CardDivider, Disableable, NumInput, ToggleBtn } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SpeedRandomizationSection({ settings, update }: Props) {
  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "var(--text-dim)" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3l3-3 3 3M13 13l-3 3-3-3"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 0v6M10 16v-6"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
              <path
                d="M3 13l3-3 3 3M13 3l-3 3-3-3"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
              />
              <path
                d="M6 10v6M10 6V0"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                opacity="0.4"
              />
            </svg>
          </span>
          <span className="adv-card-title">속도 무작위화</span>
        </div>
        <ToggleBtn
          value={settings.speedRandomizationEnabled}
          onChange={(v) => update({ speedRandomizationEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable
        enabled={settings.speedRandomizationEnabled}
        disabledReason="속도 무작위화를 켜면 클릭 타이밍의 무작위화 정도를 편집할 수 있습니다."
      >
        <div className="adv-card-desc">
          지정한 비율만큼 클릭 속도를 무작위로 변경합니다.
        </div>
        <div className="adv-row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <div className="adv-numbox-sm">
            <NumInput
              value={settings.speedRandomization}
              onChange={(v) => update({ speedRandomization: v })}
              min={SETTINGS_LIMITS.speedRandomization.min}
              max={SETTINGS_LIMITS.speedRandomization.max}
            />
            <span className="adv-unit">%</span>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
