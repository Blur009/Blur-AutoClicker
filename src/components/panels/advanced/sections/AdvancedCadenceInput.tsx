import { useState } from "react";
import type { Settings } from "../../../../store";
import { RATE_INPUT_MODE_OPTIONS } from "../../../../cadence";
import { normalizeIntegerRaw } from "../../../../numberInput";
import {
  getMaxClickSpeed,
  type ClickInterval,
} from "../../../../settingsSchema";
import { AdvDropdown } from "./shared";
import {
  INTERVAL_OPTIONS,
  handleNumberBlur,
  handleNumberChange,
  handleWheelStep,
  switchCadenceMode,
} from "../../../sharedCadence";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function AdvancedCadenceInput({ settings, update }: Props) {
  const maxClickSpeed = getMaxClickSpeed(settings.extendedClickSpeedLimit);
  const [draftCps, setDraftCps] = useState<string | null>(null);

  const modeToggle = (
    <div className="adv-seg-group adv-cadence-mode-toggle">
      {RATE_INPUT_MODE_OPTIONS.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`adv-seg-btn ${settings.rateInputMode === mode ? "active" : ""}`}
          onClick={() => switchCadenceMode(mode, settings, update)}
        >
          {mode === "rate" ? "Rate" : "Delay"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="adv-cadence-block">
      <div className="adv-row adv-cadence-main-row">
        <div className="adv-cadence-value">
          {settings.rateInputMode === "rate" ? (
            <div className="adv-value-outline">
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={draftCps ?? settings.clickSpeed}
                  min={1}
                  max={maxClickSpeed}
                  style={{ width: "40px", textAlign: "right" }}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      setDraftCps("");
                    } else {
                      const normalized = normalizeIntegerRaw(raw);
                      if (normalized !== raw) event.target.value = normalized;
                      if (normalized === "" || normalized === "-") {
                        setDraftCps(normalized);
                        return;
                      }
                      setDraftCps(null);
                      update({ clickSpeed: Number(normalized) });
                    }
                  }}
                  onBlur={(event) => {
                    setDraftCps(null);
                    handleNumberBlur(event, 1, maxClickSpeed, (next) =>
                      update({ clickSpeed: next }),
                    );
                  }}
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.clickSpeed,
                      1,
                      maxClickSpeed,
                      (next) => update({ clickSpeed: next }),
                    )
                  }
                />
              </div>
              <div className="adv-vdivider" />
              <span className="adv-unf">Clicks Per</span>
              <div className="adv-vdivider" />
              <div className="adv-foc adv-foc-grow">
                <AdvDropdown
                  value={settings.clickInterval}
                  options={INTERVAL_OPTIONS}
                  onChange={(v) =>
                    update({ clickInterval: v as ClickInterval })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="adv-value-outline adv-value-outline--duration">
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationHours}
                  min={0}
                  max={999}
                  style={{ width: "34px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationHours: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 999, (next) =>
                      update({ durationHours: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationHours,
                      0,
                      999,
                      (next) => update({ durationHours: next }),
                    )
                  }
                />
                <span className="adv-unit">h</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationMinutes}
                  min={0}
                  max={59}
                  style={{ width: "26px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationMinutes: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 59, (next) =>
                      update({ durationMinutes: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationMinutes,
                      0,
                      59,
                      (next) => update({ durationMinutes: next }),
                    )
                  }
                />
                <span className="adv-unit">m</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationSeconds}
                  min={0}
                  max={59}
                  style={{ width: "26px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationSeconds: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 59, (next) =>
                      update({ durationSeconds: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationSeconds,
                      0,
                      59,
                      (next) => update({ durationSeconds: next }),
                    )
                  }
                />
                <span className="adv-unit">s</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationMilliseconds}
                  min={0}
                  max={999}
                  style={{ width: "34px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationMilliseconds: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 999, (next) =>
                      update({ durationMilliseconds: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationMilliseconds,
                      0,
                      999,
                      (next) => update({ durationMilliseconds: next }),
                    )
                  }
                />
                <span className="adv-unit">ms</span>
              </div>
            </div>
          )}
        </div>
        {modeToggle}
      </div>
    </div>
  );
}
