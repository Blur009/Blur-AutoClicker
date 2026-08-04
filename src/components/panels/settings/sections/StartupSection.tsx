import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const onOffOptions = [
  { value: false, label: "끔" },
  { value: true, label: "켬" },
];

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function StartupSection({ settings, update }: Props) {
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  return (
    <SettingsCard title="시작" description="앱이 열릴 때의 동작입니다.">
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">트레이로 최소화</span>
          <span className="settings-sublabel">
            작업 표시줄 대신 시스템 트레이로 최소화합니다.
          </span>
        </div>
        <div className="settings-seg-group">
          {onOffOptions.map((option) => (
            <button
              key={String(option.value)}
              className={`settings-seg-btn ${settings.minimizeToTray === option.value ? "active" : ""}`}
              onClick={() => update({ minimizeToTray: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">시작 시 실행</span>
          <span className="settings-sublabel">
            앱이 열릴 때 클릭을 시작합니다.
          </span>
        </div>
        <div className="settings-seg-group">
          {onOffOptions.map((option) => (
            <button
              key={String(option.value)}
              className={`settings-seg-btn ${autostartEnabled === option.value ? "active" : ""}`}
              disabled={autostartEnabled === null}
              onClick={() => {
                invoke("set_autostart_enabled", { enabled: option.value })
                  .then(() => setAutostartEnabled(option.value))
                  .catch((err) =>
                    error(
                      JSON.stringify({
                        source: "SettingsPanel.setAutostart",
                        error: String(err),
                      }),
                    ),
                  );
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}
