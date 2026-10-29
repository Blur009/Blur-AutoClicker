import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../diagnostics";
import { playClickerSound, type ClickerSoundKind } from "../soundPlayback";
import { SETTINGS_LIMITS } from "../settingsSchema";
import type { Settings } from "../store";
import "./FirstRunSetup.css";

const OVERLAY_SIZE_MIN = SETTINGS_LIMITS.indicatorSize.min;
const OVERLAY_SIZE_MAX = SETTINGS_LIMITS.indicatorSize.max;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onFinish: () => void;
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`first-run-toggle ${checked ? "on" : "off"}`}
      onClick={onChange}
    >
      <span className="first-run-toggle-knob" />
    </button>
  );
}

function VolumeRow({
  label,
  hint,
  volume,
  onVolumeChange,
  onPreview,
}: {
  label: string;
  hint: string;
  volume: number;
  onVolumeChange: (value: number) => void;
  onPreview: () => void;
}) {
  return (
    <div className="first-run-row">
      <div className="first-run-row-text">
        <span className="first-run-row-label">{label}</span>
        <span className="first-run-row-hint">{hint}</span>
      </div>
      <div className="first-run-row-controls">
        <input
          type="range"
          className="first-run-slider"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          aria-label={`${label} volume`}
        />
        <span className="first-run-value">{volume}%</span>
        <button type="button" className="first-run-btn" onClick={onPreview}>
          Preview
        </button>
      </div>
    </div>
  );
}

export default function FirstRunSetup({ settings, update, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const soundsOn = settings.enableSoundEnabled && settings.disableSoundEnabled;

  const toggleSounds = useCallback(() => {
    const next = !soundsOn;
    update({ enableSoundEnabled: next, disableSoundEnabled: next });
  }, [soundsOn, update]);

  const previewSound = useCallback(
    (kind: ClickerSoundKind) => {
      void playClickerSound(kind, {
        ...settings,
        soundMuted: false,
        enableSoundEnabled: true,
        disableSoundEnabled: true,
      });
    },
    [settings],
  );

  const previewOverlay = useCallback(() => {
    invoke("preview_indicator").catch((err) => {
      logDiagnostic("FirstRunSetup.previewOverlay", {
        error: String(err),
      });
    });
  }, []);

  const lastStep = step === 1;

  return (
    <section className="first-run" aria-label="First time setup">
      <header className="first-run-header">
        <div className="first-run-topline">
          <div className="first-run-steps" aria-hidden="true">
            <span className={`first-run-dot ${step === 0 ? "active" : ""}`} />
            <span className={`first-run-dot ${step === 1 ? "active" : ""}`} />
          </div>
          <span className="first-run-eyebrow">First-time setup</span>
          <span className="first-run-step">Step {step + 1} of 2</span>
        </div>
        <h2 className="first-run-title" tabIndex={-1} ref={headingRef}>
          {step === 0 ? "Sounds" : "Overlay"}
        </h2>
        <p className="first-run-lede">
          {step === 0
            ? "Start and Stop sounds"
            : `A small overlay in the ${settings.indicatorCorner} corner`}
        </p>
        <p className="first-run-note">
          Everything can be changed later in the settings.
        </p>
      </header>

      <div className="first-run-body">
        {step === 0 ? (
          <div className="first-run-card">
            <div className="first-run-row first-run-row--inline">
              <div className="first-run-row-text">
                <span className="first-run-row-label">Play sounds</span>
                <span className="first-run-row-hint">
                  Turns the start and stop sounds on or off together.
                </span>
              </div>
              <Toggle
                checked={soundsOn}
                label="Play sounds"
                onChange={toggleSounds}
              />
            </div>

            <VolumeRow
              label="Clicking starts"
              hint="Plays as clicking begins."
              volume={settings.enableSoundVolume}
              onVolumeChange={(value) => update({ enableSoundVolume: value })}
              onPreview={() => previewSound("enable")}
            />

            <VolumeRow
              label="Clicking stops"
              hint="Plays when clicking stops, failsafes included."
              volume={settings.disableSoundVolume}
              onVolumeChange={(value) => update({ disableSoundVolume: value })}
              onPreview={() => previewSound("disable")}
            />
          </div>
        ) : (
          <div className="first-run-card">
            <div className="first-run-row first-run-row--inline">
              <div className="first-run-row-text">
                <span className="first-run-row-label">Show the overlay</span>
                <span className="first-run-row-hint">
                  Appears in the corner you pick in Settings.
                </span>
              </div>
              <Toggle
                checked={settings.indicatorEnabled}
                label="Show the overlay"
                onChange={() =>
                  update({ indicatorEnabled: !settings.indicatorEnabled })
                }
              />
            </div>

            <div className="first-run-row">
              <div className="first-run-row-text">
                <span className="first-run-row-label">Overlay size</span>
                <span className="first-run-row-hint">
                  Sized in pixels. Changing it shows a preview on screen.
                </span>
              </div>
              <div className="first-run-row-controls">
                <input
                  type="range"
                  className="first-run-slider"
                  min={OVERLAY_SIZE_MIN}
                  max={OVERLAY_SIZE_MAX}
                  value={settings.indicatorSize}
                  disabled={!settings.indicatorEnabled}
                  onChange={(event) =>
                    update({ indicatorSize: Number(event.target.value) })
                  }
                  aria-label="Overlay size"
                />
                <span className="first-run-value">
                  {settings.indicatorSize} px
                </span>
                <button
                  type="button"
                  className="first-run-btn"
                  disabled={!settings.indicatorEnabled}
                  onClick={previewOverlay}
                >
                  Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="first-run-footer">
        <button type="button" className="first-run-skip" onClick={onFinish}>
          Skip setup
        </button>
        <div className="first-run-footer-actions">
          {step > 0 && (
            <button
              type="button"
              className="first-run-btn"
              onClick={() => setStep(0)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="first-run-btn first-run-btn--primary"
            onClick={lastStep ? onFinish : () => setStep(1)}
          >
            {lastStep ? "Done" : "Continue"}
          </button>
        </div>
      </footer>
    </section>
  );
}
