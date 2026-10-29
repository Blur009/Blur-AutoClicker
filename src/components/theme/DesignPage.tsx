import {
  THEME_COLOR_TOKENS,
  THEME_GROUP_LABELS,
  THEME_PALETTES,
  type ThemeColor,
  type ThemeColorKey,
  type ThemeGroupId,
  type ThemeProfile,
  type ThemeShadow,
  type ThemeTokenMeta,
} from "../../themeModel";
import ColorTokenRow from "./ColorTokenRow";
import ShapeSection from "./ShapeSection";
import {
  themeValueEquals,
  type ThemeRadiusKey,
  type ThemeShadowKey,
} from "./themeEditorShared";

interface Props {
  profile: ThemeProfile;
  onColorChange: (key: ThemeColorKey, color: ThemeColor) => void;
  onRadiusChange: (key: ThemeRadiusKey, value: number) => void;
  onShadowChange: (key: ThemeShadowKey, shadow: ThemeShadow | null) => void;
  onResetTemplate: () => void;
}

interface TokenGroup {
  id: ThemeGroupId;
  label: string;
  tokens: readonly ThemeTokenMeta[];
}

const TOKEN_GROUPS: readonly TokenGroup[] = (
  Object.keys(THEME_GROUP_LABELS) as ThemeGroupId[]
)
  .map((id) => ({
    id,
    label: THEME_GROUP_LABELS[id],
    tokens: THEME_COLOR_TOKENS.filter((token) => token.group === id),
  }))
  .filter((group) => group.tokens.length > 0);

export default function DesignPage({
  profile,
  onColorChange,
  onRadiusChange,
  onShadowChange,
  onResetTemplate,
}: Props) {
  const palette = THEME_PALETTES[profile.base];

  return (
    <div className="theme-design">
      <div className="theme-design-actions">
        <button
          type="button"
          className="theme-btn theme-btn--primary"
          onClick={onResetTemplate}
          disabled={themeValueEquals(profile.tokens, palette)}
        >
          Reset all to defaults
        </button>
      </div>
      {TOKEN_GROUPS.map((group) => (
        <section
          className="theme-group"
          key={group.id}
          aria-labelledby={`theme-group-${group.id}`}
        >
          <h3 className="theme-group-title" id={`theme-group-${group.id}`}>
            {group.label}
          </h3>
          {group.tokens.map((meta) => (
            <ColorTokenRow
              key={meta.key}
              meta={meta}
              value={profile.tokens[meta.key]}
              template={palette[meta.key]}
              onChange={(color) => onColorChange(meta.key, color)}
            />
          ))}
        </section>
      ))}
      <ShapeSection
        base={profile.base}
        tokens={profile.tokens}
        onRadiusChange={onRadiusChange}
        onShadowChange={onShadowChange}
      />
    </div>
  );
}
