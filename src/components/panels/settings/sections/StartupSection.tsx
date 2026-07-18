import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const onOffOptions = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
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
    <SettingsCard title="Startup" description="Behavior when the app opens.">
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Minimize to Tray</span>
          <span className="settings-sublabel">
            Minimize to the system tray instead of the taskbar.
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
          <span className="settings-label">Run on Startup</span>
          <span className="settings-sublabel">
            Start clicking when the app opens.
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
