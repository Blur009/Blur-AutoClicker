import type { Settings } from "../../store";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import "./Modes.css";
import "./SimplePanel.css";
// I HATE MAKING UI, FUCK UI DESIGN IN CODE, WHY CANT I JUST PHOTOSHOP THIS SHIT
// ahem, made with love :3
interface SimplePanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const INTERVAL_OPTIONS = [
  { value: "s", label: "Second" },
  { value: "m", label: "Minute" },
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
] as const;

const MODE_OPTIONS = ["Toggle", "Hold"] as const;
const MOUSE_BUTTON_OPTIONS = ["Left", "Middle", "Right"] as const;

export default function SimplePanel({ settings, update }: SimplePanelProps) {
  const normalizeRaw = (raw: string) => raw.replace(/^0+(?=\d)/, "");

  const parseRawNumber = (raw: string) => {
    const normalized = normalizeRaw(raw);
    return normalized === "" ? 0 : Number(normalized);
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const dynamicChWidth = (value: number, min = 1, max = 3) =>
    `${clamp(String(value).length, min, max)}ch`;
  const isShortHotkey = (() => {
    const raw = settings.hotkey.trim();
    if (!raw) return true;
    const parts = raw.split("+").filter(Boolean);
    return parts.length <= 2 && raw.length <= 10;
  })();

  const cycleOption = <T extends string>(
    options: readonly T[],
    current: T,
    direction: 1 | -1,
  ): T => {
    const currentIndex = options.indexOf(current);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + options.length) % options.length;
    return options[nextIndex];
  };

  const cycleWithClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    apply: () => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    apply();
  };

  const handleWheelStep = (
    e: React.WheelEvent<HTMLInputElement>,
    current: number,
    min: number,
    max: number,
    apply: (next: number) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.blur();
    const delta = e.deltaY < 0 ? 1 : -1;
    apply(clamp(current + delta, min, max));
  };

  return (
    <div className="vcontainer">
      <div className="hcontainer">
        <div className="InputBox">
          <input
            type="number"
            className="simple-inline-input"
            value={settings.clickSpeed}
            min={1}
            max={500}
            onChange={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({ clickSpeed: parseRawNumber(normalized) });
            }}
            onBlur={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({
                clickSpeed: clamp(parseRawNumber(normalized), 1, 500),
              });
            }}
            onWheel={(e) =>
              handleWheelStep(e, settings.clickSpeed, 1, 500, (next) =>
                update({ clickSpeed: next }),
              )
            }
          />
          <div className="vertical-devider" />
          <button
            type="button"
            className="simple-cycle-btn"
            title="Change Click Interval"
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
            onClick={(e) =>
              cycleWithClick(e, () =>
                update({
                  clickInterval: cycleOption(
                    INTERVAL_OPTIONS.map((o) => o.value),
                    settings.clickInterval,
                    1,
                  ),
                }),
              )
            }
            onContextMenu={(e) =>
              cycleWithClick(e, () =>
                update({
                  clickInterval: cycleOption(
                    INTERVAL_OPTIONS.map((o) => o.value),
                    settings.clickInterval,
                    -1,
                  ),
                }),
              )
            }
          >
            {INTERVAL_OPTIONS.find((o) => o.value === settings.clickInterval)
              ?.label ?? "Second"}
          </button>
          <svg
            className="Icon clock-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <div className="InputBox">
          <div className="faderbox">
            <HotkeyCaptureInput
              className="simple-hotkey-input"
              style={{ width: isShortHotkey ? "90px" : "130px" }}
              value={settings.hotkey}
              onChange={(hotkey) => update({ hotkey })}
            />
          </div>
          <svg
            className="Icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <line x1="6" y1="8" x2="6" y2="8" />
            <line x1="10" y1="8" x2="10" y2="8" />
            <line x1="14" y1="8" x2="14" y2="8" />
            <line x1="18" y1="8" x2="18" y2="8" />
            <line x1="8" y1="12" x2="8" y2="12" />
            <line x1="12" y1="12" x2="12" y2="12" />
            <line x1="16" y1="12" x2="16" y2="12" />
            <line x1="7" y1="16" x2="17" y2="16" />
          </svg>
          <div className="vertical-devider" />
          <button
            type="button"
            className="simple-cycle-btn"
            title="Switch between hotkey Toggle and Hold mode"
            onClick={(e) =>
              cycleWithClick(e, () =>
                update({
                  mode: cycleOption(MODE_OPTIONS, settings.mode, 1),
                }),
              )
            }
            onContextMenu={(e) =>
              cycleWithClick(e, () =>
                update({
                  mode: cycleOption(MODE_OPTIONS, settings.mode, -1),
                }),
              )
            }
          >
            {settings.mode}
          </button>
        </div>
      </div>

      <div className="hcontainer">
        <div className="InputBox">
          <button
            type="button"
            className="simple-cycle-btn"
            title="Select which mouse button gets clicked"
            onClick={(e) =>
              cycleWithClick(e, () =>
                update({
                  mouseButton: cycleOption(
                    MOUSE_BUTTON_OPTIONS,
                    settings.mouseButton,
                    1,
                  ),
                }),
              )
            }
            onContextMenu={(e) =>
              cycleWithClick(e, () =>
                update({
                  mouseButton: cycleOption(
                    MOUSE_BUTTON_OPTIONS,
                    settings.mouseButton,
                    -1,
                  ),
                }),
              )
            }
          >
            {
              {
                Left: "Left Click",
                Middle: "Middle Click",
                Right: "Right Click",
              }[settings.mouseButton]
            }
          </button>
        </div>

        <div className="InputBox">
          <div className="muted">Hold</div>
          <div className="vertical-devider" />
          <input
            type="number"
            title="How long the mouse button gets held down during each click"
            className="simple-inline-input numbervalue"
            style={{
              width: dynamicChWidth(settings.dutyCycle),
              minWidth: "1ch",
            }}
            value={settings.dutyCycle}
            min={0}
            max={100}
            onChange={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({ dutyCycle: parseRawNumber(normalized) });
            }}
            onBlur={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({
                dutyCycle: clamp(parseRawNumber(normalized), 0, 100),
              });
            }}
            onWheel={(e) =>
              handleWheelStep(e, settings.dutyCycle, 0, 100, (next) =>
                update({ dutyCycle: next }),
              )
            }
          />
          <div className="postfix">%</div>
        </div>

        <div className="InputBox">
          <div className="muted">Randomization</div>
          <div className="vertical-devider" />
          <input
            type="number"
            title="Randomly changes clicks speed in % range of set CPS"
            className="simple-inline-input numbervalue"
            style={{
              width: dynamicChWidth(settings.speedVariation),
              minWidth: "1ch",
            }}
            value={settings.speedVariation}
            min={0}
            max={200}
            onChange={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({ speedVariation: parseRawNumber(normalized) });
            }}
            onBlur={(e) => {
              const normalized = normalizeRaw(e.target.value);
              if (normalized !== e.target.value) {
                e.target.value = normalized;
              }
              update({
                speedVariation: clamp(parseRawNumber(normalized), 0, 200),
              });
            }}
            onWheel={(e) =>
              handleWheelStep(e, settings.speedVariation, 0, 200, (next) =>
                update({ speedVariation: next }),
              )
            }
          />
          <div className="postfix">%</div>
        </div>
      </div>
    </div>
  );
}
