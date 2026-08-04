import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import { DEFAULT_MAX_CLICK_SPEED } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { NumInput } from "../../advanced/sections/shared";
import ConfirmDialog from "../../../ConfirmDialog";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onToggleAlwaysOnTop: () => Promise<void>;
}

export default function BehaviorSection({
  settings,
  update,
  onToggleAlwaysOnTop,
}: Props) {
  const [pendingAction, setPendingAction] = useState<
    "extended-click-speed-limit" | null
  >(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) return;
    void onToggleAlwaysOnTop();
  };

  const handleExtendedClickSpeedLimitChange = (nextValue: boolean) => {
    if (settings.extendedClickSpeedLimit === nextValue) return;
    if (nextValue) {
      setPendingAction("extended-click-speed-limit");
      return;
    }
    update({
      extendedClickSpeedLimit: false,
      clickSpeed: Math.min(settings.clickSpeed, DEFAULT_MAX_CLICK_SPEED),
    });
  };

  const handleConfirmExtendedClickSpeedLimit = () => {
    update({ extendedClickSpeedLimit: true });
    setPendingAction(null);
  };

  return (
    <>
      <SettingsCard
        title="동작"
        description="자동 클릭기의 동작 방식을 변경합니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">항상 위에 표시</span>
            <span className="settings-sublabel">
              다른 창보다 위에 창을 유지합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.alwaysOnTop ? "on" : "off"}`}
              onClick={() => handleAlwaysOnTopChange(!settings.alwaysOnTop)}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">중지 영역 오버레이</span>
            <span className="settings-sublabel">
              중지 영역의 경계를 표시합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.showStopOverlay ? "on" : "off"}`}
              onClick={() =>
                update({ showStopOverlay: !settings.showStopOverlay })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">중지 사유 알림</span>
            <span className="settings-sublabel">
              자동 클릭기가 중지되면 알림을 표시합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.showStopReason ? "on" : "off"}`}
              onClick={() =>
                update({ showStopReason: !settings.showStopReason })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">단축키 보조키 엄격 적용</span>
            <span className="settings-sublabel">
              단축키에 지정한 보조키를 정확히 요구합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.strictHotkeyModifiers ? "on" : "off"}`}
              onClick={() =>
                update({
                  strictHotkeyModifiers: !settings.strictHotkeyModifiers,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Alt+Tab 시 중지</span>
            <span className="settings-sublabel">
              다른 창으로 전환하면 클릭을 중지합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.taskSwitcherStopEnabled ? "on" : "off"}`}
              onClick={() =>
                update({
                  taskSwitcherStopEnabled: !settings.taskSwitcherStopEnabled,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">확장 클릭 속도 제한</span>
            <span className="settings-sublabel">
              최대 1000 CPS의 클릭 속도를 허용합니다(성능에 영향을 줄 수 있음).
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.extendedClickSpeedLimit ? "on" : "off"}`}
              onClick={() =>
                handleExtendedClickSpeedLimitChange(
                  !settings.extendedClickSpeedLimit,
                )
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="클릭 지점 기본값"
        description="새로 선택하는 클릭 지점에 사용할 기본값입니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">기본 클릭 횟수</span>
            <span className="settings-sublabel">
              새 지점마다 수행할 클릭 횟수입니다.
            </span>
          </div>
          <div className="adv-numbox-sm" style={{ gap: "0.25rem" }}>
            <span
              className="adv-unit"
              style={{ minWidth: "0.75rem", textAlign: "left" }}
            >
              클릭
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointClicks}
              min={1}
              max={999999}
              onChange={(value) => update({ newClickPointClicks: value })}
              style={{ width: "7ch", textAlign: "right" }}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">기본 반경</span>
            <span className="settings-sublabel">
              새 지점의 클릭 위치를 무작위화할 반경입니다.
            </span>
          </div>
          <div className="adv-numbox-sm" style={{ gap: "0.25rem" }}>
            <span
              className="adv-unit"
              style={{ minWidth: "0.375rem", textAlign: "center" }}
            >
              r
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointRadius}
              min={0}
              max={9999}
              onChange={(value) => update({ newClickPointRadius: value })}
              style={{ width: "5ch", textAlign: "right" }}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="시작" description="앱이 열릴 때의 동작입니다.">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">트레이로 최소화</span>
            <span className="settings-sublabel">
              작업 표시줄 대신 시스템 트레이로 최소화합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.minimizeToTray ? "on" : "off"}`}
              onClick={() =>
                update({ minimizeToTray: !settings.minimizeToTray })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">창 위치 기억</span>
            <span className="settings-sublabel">
              시작할 때 마지막 창 위치에서 엽니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.rememberWindowPosition ? "on" : "off"}`}
              onClick={() =>
                update({
                  rememberWindowPosition: !settings.rememberWindowPosition,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">시작 시 실행</span>
            <span className="settings-sublabel">
              앱이 열릴 때 클릭을 시작합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${autostartEnabled ? "on" : "off"}`}
              disabled={autostartEnabled === null}
              onClick={() => {
                const newValue = !autostartEnabled;
                invoke("set_autostart_enabled", { enabled: newValue })
                  .then(() => setAutostartEnabled(newValue))
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
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={pendingAction === "extended-click-speed-limit"}
        title="확장 클릭 속도 제한을 켤까요?"
        message="기본 제한을 초과하는 클릭 속도를 허용합니다. 성능에 영향을 줄 수 있습니다."
        confirmLabel="켜기"
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
