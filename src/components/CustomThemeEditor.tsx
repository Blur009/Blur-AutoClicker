import "./CustomThemeEditor.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomThemeColors } from "../store";
import { DEFAULT_SETTINGS } from "../store";
import ColorPickerInput from "./ColorPickerInput";
import {
  getAutoKofiStyle,
  THEME_PRESETS,
  validateRadius,
  sanitizeImportedTheme,
  fileToBackgroundDataUrl,
  type KofiStyle,
} from "../utils/theme";

type EditorMode = "basic" | "advanced";

interface Props {
  colors: CustomThemeColors;
  mode: EditorMode;
  onColorsChange: (c: CustomThemeColors) => void;
  onModeChange: (m: EditorMode) => void;
}

const UNDO_MS = 6000;
const TOAST_MS = 2500;
const DEFAULT_BG_OPACITY = 30;
const DEFAULT_BG_BLUR = 0;
const DEFAULT_PANEL_OPACITY = 100;
const MAX_BG_BLUR_PX = 10;

const KOFI_STYLES: readonly KofiStyle[] = ["1", "2", "3", "4", "5", "6"];
const KOFI_TITLES = ["Dark", "Yellow", "White", "Purple", "Blue", "Orange"];

const BASIC_FIELDS = [
  { key: "bgBase", label: "Background" },
  { key: "textPrimary", label: "Text Color" },
  { key: "accentGreen", label: "Green Accent" },
  { key: "accentYellow", label: "Yellow Accent" },
  { key: "accentRed", label: "Red Accent" },
] as const satisfies ReadonlyArray<{ key: keyof CustomThemeColors; label: string }>;

type AdvancedField =
  | { kind: "required"; key: keyof CustomThemeColors; label: string }
  | { kind: "optional"; key: keyof CustomThemeColors; label: string }
  | { kind: "radius"; key: keyof CustomThemeColors; label: string; placeholder: string };

interface AdvancedGroup {
  title: string;
  fields: AdvancedField[];
}

const ADVANCED_GROUPS: readonly AdvancedGroup[] = [
  {
    title: "Backgrounds",
    fields: [
      { kind: "required", key: "bgBase", label: "Base" },
      { kind: "optional", key: "bgSurface", label: "Surface" },
      { kind: "optional", key: "bgElevated", label: "Elevated" },
      { kind: "optional", key: "bgInput", label: "Input" },
      { kind: "optional", key: "bgInputOff", label: "Input Off" },
    ],
  },
  {
    title: "Borders",
    fields: [
      { kind: "optional", key: "border", label: "Border" },
      { kind: "optional", key: "borderFocus", label: "Border Focus" },
      { kind: "optional", key: "borderSubtle", label: "Border Subtle" },
    ],
  },
  {
    title: "Text",
    fields: [
      { kind: "required", key: "textPrimary", label: "Primary" },
      { kind: "optional", key: "textMuted", label: "Muted" },
      { kind: "optional", key: "textDim", label: "Dim" },
    ],
  },
  {
    title: "Accents",
    fields: [
      { kind: "required", key: "accentGreen", label: "Green" },
      { kind: "required", key: "accentYellow", label: "Yellow" },
      { kind: "required", key: "accentRed", label: "Red" },
    ],
  },
  {
    title: "Status",
    fields: [
      { kind: "optional", key: "statusSuccess", label: "Success" },
      { kind: "optional", key: "statusError", label: "Error" },
    ],
  },
  {
    title: "Radius",
    fields: [
      { kind: "radius", key: "radiusSm", label: "Small", placeholder: "0.375rem" },
      { kind: "radius", key: "radiusMd", label: "Medium", placeholder: "0.625rem" },
      { kind: "radius", key: "radiusLg", label: "Large", placeholder: "0.875rem" },
    ],
  },
];

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = useCallback((msg: string, ms = TOAST_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => setToast(null), ms);
  }, []);

  return { toast, show };
}

function useUndoSnapshot<T>() {
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const capture = useCallback((value: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSnapshot(value);
    timerRef.current = setTimeout(() => setSnapshot(null), UNDO_MS);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSnapshot(null);
  }, []);

  return { snapshot, capture, clear };
}

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

  const handleBlur = () => {
    if (validateRadius(text)) {
      setInvalid(false);
      onCommit(text);
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="color-picker-row">
      <span className="color-picker-label">{label}</span>
      <input
        type="text"
        className={`color-picker-text color-picker-text--full ${
          invalid ? "color-picker-text--invalid" : ""
        }`}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid) setInvalid(false);
        }}
        onBlur={handleBlur}
      />
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div className="color-picker-row">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-alpha">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="color-picker-alpha-range"
        />
        <span className="color-picker-alpha-value">{format(value)}</span>
      </div>
    </div>
  );
}

interface ModeToggleProps {
  mode: EditorMode;
  onChange: (m: EditorMode) => void;
  onReset: () => void;
}

function ModeToggle({ mode, onChange, onReset }: ModeToggleProps) {
  return (
    <div className="theme-mode-toggle">
      <div className="settings-seg-group">
        {(["basic", "advanced"] as const).map((m) => (
          <button
            key={m}
            className={`settings-seg-btn ${mode === m ? "active" : ""}`}
            onClick={() => onChange(m)}
          >
            {m === "basic" ? "Basic" : "Advanced"}
          </button>
        ))}
      </div>
      <button className="theme-reset-btn" onClick={onReset} title="Reset to defaults">
        Reset
      </button>
    </div>
  );
}

interface PresetGridProps {
  active: (preset: CustomThemeColors) => boolean;
  onPick: (preset: CustomThemeColors) => void;
}

function PresetGrid({ active, onPick }: PresetGridProps) {
  return (
    <div className="theme-presets">
      <span className="theme-presets-label">Presets</span>
      <div className="theme-presets-grid">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`theme-preset-btn${
              active(preset.colors) ? " theme-preset-btn--active" : ""
            }`}
            onClick={() => onPick(preset.colors)}
            title={`Apply ${preset.name}`}
          >
            <span
              className="theme-preset-swatch"
              style={{
                background: `linear-gradient(135deg, ${preset.colors.bgBase} 0 50%, ${preset.colors.accentGreen} 50% 100%)`,
                borderColor: preset.colors.textPrimary,
              }}
            />
            <span className="theme-preset-name">{preset.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface BasicEditorProps {
  colors: CustomThemeColors;
  onPatch: (patch: Partial<CustomThemeColors>) => void;
}

function BasicEditor({ colors, onPatch }: BasicEditorProps) {
  return (
    <div className="color-grid">
      {BASIC_FIELDS.map(({ key, label }) => (
        <ColorPickerInput
          key={key}
          label={label}
          value={(colors[key] as string) ?? ""}
          onChange={(v) => onPatch({ [key]: v })}
          allowAlpha
        />
      ))}
    </div>
  );
}

interface AdvancedEditorProps {
  colors: CustomThemeColors;
  onPatch: (patch: Partial<CustomThemeColors>) => void;
  onSetOptional: (key: keyof CustomThemeColors, value: string) => void;
}

function AdvancedEditor({ colors, onPatch, onSetOptional }: AdvancedEditorProps) {
  return (
    <div className="color-grid color-grid--advanced">
      {ADVANCED_GROUPS.map((group) => (
        <GroupSection
          key={group.title}
          group={group}
          colors={colors}
          onPatch={onPatch}
          onSetOptional={onSetOptional}
        />
      ))}
    </div>
  );
}

interface GroupSectionProps {
  group: AdvancedGroup;
  colors: CustomThemeColors;
  onPatch: (patch: Partial<CustomThemeColors>) => void;
  onSetOptional: (key: keyof CustomThemeColors, value: string) => void;
}

function GroupSection({ group, colors, onPatch, onSetOptional }: GroupSectionProps) {
  return (
    <>
      <div className="color-group-label">{group.title}</div>
      {group.fields.map((field) => {
        const current = (colors[field.key] as string | undefined) ?? "";
        if (field.kind === "required") {
          return (
            <ColorPickerInput
              key={field.key}
              label={field.label}
              value={current}
              onChange={(v) => onPatch({ [field.key]: v })}
              allowAlpha
            />
          );
        }
        if (field.kind === "optional") {
          return (
            <ColorPickerInput
              key={field.key}
              label={field.label}
              value={current}
              onChange={(v) => onSetOptional(field.key, v)}
              optional
              placeholder="auto"
              allowAlpha
            />
          );
        }
        return (
          <RadiusInput
            key={field.key}
            label={field.label}
            value={current}
            placeholder={field.placeholder}
            onCommit={(v) => onSetOptional(field.key, v)}
          />
        );
      })}
    </>
  );
}

interface BackgroundSectionProps {
  colors: CustomThemeColors;
  onColorsChange: (c: CustomThemeColors) => void;
  showToast: (msg: string) => void;
}

function BackgroundSection({ colors, onColorsChange, showToast }: BackgroundSectionProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const hasImage = Boolean(colors.backgroundImage);

  const pickImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("Only image files are supported");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToBackgroundDataUrl(file);
      onColorsChange({
        ...colors,
        backgroundImage: dataUrl,
        backgroundOpacity: colors.backgroundOpacity ?? DEFAULT_BG_OPACITY,
        backgroundBlur: colors.backgroundBlur ?? DEFAULT_BG_BLUR,
      });
      showToast("Background image saved");
    } catch (err) {
      console.error("Failed to load image:", err);
      showToast("Failed to load image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = () => {
    const next = { ...colors };
    delete next.backgroundImage;
    delete next.backgroundOpacity;
    delete next.backgroundBlur;
    onColorsChange(next);
  };

  return (
    <>
      <div className="color-group-label kofi-section-label">Background Image</div>
      <div className="bg-image-row">
        {hasImage ? (
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
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {hasImage ? "Change" : "Select image"}
          </button>
          {hasImage && (
            <button className="theme-io-btn" onClick={removeImage} disabled={busy}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickImage(file);
          }}
        />
      </div>

      {hasImage && (
        <>
          <SliderRow
            label="Opacity"
            value={colors.backgroundOpacity ?? DEFAULT_BG_OPACITY}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) =>
              onColorsChange({ ...colors, backgroundOpacity: Math.round(v) })
            }
          />
          <SliderRow
            label="Blur"
            value={colors.backgroundBlur ?? DEFAULT_BG_BLUR}
            min={0}
            max={MAX_BG_BLUR_PX}
            step={0.1}
            format={(v) => `${v.toFixed(1)}px`}
            onChange={(v) => onColorsChange({ ...colors, backgroundBlur: v })}
          />
        </>
      )}

      <SliderRow
        label="Panel opacity"
        value={colors.panelOpacity ?? DEFAULT_PANEL_OPACITY}
        min={0}
        max={100}
        step={1}
        format={(v) => `${Math.round(v)}%`}
        onChange={(v) => onColorsChange({ ...colors, panelOpacity: Math.round(v) })}
      />
    </>
  );
}

interface KofiSectionProps {
  colors: CustomThemeColors;
  onColorsChange: (c: CustomThemeColors) => void;
}

function KofiSection({ colors, onColorsChange }: KofiSectionProps) {
  const effective = colors.kofiStyle ?? getAutoKofiStyle(colors.bgBase);

  const pickAuto = () => {
    const next = { ...colors };
    delete next.kofiStyle;
    onColorsChange(next);
  };

  const getClass = (style: KofiStyle) => {
    if (colors.kofiStyle === style) return "kofi-option active";
    if (!colors.kofiStyle && effective === style) return "kofi-option auto-active";
    return "kofi-option";
  };

  return (
    <>
      <div className="color-group-label kofi-section-label">Ko-fi Button</div>
      <div className="color-picker-row">
        <span className="color-picker-label">Style</span>
        <div className="kofi-picker">
          <button
            className={`kofi-option kofi-option--auto ${!colors.kofiStyle ? "active" : ""}`}
            onClick={pickAuto}
            title="Auto"
          >
            Auto
          </button>
          {KOFI_STYLES.map((style, idx) => (
            <button
              key={style}
              className={getClass(style)}
              onClick={() => onColorsChange({ ...colors, kofiStyle: style })}
              title={KOFI_TITLES[idx]}
            >
              <img
                src={`https://storage.ko-fi.com/cdn/kofi${style}.png?v=6`}
                alt={`kofi${style}`}
                height="20"
              />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

interface ImportExportProps {
  colors: CustomThemeColors;
  onImport: (next: CustomThemeColors) => void;
  showToast: (msg: string) => void;
}

function ImportExport({ colors, onImport, showToast }: ImportExportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const copyTheme = async () => {
    // Strip image fields — DataURLs are per-device and can be megabytes.
    // Recipients can set their own background image after importing.
    const { backgroundImage: _bg, backgroundOpacity: _op, backgroundBlur: _bl, ...exportable } = colors;
    const json = JSON.stringify(exportable, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showToast("Copied theme to clipboard");
    } catch {
      showToast("Copy failed — clipboard unavailable");
    }
  };

  const downloadTheme = () => {
    // Download includes EVERYTHING (even the background image DataURL).
    const json = JSON.stringify(colors, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blur-theme-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Theme downloaded (Saved to Downloads folder)");
  };

  const applyImport = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("Invalid JSON");
      return;
    }
    const sanitized = sanitizeImportedTheme(parsed);
    if (!sanitized) {
      setError("Missing required colors");
      return;
    }
    onImport(sanitized);
    setText("");
    setOpen(false);
    showToast("Theme imported");
  };

  const pasteFromClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setError(null);
    } catch {
      setError("Clipboard unavailable — paste manually");
    }
  };

  return (
    <>
      <div className="theme-io">
        <button
          className="theme-io-btn"
          onClick={copyTheme}
          title="Copy theme colors to clipboard (No image)"
        >
          Copy
        </button>
        <button
          className="theme-io-btn"
          onClick={downloadTheme}
          title="Download full theme as file (Includes image)"
        >
          Download
        </button>
        <button
          className="theme-io-btn"
          onClick={() => {
            setOpen((prev) => !prev);
            setError(null);
          }}
        >
          {open ? "Cancel" : "Import"}
        </button>
      </div>

      {open && (
        <div className="theme-import-panel">
          <textarea
            className="theme-import-textarea"
            placeholder="Paste theme JSON here…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            rows={4}
          />
          {error && <div className="theme-import-error">{error}</div>}
          <div className="theme-import-actions">
            <button className="theme-io-btn" onClick={pasteFromClipboard}>
              From clipboard
            </button>
            <button
              className="theme-io-btn theme-io-btn--primary"
              onClick={applyImport}
              disabled={!text.trim()}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function isSamePreset(a: CustomThemeColors, b: CustomThemeColors): boolean {
  return (
    a.bgBase === b.bgBase &&
    a.textPrimary === b.textPrimary &&
    a.accentGreen === b.accentGreen &&
    a.accentYellow === b.accentYellow &&
    a.accentRed === b.accentRed
  );
}

export default function CustomThemeEditor({
  colors,
  mode,
  onColorsChange,
  onModeChange,
}: Props) {
  const { toast, show: showToast } = useToast();
  const { snapshot: undoSnap, capture: captureUndo, clear: clearUndo } =
    useUndoSnapshot<CustomThemeColors>();

  const patch = useCallback(
    (changes: Partial<CustomThemeColors>) => {
      onColorsChange({ ...colors, ...changes });
    },
    [colors, onColorsChange],
  );

  const setOptional = useCallback(
    (key: keyof CustomThemeColors, value: string) => {
      onColorsChange({ ...colors, [key]: value || undefined });
    },
    [colors, onColorsChange],
  );

  const handleReset = () => {
    captureUndo(colors);
    onColorsChange(DEFAULT_SETTINGS.customTheme);
  };

  const handlePreset = (preset: CustomThemeColors) => {
    captureUndo(colors);
    onColorsChange({ ...preset });
  };

  const handleImport = (next: CustomThemeColors) => {
    captureUndo(colors);
    onColorsChange(next);
  };

  const handleUndo = () => {
    if (!undoSnap) return;
    onColorsChange(undoSnap);
    clearUndo();
  };

  return (
    <div className="custom-theme-editor">
      <ModeToggle mode={mode} onChange={onModeChange} onReset={handleReset} />

      <PresetGrid
        active={(preset) => isSamePreset(colors, preset)}
        onPick={handlePreset}
      />

      {mode === "basic" ? (
        <BasicEditor colors={colors} onPatch={patch} />
      ) : (
        <AdvancedEditor
          colors={colors}
          onPatch={patch}
          onSetOptional={setOptional}
        />
      )}

      <div className="color-grid">
        <BackgroundSection
          colors={colors}
          onColorsChange={onColorsChange}
          showToast={showToast}
        />
        <KofiSection colors={colors} onColorsChange={onColorsChange} />
      </div>

      <ImportExport
        colors={colors}
        onImport={handleImport}
        showToast={showToast}
      />

      {undoSnap ? (
        <div className="theme-toast">
          <span>Theme changed</span>
          <button className="theme-toast-undo" onClick={handleUndo}>
            Undo
          </button>
        </div>
      ) : (
        toast && <div className="theme-toast theme-toast--info">{toast}</div>
      )}
    </div>
  );
}
