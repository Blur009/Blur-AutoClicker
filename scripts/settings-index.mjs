#!/usr/bin/env node
/*
 * Builds the settings search index from the section components themselves.
 *
 * The settings UI is hand-written JSX (one `div.settings-row` per setting), so
 * there is no registry to read. Rather than keep a second list in sync by hand,
 * this walks the section files and pulls out the label, the sub-label and the
 * card each row sits in. A new row is searchable as soon as it is saved.
 *
 * Rows rendered by a shared component (`<KeybindRow label={item.label}>`) get
 * their labels from the `label: "..."` object literals in the same file, so a
 * new data entry is picked up too.
 *
 * Run `npm run settings:index` after adding or renaming rows; `npm test` fails
 * when src/settingsSearchIndex.ts is stale.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SECTIONS_DIR = "src/components/panels/settings/sections";
const SKIP_FILES = new Set([
  "shared.tsx",
  "DevToolsSection.tsx",
  "UsageStats.tsx",
]);

/** Tabs in the order they appear in the sidebar. */
export const TAB_ORDER = [
  "general",
  "behavior",
  "appearance",
  "overlay",
  "sounds",
  "keybinds",
  "process-list",
  "presets",
  "maintenance",
];

/** `BehaviorSection` -> `behavior`, `ProcessListSection` -> `process-list`. */
export function tabForFile(file) {
  return file
    .replace(/Section\.tsx$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** JSX text between tags is static only when it has no expressions in it. */
function readStaticText(source, start) {
  const end = source.indexOf("</span>", start);
  if (end === -1) return null;
  const raw = source.slice(start, end);
  if (raw.includes("{") || raw.includes("}")) return null;
  const text = decodeEntities(raw.replace(/\s+/g, " ").trim());
  return text.length > 0 ? text : null;
}

function cardTitleBefore(source, index) {
  const open = source.lastIndexOf("<SettingsCard", index);
  if (open === -1) return null;
  const tag = source.slice(open, source.indexOf(">", open));
  const literal = /title="([^"]*)"/.exec(tag);
  if (literal) return decodeEntities(literal[1]);
  const expression = /title=\{`([^`$]*)`\}/.exec(tag);
  return expression ? decodeEntities(expression[1]) : null;
}

/** Labels that a shared row component receives as props. */
function literalLabels(source) {
  const found = [];
  // `sublabel:` also contains `label:`, so require a non-letter before it.
  const pattern = /[^\w]label:\s*"([^"]+)"/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const label = decodeEntities(match[1].trim());
    if (!label) continue;
    const window = source.slice(match.index, match.index + 400);
    const sublabel = /sublabel:\s*"([^"]+)"/.exec(window);
    found.push({
      label,
      hint: sublabel ? decodeEntities(sublabel[1].trim()) : null,
    });
  }
  return found;
}

export function buildIndex(root = process.cwd()) {
  const dir = join(root, SECTIONS_DIR);
  const entries = [];
  const seen = new Set();

  const push = (entry) => {
    const key = `${entry.tab}\u0000${entry.label}\u0000${entry.card ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".tsx") || SKIP_FILES.has(file)) continue;
    const tab = tabForFile(file);
    const source = readFileSync(join(dir, file), "utf8");

    const totalLabels = (source.match(/className="settings-label"/g) ?? [])
      .length;
    let staticLabels = 0;

    let cursor = 0;
    for (;;) {
      const at = source.indexOf('className="settings-label"', cursor);
      if (at === -1) break;
      cursor = at + 1;

      const textStart = source.indexOf(">", at);
      if (textStart === -1) continue;
      const label = readStaticText(source, textStart + 1);
      if (!label) continue;
      staticLabels += 1;

      const subAt = source.indexOf('className="settings-sublabel', textStart);
      let hint = null;
      if (subAt !== -1 && subAt - textStart < 900) {
        const subStart = source.indexOf(">", subAt);
        if (subStart !== -1) hint = readStaticText(source, subStart + 1);
      }

      push({ tab, card: cardTitleBefore(source, at), label, hint });
    }

    // Every row must be searchable. Rows built from expressions are covered by
    // the literal labels in the same file, so the counts only need to line up
    // in total.
    const dynamicLabels = totalLabels - staticLabels;
    if (dynamicLabels > 0) {
      for (const literal of literalLabels(source)) {
        push({ tab, card: null, label: literal.label, hint: literal.hint });
      }
      const covered = entries.filter((entry) => entry.tab === tab).length;
      if (covered < totalLabels) {
        throw new Error(
          `${file}: ${totalLabels} row labels but only ${covered} entries. ` +
            `A row is probably built from a shape this script does not read; ` +
            `extend scripts/settings-index.mjs.`,
        );
      }
    }
  }

  const tabRank = (tab) => {
    const rank = TAB_ORDER.indexOf(tab);
    return rank === -1 ? TAB_ORDER.length : rank;
  };
  entries.sort(
    (a, b) => tabRank(a.tab) - tabRank(b.tab) || a.label.localeCompare(b.label),
  );
  return entries;
}

export function renderIndex(entries) {
  const lines = entries.map(
    (entry) =>
      `  ${JSON.stringify({
        tab: entry.tab,
        card: entry.card,
        label: entry.label,
        hint: entry.hint,
      })},`,
  );
  return `// Generated by scripts/gen-settings-index.mjs. Do not edit by hand.
// Run \`npm run settings:index\` after adding or renaming a settings row.

import type { SettingsSearchEntry } from "./settingsSearch";

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
${lines.join("\n")}
];
`;
}
