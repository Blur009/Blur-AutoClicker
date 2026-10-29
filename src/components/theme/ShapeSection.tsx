import {
  THEME_PALETTES,
  type ThemeBase,
  type ThemeShadow,
  type ThemeTokens,
} from "../../themeModel";
import NumberField from "./NumberField";
import ResetButton from "./ResetButton";
import {
  themeValueEquals,
  type ThemeRadiusKey,
  type ThemeShadowKey,
} from "./themeEditorShared";

interface RadiusField {
  key: ThemeRadiusKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

interface ShadowField {
  field: keyof ThemeShadow;
  label: string;
  min: number;
  max: number;
  step: number;
  scale?: number;
  unit?: string;
}

interface Props {
  base: ThemeBase;
  tokens: ThemeTokens;
  onRadiusChange: (key: ThemeRadiusKey, value: number) => void;
  onShadowChange: (key: ThemeShadowKey, shadow: ThemeShadow | null) => void;
}

const RADIUS_FIELDS: readonly RadiusField[] = [
  {
    key: "radiusSmRem",
    label: "Small radius",
    min: 0,
    max: 2,
    step: 0.0625,
    unit: "rem",
  },
  {
    key: "radiusMdRem",
    label: "Medium radius",
    min: 0,
    max: 2.5,
    step: 0.0625,
    unit: "rem",
  },
  {
    key: "radiusLgRem",
    label: "Large radius",
    min: 0,
    max: 3,
    step: 0.0625,
    unit: "rem",
  },
  {
    key: "radiusWindowPx",
    label: "Window corner",
    min: 0,
    max: 32,
    step: 1,
    unit: "px",
  },
];

const SHADOW_FIELDS: readonly ShadowField[] = [
  { field: "offsetY", label: "Vertical offset", min: -16, max: 40, step: 1 },
  { field: "blur", label: "Blur", min: 0, max: 96, step: 1 },
  {
    field: "alpha",
    label: "Alpha",
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    unit: "%",
  },
];

const SHADOW_KEYS: readonly {
  key: ThemeShadowKey;
  label: string;
  fallback: ThemeShadow;
}[] = [
  {
    key: "shadowContainer",
    label: "Container shadow",
    fallback: { offsetY: 2, blur: 8, alpha: 0.3 },
  },
  {
    key: "shadowModal",
    label: "Modal shadow",
    fallback: { offsetY: 20, blur: 60, alpha: 0.6 },
  },
];

export default function ShapeSection({
  base,
  tokens,
  onRadiusChange,
  onShadowChange,
}: Props) {
  const palette = THEME_PALETTES[base];

  const enableShadow = (key: ThemeShadowKey, fallback: ThemeShadow) => {
    onShadowChange(key, { ...(palette[key] ?? fallback) });
  };

  return (
    <section className="theme-group" aria-labelledby="theme-shape-title">
      <h3 className="theme-group-title" id="theme-shape-title">
        Shape
      </h3>
      <div className="theme-number-list">
        {RADIUS_FIELDS.map((field) => (
          <div className="theme-number-row" key={field.key}>
            <label htmlFor={`theme-${field.key}`}>{field.label}</label>
            <NumberField
              id={`theme-${field.key}`}
              value={tokens[field.key]}
              min={field.min}
              max={field.max}
              step={field.step}
              describedBy={`theme-${field.key}-unit`}
              onChange={(value) => onRadiusChange(field.key, value)}
            />
            <span className="theme-unit" id={`theme-${field.key}-unit`}>
              {field.unit}
            </span>
            <ResetButton
              label={`Reset ${field.label}`}
              disabled={tokens[field.key] === palette[field.key]}
              onClick={() => onRadiusChange(field.key, palette[field.key])}
            />
          </div>
        ))}
      </div>
      <div className="theme-shadow-list">
        {SHADOW_KEYS.map((shadowMeta) => {
          const shadow = tokens[shadowMeta.key];
          const template = palette[shadowMeta.key];
          const enabled = shadow !== null;
          return (
            <div className="theme-shadow" key={shadowMeta.key}>
              <div className="theme-toggle-row">
                <span className="theme-shadow-title">{shadowMeta.label}</span>
                <button
                  type="button"
                  className="theme-toggle"
                  aria-pressed={enabled}
                  aria-label={shadowMeta.label}
                  onClick={() => {
                    if (enabled) {
                      onShadowChange(shadowMeta.key, null);
                    } else {
                      enableShadow(shadowMeta.key, shadowMeta.fallback);
                    }
                  }}
                />
                <ResetButton
                  label={`Reset ${shadowMeta.label}`}
                  disabled={themeValueEquals(shadow, template)}
                  onClick={() =>
                    onShadowChange(
                      shadowMeta.key,
                      template ? { ...template } : null,
                    )
                  }
                />
              </div>
              {shadow && (
                <div className="theme-shadow-fields">
                  {SHADOW_FIELDS.map((field) => (
                    <div className="theme-shadow-field" key={field.field}>
                      <label htmlFor={`theme-${shadowMeta.key}-${field.field}`}>
                        {field.label}
                      </label>
                      <NumberField
                        id={`theme-${shadowMeta.key}-${field.field}`}
                        value={Number(
                          (shadow[field.field] * (field.scale ?? 1)).toFixed(2),
                        )}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        describedBy={
                          field.unit
                            ? `theme-${shadowMeta.key}-${field.field}-unit`
                            : undefined
                        }
                        onChange={(value) =>
                          onShadowChange(shadowMeta.key, {
                            ...shadow,
                            [field.field]: value / (field.scale ?? 1),
                          })
                        }
                      />
                      {field.unit && (
                        <span
                          className="theme-unit"
                          id={`theme-${shadowMeta.key}-${field.field}-unit`}
                        >
                          {field.unit}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
