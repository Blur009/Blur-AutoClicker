/**
 * Search over the settings UI.
 *
 * The index itself is generated from the section components by
 * `scripts/gen-settings-index.mjs`, so a new row is searchable without being
 * registered anywhere. This module only decides what matches: a query is split
 * into words, every word has to land somewhere in the entry (label, hint, card
 * or tab), and label matches outrank hint matches.
 */

export interface SettingsSearchEntry {
  tab: string;
  card: string | null;
  label: string;
  hint: string | null;
}

export interface SettingsSearchSegment {
  text: string;
  match: boolean;
}

export interface SettingsSearchResult extends SettingsSearchEntry {
  score: number;
  segments: SettingsSearchSegment[];
}

const WORD_START = /[\s\-_/(.,:]/;

/** Score one word against one piece of text, or null when it does not fit. */
function scoreWord(word: string, text: string): number | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  const needle = word.toLowerCase();
  if (needle.length === 0) return null;

  if (haystack === needle) return 1000;

  const at = haystack.indexOf(needle);
  if (at === 0) return 900 - haystack.length * 0.1;
  if (at > 0) {
    const wordStart = at === 0 || WORD_START.test(haystack[at - 1]);
    return (wordStart ? 800 : 700) - at - haystack.length * 0.1;
  }

  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found === -1) return null;
    const wordStart = found === 0 || WORD_START.test(haystack[found - 1]);
    streak = found === cursor ? streak + 1 : 0;
    score += 10 + (wordStart ? 6 : 0) + streak * 2;
    score -= Math.min(6, found - cursor) * 0.5;
    cursor = found + 1;
  }
  return score - haystack.length * 0.05;
}

/** Where the matched characters sit, so the label can show them emphasised. */
function matchSegments(
  label: string,
  words: string[],
): SettingsSearchSegment[] {
  const marks = new Array<boolean>(label.length).fill(false);
  const lower = label.toLowerCase();

  for (const word of words) {
    const needle = word.toLowerCase();
    if (needle.length === 0) continue;
    const at = lower.indexOf(needle);
    if (at >= 0) {
      for (let i = at; i < at + needle.length; i += 1) marks[i] = true;
      continue;
    }
    let cursor = 0;
    for (const character of needle) {
      const found = lower.indexOf(character, cursor);
      if (found === -1) break;
      marks[found] = true;
      cursor = found + 1;
    }
  }

  const segments: SettingsSearchSegment[] = [];
  for (let i = 0; i < label.length; i += 1) {
    const last = segments[segments.length - 1];
    if (last && last.match === marks[i]) last.text += label[i];
    else segments.push({ text: label[i], match: marks[i] });
  }
  return segments;
}

const FIELD_WEIGHTS = { label: 1, hint: 0.55, card: 0.45, tab: 0.35 } as const;

function scoreEntry(query: string, entry: SettingsSearchEntry): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  for (const word of words) {
    let best: number | null = null;
    for (const field of ["label", "hint", "card", "tab"] as const) {
      const text =
        field === "tab" ? entry.tab.replace(/-/g, " ") : entry[field];
      if (!text) continue;
      const score = scoreWord(word, text);
      if (score === null) continue;
      const weighted = score * FIELD_WEIGHTS[field];
      best = best === null ? weighted : Math.max(best, weighted);
    }
    if (best === null) return null;
    total += best;
  }

  // A whole-query hit on the label ("stop zones") beats two lucky words.
  const whole = scoreWord(query.toLowerCase(), entry.label);
  if (whole !== null) total += whole;
  return total;
}

export function searchSettings(
  index: readonly SettingsSearchEntry[],
  query: string,
  limit = 40,
): SettingsSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const results: SettingsSearchResult[] = [];
  for (const entry of index) {
    const score = scoreEntry(trimmed, entry);
    if (score === null) continue;
    results.push({
      ...entry,
      score,
      segments: matchSegments(entry.label, words),
    });
  }

  results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return results.slice(0, limit);
}
