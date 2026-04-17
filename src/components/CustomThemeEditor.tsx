import "./CustomThemeEditor.css";
import { useEffect, useRef, useState } from "react";
import type { CustomThemeColors } from "../store";
import { DEFAULT_SETTINGS } from "../store";
import ColorPickerInput from "./ColorPickerInput";
import {
  getAutoKofiStyle,
  THEME_PRESETS,
  validateRadius,
  sanitizeImportedTheme,
  fileToBackgroundDataUrl,
} from "../utils/theme";

interface Props {
  colors: CustomThemeColors;
  mode: "basic" | "advanced";
  onColorsChange: (c: CustomThemeColors) => void;
  onModeChange: (m: "basic" | "advanced") => void;
}

const UNDO_MS = 6000;

interface RadiusInputProps {
  label: string;
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
}

function RadiusInput({ label, value, placeholder, onCommit }: RadiusInputProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  return (
    <div className="color-picker-row">
      <span className="color-picker-label">{label}</span>
      <input
        type="text"
        className={`color-picker-text color-picker-text--full ${invalid ? "color-picker-text--invalid" : ""}`}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid) setInvalid(false);
        }}
        onBlur={() => {
          if (validateRadius(text)) {
            setInvalid(false);
            onCommit(text);
          } else {
            setInvalid(true);
          }
        }}
      />
    </div>
  );
}

export default function CustomThemeEditor({
  colors,
  mode,
  onColorsChange,
  onModeChange,
}: Props) {
  const [undoSnap, setUndoSnap] = useState<CustomThemeColors | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const handleBgPick = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("Only image files are supported");
      return;
    }
    setBgBusy(true);
    try {
      const dataUrl = await fileToBackgroundDataUrl(file);
      onColorsChange({
        ...colors,
        backgroundImage: dataUrl,
        backgroundOpacity: colors.backgroundOpacity ?? 30,
        backgroundBlur: colors.backgroundBlur ?? 0,
      });
      showToast("Background image saved");
    } catch (err) {
      console.error("Failed to load image:", err);
      showToast("Failed to load image");
    } finally {
      setBgBusy(false);
      if (bgFileRef.current) bgFileRef.current.value = "";
    }
  };

  const handleBgRemove = () => {
    const { backgroundImage: _img, backgroundOpacity: _o, backgroundBlur: _b, ...rest } = colors;
    onColorsChange(rest as CustomThemeColors);
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string, ms = 2500) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };

  const startUndo = (snapshot: CustomThemeColors) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoSnap(snapshot);
    undoTimerRef.current = setTimeout(() => setUndoSnap(null), UNDO_MS);
  };

  const set = (key: keyof CustomThemeColors, value: string) => {
    onColorsChange({ ...colors, [key]: value || undefined });
  };

  const handleReset = () => {
    startUndo(colors);
    onColorsChange(DEFAULT_SETTINGS.customTheme);
  };

  const handleUndo = () => {
    if (!undoSnap) return;
    onColorsChange(undoSnap);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoSnap(null);
  };

  const isPresetActive = (presetColors: CustomThemeColors) =>
    colors.bgBase === presetColors.bgBase &&
    colors.textPrimary === presetColors.textPrimary &&
    colors.accentGreen === presetColors.accentGreen &&
    colors.accentYellow === presetColors.accentYellow &&
    colors.accentRed === presetColors.accentRed;

  const handlePreset = (presetColors: CustomThemeColors) => {
    startUndo(colors);
    onColorsChange({ ...presetColors });
  };

  const handleExport = async () => {
    const json = JSON.stringify(colors, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showToast("Copied theme to clipboard");
    } catch {
      showToast("Copy failed — clipboard unavailable");
    }
  };

  const handleImportApply = () => {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError("Invalid JSON");
      return;
    }
    const sanitized = sanitizeImportedTheme(parsed);
    if (!sanitized) {
      setImportError("Missing required colors");
      return;
    }
    startUndo(colors);
    onColorsChange(sanitized);
    setImportText("");
    setShowImport(false);
    showToast("Theme imported");
  };

  const handleImportFromClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      setImportText(txt);
      setImportError(null);
    } catch {
      setImportError("Clipboard unavailable — paste manually");
    }
  };

  const effectiveKofiStyle = colors.kofiStyle ?? getAutoKofiStyle(colors.bgBase);

  return (
    <div className="custom-theme-editor">
      <div className="theme-mode-toggle">
        <div className="settings-seg-group">
          {(["basic", "advanced"] as const).map((m) => (
            <button
              key={m}
              className={`settings-seg-btn ${mode === m ? "active" : ""}`}
              onClick={() => onModeChange(m)}
            >
              {m === "basic" ? "Basic" : "Advanced"}
            </button>
          ))}
        </div>
        <button
          className="theme-reset-btn"
          onClick={handleReset}
          title="Reset to defaults"
        >
          Reset
        </button>
      </div>

      <div className="theme-presets">
        <span className="theme-presets-label">Presets</span>
        <div className="theme-presets-grid">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              className={`theme-preset-btn${isPresetActive(p.colors) ? " theme-preset-btn--active" : ""}`}
              onClick={() => handlePreset(p.colors)}
              title={`Apply ${p.name}`}
            >
              <span
                className="theme-preset-swatch"
                style={{
                  background: `linear-gradient(135deg, ${p.colors.bgBase} 0 50%, ${p.colors.accentGreen} 50% 100%)`,
                  borderColor: p.colors.textPrimary,
                }}
              />
              <span className="theme-preset-name">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "basic" ? (
        <div className="color-grid">
          <ColorPickerInput
            label="Background"
            value={colors.bgBase}
            onChange={(v) => onColorsChange({ ...colors, bgBase: v })}
            allowAlpha
          />
          <ColorPickerInput
            label="Text Color"
            value={colors.textPrimary}
            onChange={(v) => onColorsChange({ ...colors, textPrimary: v })}
            allowAlpha
          />
          <ColorPickerInput
            label="Green Accent"
            value={colors.accentGreen}
            onChange={(v) => onColorsChange({ ...colors, accentGreen: v })}
            allowAlpha
          />
          <ColorPickerInput
            label="Yellow Accent"
            value={colors.accentYellow}
            onChange={(v) => onColorsChange({ ...colors, accentYellow: v })}
            allowAlpha
          />
          <ColorPickerInput
            label="Red Accent"
            value={colors.accentRed}
            onChange={(v) => onColorsChange({ ...colors, accentRed: v })}
            allowAlpha
          />
        </div>
      ) : (
        <div className="color-grid color-grid--advanced">
          <div className="color-group-label">Backgrounds</div>
          <ColorPickerInput label="Base" value={colors.bgBase} onChange={(v) => onColorsChange({ ...colors, bgBase: v })} allowAlpha />
          <ColorPickerInput label="Surface" value={colors.bgSurface ?? ""} onChange={(v) => set("bgSurface", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Elevated" value={colors.bgElevated ?? ""} onChange={(v) => set("bgElevated", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Input" value={colors.bgInput ?? ""} onChange={(v) => set("bgInput", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Input Off" value={colors.bgInputOff ?? ""} onChange={(v) => set("bgInputOff", v)} optional placeholder="auto" allowAlpha />

          <div className="color-group-label">Borders</div>
          <ColorPickerInput label="Border" value={colors.border ?? ""} onChange={(v) => set("border", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Border Focus" value={colors.borderFocus ?? ""} onChange={(v) => set("borderFocus", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Border Subtle" value={colors.borderSubtle ?? ""} onChange={(v) => set("borderSubtle", v)} optional placeholder="auto" allowAlpha />

          <div className="color-group-label">Text</div>
          <ColorPickerInput label="Primary" value={colors.textPrimary} onChange={(v) => onColorsChange({ ...colors, textPrimary: v })} allowAlpha />
          <ColorPickerInput label="Muted" value={colors.textMuted ?? ""} onChange={(v) => set("textMuted", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Dim" value={colors.textDim ?? ""} onChange={(v) => set("textDim", v)} optional placeholder="auto" allowAlpha />

          <div className="color-group-label">Accents</div>
          <ColorPickerInput label="Green" value={colors.accentGreen} onChange={(v) => onColorsChange({ ...colors, accentGreen: v })} allowAlpha />
          <ColorPickerInput label="Yellow" value={colors.accentYellow} onChange={(v) => onColorsChange({ ...colors, accentYellow: v })} allowAlpha />
          <ColorPickerInput label="Red" value={colors.accentRed} onChange={(v) => onColorsChange({ ...colors, accentRed: v })} allowAlpha />

          <div className="color-group-label">Status</div>
          <ColorPickerInput label="Success" value={colors.statusSuccess ?? ""} onChange={(v) => set("statusSuccess", v)} optional placeholder="auto" allowAlpha />
          <ColorPickerInput label="Error" value={colors.statusError ?? ""} onChange={(v) => set("statusError", v)} optional placeholder="auto" allowAlpha />

          <div className="color-group-label">Radius</div>
          <RadiusInput label="Small" value={colors.radiusSm ?? ""} placeholder="0.375rem" onCommit={(v) => set("radiusSm", v)} />
          <RadiusInput label="Medium" value={colors.radiusMd ?? ""} placeholder="0.625rem" onCommit={(v) => set("radiusMd", v)} />
          <RadiusInput label="Large" value={colors.radiusLg ?? ""} placeholder="0.875rem" onCommit={(v) => set("radiusLg", v)} />
        </div>
      )}

      <div className="color-grid">
        <div className="color-group-label kofi-section-label">Background Image</div>
        <div className="bg-image-row">
          {colors.backgroundImage ? (
            <div
              className="bg-image-preview"
              style={{ backgroundImage: `url("${colors.backgroundImage}")` }}
            />
          ) : (
            <div className="bg-image-preview bg-image-preview--empty">No image</div>
          )}
          <div className="bg-image-actions">
            <button
              className="theme-io-btn"
              onClick={() => bgFileRef.current?.click()}
              disabled={bgBusy}
            >
              {colors.backgroundImage ? "Change" : "Select image"}
            </button>
            {colors.backgroundImage && (
              <button
                className="theme-io-btn"
                onClick={handleBgRemove}
                disabled={bgBusy}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={bgFileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleBgPick(file);
            }}
          />
        </div>
        {colors.backgroundImage && (
          <>
            <div className="color-picker-row">
              <span className="color-picker-label">Opacity</span>
              <div className="color-picker-alpha">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={colors.backgroundOpacity ?? 30}
                  onChange={(e) =>
                    onColorsChange({
                      ...colors,
                      backgroundOpacity: parseInt(e.target.value, 10),
                    })
                  }
                  className="color-picker-alpha-range"
                />
                <span className="color-picker-alpha-value">
                  {colors.backgroundOpacity ?? 30}%
                </span>
              </div>
            </div>
            <div className="color-picker-row">
              <span className="color-picker-label">Blur</span>
              <div className="color-picker-alpha">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={colors.backgroundBlur ?? 0}
                  onChange={(e) =>
                    onColorsChange({
                      ...colors,
                      backgroundBlur: parseFloat(e.target.value),
                    })
                  }
                  className="color-picker-alpha-range"
                />
                <span className="color-picker-alpha-value">
                  {(colors.backgroundBlur ?? 0).toFixed(1)}px
                </span>
              </div>
            </div>
          </>
        )}
        <div className="color-picker-row">
          <span className="color-picker-label">Panel opacity</span>
          <div className="color-picker-alpha">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={colors.panelOpacity ?? 100}
              onChange={(e) =>
                onColorsChange({
                  ...colors,
                  panelOpacity: parseInt(e.target.value, 10),
                })
              }
              className="color-picker-alpha-range"
            />
            <span className="color-picker-alpha-value">
              {colors.panelOpacity ?? 100}%
            </span>
          </div>
        </div>
        <div className="color-group-label kofi-section-label">Ko-fi Button</div>
        <div className="color-picker-row">
          <span className="color-picker-label">Style</span>
          <div className="kofi-picker">
            <button
              className={`kofi-option kofi-option--auto ${!colors.kofiStyle ? "active" : ""}`}
              onClick={() => {
                const { kofiStyle: _k, ...rest } = colors;
                onColorsChange(rest as CustomThemeColors);
              }}
              title="Auto"
            >
              Auto
            </button>
            {(["1", "2", "3", "4", "5", "6"] as const).map((n) => (
              <button
                key={n}
                className={`kofi-option ${
                  colors.kofiStyle === n
                    ? "active"
                    : !colors.kofiStyle && effectiveKofiStyle === n
                    ? "auto-active"
                    : ""
                }`}
                onClick={() => onColorsChange({ ...colors, kofiStyle: n })}
                title={["Dark", "Yellow", "White", "Purple", "Blue", "Orange"][+n - 1]}
              >
                <img
                  src={`https://storage.ko-fi.com/cdn/kofi${n}.png?v=6`}
                  alt={`kofi${n}`}
                  height="20"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="theme-io">
        <button className="theme-io-btn" onClick={handleExport} title="Copy theme JSON to clipboard">
          Export
        </button>
        <button
          className="theme-io-btn"
          onClick={() => {
            setShowImport((s) => !s);
            setImportError(null);
          }}
        >
          {showImport ? "Cancel" : "Import"}
        </button>
      </div>

      {showImport && (
        <div className="theme-import-panel">
          <textarea
            className="theme-import-textarea"
            placeholder="Paste theme JSON here…"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              if (importError) setImportError(null);
            }}
            spellCheck={false}
            rows={4}
          />
          {importError && <div className="theme-import-error">{importError}</div>}
          <div className="theme-import-actions">
            <button className="theme-io-btn" onClick={handleImportFromClipboard}>
              From clipboard
            </button>
            <button
              className="theme-io-btn theme-io-btn--primary"
              onClick={handleImportApply}
              disabled={!importText.trim()}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {undoSnap && (
        <div className="theme-toast">
          <span>Theme changed</span>
          <button className="theme-toast-undo" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
      {!undoSnap && toast && <div className="theme-toast theme-toast--info">{toast}</div>}
    </div>
  );
}
