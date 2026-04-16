import "./CustomThemeEditor.css";
import type { CustomThemeColors } from "../store";
import ColorPickerInput from "./ColorPickerInput";

interface Props {
  colors: CustomThemeColors;
  mode: "basic" | "advanced";
  onColorsChange: (c: CustomThemeColors) => void;
  onModeChange: (m: "basic" | "advanced") => void;
}

export default function CustomThemeEditor({ colors, mode, onColorsChange, onModeChange }: Props) {
  const set = (key: keyof CustomThemeColors, value: string) => {
    onColorsChange({ ...colors, [key]: value || undefined });
  };

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
      </div>

      {mode === "basic" ? (
        <div className="color-grid">
          <ColorPickerInput
            label="Background"
            value={colors.bgBase}
            onChange={(v) => onColorsChange({ ...colors, bgBase: v })}
          />
          <ColorPickerInput
            label="Text Color"
            value={colors.textPrimary}
            onChange={(v) => onColorsChange({ ...colors, textPrimary: v })}
          />
          <ColorPickerInput
            label="Green Accent"
            value={colors.accentGreen}
            onChange={(v) => onColorsChange({ ...colors, accentGreen: v })}
          />
          <ColorPickerInput
            label="Yellow Accent"
            value={colors.accentYellow}
            onChange={(v) => onColorsChange({ ...colors, accentYellow: v })}
          />
          <ColorPickerInput
            label="Red Accent"
            value={colors.accentRed}
            onChange={(v) => onColorsChange({ ...colors, accentRed: v })}
          />
        </div>
      ) : (
        <div className="color-grid color-grid--advanced">
          <div className="color-group-label">Backgrounds</div>
          <ColorPickerInput label="Base" value={colors.bgBase} onChange={(v) => onColorsChange({ ...colors, bgBase: v })} />
          <ColorPickerInput label="Surface" value={colors.bgSurface ?? ""} onChange={(v) => set("bgSurface", v)} optional placeholder="auto" />
          <ColorPickerInput label="Elevated" value={colors.bgElevated ?? ""} onChange={(v) => set("bgElevated", v)} optional placeholder="auto" />
          <ColorPickerInput label="Input" value={colors.bgInput ?? ""} onChange={(v) => set("bgInput", v)} optional placeholder="auto" />
          <ColorPickerInput label="Input Off" value={colors.bgInputOff ?? ""} onChange={(v) => set("bgInputOff", v)} optional placeholder="auto" />

          <div className="color-group-label">Borders</div>
          <ColorPickerInput label="Border" value={colors.border ?? ""} onChange={(v) => set("border", v)} optional placeholder="auto" />
          <ColorPickerInput label="Border Focus" value={colors.borderFocus ?? ""} onChange={(v) => set("borderFocus", v)} optional placeholder="auto" />
          <ColorPickerInput label="Border Subtle" value={colors.borderSubtle ?? ""} onChange={(v) => set("borderSubtle", v)} optional placeholder="auto" />

          <div className="color-group-label">Text</div>
          <ColorPickerInput label="Primary" value={colors.textPrimary} onChange={(v) => onColorsChange({ ...colors, textPrimary: v })} />
          <ColorPickerInput label="Muted" value={colors.textMuted ?? ""} onChange={(v) => set("textMuted", v)} optional placeholder="auto" />
          <ColorPickerInput label="Dim" value={colors.textDim ?? ""} onChange={(v) => set("textDim", v)} optional placeholder="auto" />

          <div className="color-group-label">Accents</div>
          <ColorPickerInput label="Green" value={colors.accentGreen} onChange={(v) => onColorsChange({ ...colors, accentGreen: v })} />
          <ColorPickerInput label="Yellow" value={colors.accentYellow} onChange={(v) => onColorsChange({ ...colors, accentYellow: v })} />
          <ColorPickerInput label="Red" value={colors.accentRed} onChange={(v) => onColorsChange({ ...colors, accentRed: v })} />

          <div className="color-group-label">Status</div>
          <ColorPickerInput label="Success" value={colors.statusSuccess ?? ""} onChange={(v) => set("statusSuccess", v)} optional placeholder="auto" />
          <ColorPickerInput label="Error" value={colors.statusError ?? ""} onChange={(v) => set("statusError", v)} optional placeholder="auto" />

          <div className="color-group-label">Radius</div>
          <div className="color-picker-row">
            <span className="color-picker-label">Small</span>
            <input
              type="text"
              className="color-picker-text color-picker-text--full"
              value={colors.radiusSm ?? ""}
              placeholder="0.375rem"
              onChange={(e) => set("radiusSm", e.target.value)}
            />
          </div>
          <div className="color-picker-row">
            <span className="color-picker-label">Medium</span>
            <input
              type="text"
              className="color-picker-text color-picker-text--full"
              value={colors.radiusMd ?? ""}
              placeholder="0.625rem"
              onChange={(e) => set("radiusMd", e.target.value)}
            />
          </div>
          <div className="color-picker-row">
            <span className="color-picker-label">Large</span>
            <input
              type="text"
              className="color-picker-text color-picker-text--full"
              value={colors.radiusLg ?? ""}
              placeholder="0.875rem"
              onChange={(e) => set("radiusLg", e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
