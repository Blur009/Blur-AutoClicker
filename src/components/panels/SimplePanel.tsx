import type { Settings } from "../../store";
import { useTranslation, type TranslationKey } from "../../i18n";
import CadenceInput from "../CadenceInput";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import {
  MODE_OPTIONS,
  MOUSE_BUTTON_OPTIONS,
  SETTINGS_LIMITS,
} from "../../settingsSchema";
import "./SimplePanel.css";
// I HATE MAKING UI, FUCK UI DESIGN IN CODE, WHY CANT I JUST PHOTOSHOP THIS SHIT
// ahem, made with love :3
interface SimplePanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SimplePanel({ settings, update }: SimplePanelProps) {
  const { t } = useTranslation();
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
    <div className="vcontainer" data-tour="simple-panel">
      <div className="hcontainer">
        <div data-tour="simple-cadence">
          <CadenceInput settings={settings} update={update} variant="simple" />
        </div>

        <div className="InputBox" data-tour="simple-hotkey">
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
            title={t("simple.switchMode")}
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
            {t(`options.mode.${settings.mode}` as TranslationKey)}
          </button>
        </div>
      </div>

      <div className="hcontainer" data-tour="simple-controls">
        <div className="InputBox">
          <button
            type="button"
            className="simple-cycle-btn"
            title={t("simple.selectMouseButton")}
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
            {t(`options.mouseClick.${settings.mouseButton}` as TranslationKey)}
          </button>
        </div>

        <div className="InputBox">
          <div className="muted">{t("simple.hold")}</div>
          <div className="vertical-devider" />
          <input
            type="number"
            title={t("simple.holdDescription")}
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
                dutyCycle: clamp(
                  parseRawNumber(normalized),
                  SETTINGS_LIMITS.dutyCycle.min,
                  SETTINGS_LIMITS.dutyCycle.max,
                ),
              });
            }}
            onWheel={(e) =>
              handleWheelStep(
                e,
                settings.dutyCycle,
                SETTINGS_LIMITS.dutyCycle.min,
                SETTINGS_LIMITS.dutyCycle.max,
                (next) => update({ dutyCycle: next }),
              )
            }
          />
          <div className="postfix">%</div>
        </div>

        <div className="InputBox">
          <div className="muted">{t("simple.randomization")}</div>
          <div className="vertical-devider" />
          <input
            type="number"
            title={t("simple.randomizationDescription")}
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
                speedVariation: clamp(
                  parseRawNumber(normalized),
                  SETTINGS_LIMITS.speedVariation.min,
                  SETTINGS_LIMITS.speedVariation.max,
                ),
              });
            }}
            onWheel={(e) =>
              handleWheelStep(
                e,
                settings.speedVariation,
                SETTINGS_LIMITS.speedVariation.min,
                SETTINGS_LIMITS.speedVariation.max,
                (next) => update({ speedVariation: next }),
              )
            }
          />
          <div className="postfix">%</div>
        </div>
      </div>
    </div>
  );
}
