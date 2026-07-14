import type { Settings } from "../../../../store";
import KeyCaptureInput from "../../../KeyCaptureInput";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const PAGES = [
  { key: "keybindSimple" as const, label: "Simple" },
  { key: "keybindAdvanced" as const, label: "Advanced" },
  { key: "keybindZones" as const, label: "Zones" },
  { key: "keybindClickPoints" as const, label: "Click Points" },
  { key: "keybindSettings" as const, label: "Settings" },
];

export default function KeybindsSection({ settings, update }: Props) {
  return (
    <SettingsCard
      title="Keybinds"
      description="Set a keyboard shortcut for each page. Press the key you want to bind."
    >
      {PAGES.map((page) => (
        <div className="settings-row" key={page.key}>
          <div className="settings-label-group">
            <span className="settings-label">{page.label}</span>
            <span className="settings-sublabel">
              Switch to the {page.label} page.
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
