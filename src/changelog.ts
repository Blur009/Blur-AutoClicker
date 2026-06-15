export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

import raw from '../CHANGELOG.md?raw';

function parseChangelog(raw: string): ChangelogEntry[] {
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
      const items: string[] = [];

      for (const line of sb.split('\n')) {
        const itemMatch = line.match(/^(\d+\.|-)\s(.+)/);
        if (itemMatch) items.push(itemMatch[2]);
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
