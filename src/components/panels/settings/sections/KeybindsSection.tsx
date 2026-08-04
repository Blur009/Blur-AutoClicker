import type { Settings } from "../../../../store";
import KeyCaptureInput from "../../../KeyCaptureInput";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const PAGES = [
  { key: "keybindSimple" as const, label: "간단" },
  { key: "keybindAdvanced" as const, label: "고급" },
  { key: "keybindZones" as const, label: "영역" },
  { key: "keybindClickPoints" as const, label: "클릭 지점" },
  { key: "keybindSettings" as const, label: "설정" },
];

export default function KeybindsSection({ settings, update }: Props) {
  return (
    <SettingsCard
      title="페이지 단축키"
      description="각 페이지의 키보드 바로 가기를 설정합니다. 지정할 키를 누르세요."
    >
      {PAGES.map((page) => (
        <div className="settings-row" key={page.key}>
          <div className="settings-label-group">
            <span className="settings-label">{page.label}</span>
            <span className="settings-sublabel">
              {page.label} 페이지로 전환합니다.
            </span>
          </div>
          <KeyCaptureInput
            className="settings-keybind-capture"
            value={settings[page.key]}
            onChange={(key) => update({ [page.key]: key })}
          />
        </div>
      ))}
    </SettingsCard>
  );
}
