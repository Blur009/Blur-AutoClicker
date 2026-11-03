export interface ChangelogItem {
  text: string;
  subitems: string[];
}

export interface ChangelogSection {
  heading: string;
  items: ChangelogItem[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

import raw from "../CHANGELOG.md?raw";

export function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const blocks = raw.split(/\n(?=# v)/);

  for (const block of blocks) {
    const firstLine = block.match(/^# v([\d.]+)\s*-\s*(.+)/);
    if (!firstLine) continue;

    const version = firstLine[1];
    const date = firstLine[2].trim();
    const sections: ChangelogSection[] = [];
    const sectionBlocks = block.split(/\n(?=## )/);

    for (const sb of sectionBlocks) {
      const sectionLine = sb.match(/^## (.+)/);
      if (!sectionLine) continue;

      const heading = sectionLine[1];
      const items: ChangelogItem[] = [];

      for (const line of sb.split("\n")) {
        const itemMatch = line.match(/^(\s*)(\d+\.|-)\s+(.+)/);
        if (!itemMatch) continue;
        const [, indent, , text] = itemMatch;
        if (indent.length > 0) {
          items[items.length - 1]?.subitems.push(text);
          continue;
        }
        items.push({ text, subitems: [] });
      }

      if (items.length > 0) {
        sections.push({ heading, items });
      }
    }

    entries.push({ version, date, sections });
  }

  return entries;
}

export interface ChangelogDateInfo {
  /** The date as written in the entry, normalised to DD.MM.YYYY. */
  display: string;
  /** Whatever followed the date in the source, e.g. "(d.m.y)". */
  note: string | null;
  /** Whole days between the entry date and today, or null when unknown. */
  daysSince: number | null;
}

const DATE_DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(.*)$/;

/**
 * Reads the `DD.MM.YYYY` dates used in CHANGELOG.md. An entry that does not
 * start with one still renders: its text becomes the display value and no age
 * is shown, rather than the date disappearing from the popover.
 */
export function describeChangelogDate(
  raw: string,
  now: Date = new Date(),
): ChangelogDateInfo {
  const text = raw.trim();
  const match = DATE_DMY.exec(text);
  if (!match) {
    return { display: text, note: null, daysSince: null };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  const valid =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!valid) {
    return { display: text, note: null, daysSince: null };
  }

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - stamp) / 86_400_000);
  const note = match[4].trim();

  return {
    display: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`,
    note: note.length > 0 ? note : null,
    daysSince: days >= 0 ? days : null,
  };
}

export function formatDaysSince(days: number | null): string | null {
  if (days === null || !Number.isFinite(days)) return null;
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export const changelogEntries = parseChangelog(raw);
