import { useEffect, useRef, useState } from "react";
import { themeColorSolid, type ThemeBase } from "../../themeModel";
import {
  THEME_PRESETS,
  THEME_PRESET_CATEGORIES,
  type ThemePreset,
} from "../../themePresets";

export type TemplateChoice = ThemeBase | ThemePreset;

interface Props {
  onPick: (choice: TemplateChoice) => void;
  onCancel: () => void;
}

interface BuiltInTemplate {
  base: ThemeBase;
  name: string;
  meta: string;
}

const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  { base: "dark", name: "Dark template", meta: "Built-in" },
  { base: "light", name: "Light template", meta: "Built-in" },
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matches(haystack: string, needle: string): boolean {
  return needle.length === 0 || normalize(haystack).includes(needle);
}

export default function TemplateChooser({ onPick, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [returnFocus] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const backdropPointerDownRef = useRef(false);
  const needle = normalize(query);

  const builtIns = BUILT_IN_TEMPLATES.filter((template) =>
    matches(`${template.name} ${template.meta}`, needle),
  );
  const groups = THEME_PRESET_CATEGORIES.map((category) => ({
    category,
    presets: THEME_PRESETS.filter(
      (preset) =>
        preset.category === category.id &&
        matches(`${preset.name} ${category.label} ${preset.base}`, needle),
    ),
  })).filter((group) => group.presets.length > 0);
  const empty = builtIns.length === 0 && groups.length === 0;
  const resultCount =
    builtIns.length +
    groups.reduce((total, group) => total + group.presets.length, 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);

  return (
    <div
      className="theme-chooser-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        backdropPointerDownRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          backdropPointerDownRef.current
        ) {
          onCancel();
        }
        backdropPointerDownRef.current = false;
      }}
    >
      <div
        className="theme-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="theme-chooser-title" id="theme-chooser-title">
          Start from a template
        </h2>
        <p className="theme-chooser-text">
          The template sets the starting colors. You can change every value
          afterwards.
        </p>
        <input
          className="theme-input theme-chooser-search"
          type="search"
          value={query}
          spellCheck={false}
          autoFocus
          placeholder="Search templates"
          aria-label="Search templates"
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="theme-chooser-status" role="status">
          {empty
            ? "No templates match that search."
            : `${resultCount} ${resultCount === 1 ? "template" : "templates"} available`}
        </p>
        <div className="theme-chooser-list">
          {builtIns.length > 0 && (
            <section
              className="theme-chooser-group"
              aria-labelledby="theme-chooser-group-built-in"
            >
              <h3
                className="theme-chooser-group-title"
                id="theme-chooser-group-built-in"
              >
                Built-in
              </h3>
              <div className="theme-chooser-rows">
                {builtIns.map((template) => (
                  <button
                    key={template.base}
                    type="button"
                    className="theme-btn theme-chooser-option"
                    onClick={() => onPick(template.base)}
                    aria-label={`Create theme from the ${template.base} template`}
                  >
                    <span
                      className={`theme-chooser-swatch theme-chooser-swatch--${template.base}`}
                      aria-hidden="true"
                    />
                    <span className="theme-chooser-option-text">
                      <span className="theme-chooser-option-name">
                        {template.name}
                      </span>
                      <span className="theme-chooser-option-meta">
                        {template.meta}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {groups.map(({ category, presets }) => (
            <section
              key={category.id}
              className="theme-chooser-group"
              aria-labelledby={`theme-chooser-group-${category.id}`}
            >
              <h3
                className="theme-chooser-group-title"
                id={`theme-chooser-group-${category.id}`}
              >
                {category.label}
              </h3>
              <div className="theme-chooser-rows">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="theme-btn theme-chooser-option"
                    onClick={() => onPick(preset)}
                    aria-label={`Create theme from ${preset.name}`}
                  >
                    <span
                      className="theme-chooser-swatch"
                      style={{
                        background: themeColorSolid(preset.tokens.bgSurface),
                      }}
                      aria-hidden="true"
                    >
                      <span
                        className="theme-chooser-swatch-dot"
                        style={{
                          background: themeColorSolid(preset.tokens.accent),
                        }}
                      />
                    </span>
                    <span className="theme-chooser-option-text">
                      <span className="theme-chooser-option-name">
                        {preset.name}
                      </span>
                      <span className="theme-chooser-option-meta">
                        {category.label} · {preset.base}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="theme-chooser-footer">
          <button
            type="button"
            className="theme-btn"
            onClick={onCancel}
            aria-label="Cancel new theme"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
