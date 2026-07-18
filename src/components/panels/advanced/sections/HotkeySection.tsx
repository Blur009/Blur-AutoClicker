import { useRef } from "react";
import type { Settings } from "../../../../store";
import { conflictsWithAutoPressKey } from "../../../../hotkeys";
import HotkeyCaptureInput, {
  type HotkeyCaptureInputHandle,
} from "../../../HotkeyCaptureInput";
import { CardDivider } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function HotkeySection({ settings, update }: Props) {
  const hotkeyInputRef = useRef<HotkeyCaptureInputHandle>(null);

  const hasConflict =
    settings.inputType === "keyboard" &&
    conflictsWithAutoPressKey(
      settings.hotkey,
      settings.keyboardKey,
      settings.keyboardKeyCase === "upper",
    );
  const hotkeyConflicts = hasConflict ? ["Auto-press key"] : [];

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
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
          </span>
          <span className="adv-card-title">Hotkey</span>
        </div>
        <div className="adv-seg-group">
          {(["Toggle", "Hold"] as const).map((clickModeOption) => (
            <button
              key={clickModeOption}
              className={`adv-seg-btn ${settings.mode === clickModeOption ? "active" : ""}`}
              onClick={() => update({ mode: clickModeOption })}
            >
              {clickModeOption}
            </button>
          ))}
        </div>
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        {settings.mode === "Hold"
          ? "Hold the hotkey to click. Release to stop."
          : "Press the hotkey to toggle the clicker on and off."}
      </div>
      <div className="adv-row" style={{ gap: 8 }}>
        <div className="adv-textbox" style={{ flex: 1 }}>
          <HotkeyCaptureInput
            ref={hotkeyInputRef}
            className="adv-textbox-text"
            value={settings.hotkey}
            onChange={(hotkey: string) => update({ hotkey })}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              width: "100%",
            }}
            conflicts={hotkeyConflicts}
            editable={false}
          />
        </div>
        <button
          type="button"
          className="adv-hotkey-edit-btn"
          onClick={() => hotkeyInputRef.current?.startListening()}
        >
          Edit Hotkey
        </button>
      </div>
    </div>
  );
}
