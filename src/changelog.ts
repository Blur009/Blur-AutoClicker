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

export const changelogEntries = parseChangelog(raw);
