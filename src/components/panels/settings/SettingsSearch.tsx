import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SETTINGS_SEARCH_INDEX } from "../../../settingsSearchIndex";
import {
  searchSettings,
  type SettingsSearchResult,
} from "../../../settingsSearch";
import {
  lookFromPointer,
  lookTransform,
  type LookVector,
} from "../../../mascotLook";

const TAB_LABELS: Record<string, string> = {
  general: "General",
  behavior: "Behavior",
  appearance: "Appearance",
  overlay: "Overlay",
  sounds: "Sounds",
  keybinds: "Keybinds",
  "process-list": "Process list",
  presets: "Presets",
  maintenance: "Maintenance",
  dev: "Dev tools",
};

/** Only matched settings are rendered; nothing else follows the query. */
export function SettingsSearchResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (result: SettingsSearchResult) => void;
}) {
  const results = useMemo(
    () => searchSettings(SETTINGS_SEARCH_INDEX, query),
    [query],
  );

  if (results.length === 0) {
    return <SettingsSearchEmpty query={query} />;
  }

  return (
    <ul className="settings-search-results">
      {results.map((result) => (
        <li key={`${result.tab}:${result.label}:${result.card ?? ""}`}>
          <button
            type="button"
            className="settings-search-result"
            aria-label={`${result.label} (${TAB_LABELS[result.tab] ?? result.tab})`}
            onClick={() => onSelect(result)}
          >
            <span className="settings-search-result-main">
              <span className="settings-search-result-label">
                {result.segments.map((segment, i) =>
                  segment.match ? (
                    <mark key={i}>{segment.text}</mark>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )}
              </span>
              {result.hint && (
                <span className="settings-search-result-hint">
                  {result.hint}
                </span>
              )}
            </span>
            <span className="settings-search-result-badge">
              {TAB_LABELS[result.tab] ?? result.tab}
              {result.card ? ` · ${result.card}` : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SettingsSearchInput({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && query.length > 0) {
        onQueryChange("");
        inputRef.current?.blur();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if ((event.ctrlKey || event.metaKey) && event.key === "f" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query.length, onQueryChange]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
    [onQueryChange],
  );

  return (
    <div className="settings-search-field" data-focused={focused}>
      <svg
        className="settings-search-icon"
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="5" cy="5" r="3.4" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M7.7 7.7L11 11"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className="settings-search-input"
        placeholder="Search"
        aria-label="Search settings"
        value={query}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {query.length > 0 && (
        <button
          type="button"
          className="settings-search-clear"
          aria-label="Clear search"
          onClick={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Nothing found: the mascot looks at the pointer while it says so. */
function SettingsSearchEmpty({ query }: { query: string }) {
  const [look, setLook] = useState<LookVector>({ x: 0, y: 0 });
  const mascotRef = useRef<HTMLImageElement>(null);

  return (
    <div
      className="settings-search-empty"
      role="status"
      aria-live="polite"
      onMouseMove={(event) => {
        const node = mascotRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        setLook(lookFromPointer(rect, event.clientX, event.clientY));
      }}
      onMouseLeave={() => setLook({ x: 0, y: 0 })}
    >
      <img
        ref={mascotRef}
        className="settings-search-empty-mascot"
        src="/mascot-cat.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ transform: lookTransform(look) }}
      />
      <span className="settings-search-empty-title">
        No setting matches &ldquo;{query.trim()}&rdquo;
      </span>
      <span className="settings-search-empty-hint">
        Try a different word, or press Esc to clear the search.
      </span>
    </div>
  );
}
