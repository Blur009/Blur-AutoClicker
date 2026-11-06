import { describe, it, expect } from "vitest";
import {
  compareVersions,
  describeChangelogDate,
  formatDaysSince,
  parseChangelog,
} from "../changelog";

const sample = `# v3.9.2 - 14.08.2026 (d.m.y)

## New
- Added a preview button

## Fixed
- Fixed a crash on exit

# v3.9.1 - 21.07.2026 (d.m.y)

## Changed
- Faster click scheduling

# v2.0.0 - 01.01.2026 (d.m.y)

## Info

1. First release
2. Second bullet
`;

describe("parseChangelog", () => {
  it("parses versions and dates", () => {
    const entries = parseChangelog(sample);
    expect(entries.map((e) => e.version)).toEqual(["3.9.2", "3.9.1", "2.0.0"]);
    expect(entries[0].date).toBe("14.08.2026 (d.m.y)");
  });

  it("parses sections and items", () => {
    const [entry] = parseChangelog(sample);
    expect(entry.sections.map((s) => s.heading)).toEqual(["New", "Fixed"]);
    expect(entry.sections[0].items.map((item) => item.text)).toEqual([
      "Added a preview button",
    ]);
  });

  it("parses numbered items", () => {
    const entry = parseChangelog(sample)[2];
    expect(entry.sections[0].items.map((item) => item.text)).toEqual([
      "First release",
      "Second bullet",
    ]);
  });

  it("parses nested subpoints into their parent item", () => {
    const nested = `# v3.9.7 - 12.10.2026 (d.m.y)

## Changed

- Small UI improvements;
  - Removed the header.
  - Added an animation.
- Another change.
`;
    const [entry] = parseChangelog(nested);
    expect(entry.sections[0].items).toEqual([
      {
        text: "Small UI improvements;",
        subitems: ["Removed the header.", "Added an animation."],
      },
      { text: "Another change.", subitems: [] },
    ]);
  });

  it("drops sections with no matching items", () => {
    const empty = "# v1.0.0 - 01.01.2026\n\n## Info\n(no bullet here)\n";
    const entries = parseChangelog(empty);
    expect(entries[0].sections).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("compares simple versions", () => {
    expect(compareVersions("3.6.0", "3.9.2")).toBe(-1);
    expect(compareVersions("3.9.2", "3.6.0")).toBe(1);
    expect(compareVersions("3.9.2", "3.9.2")).toBe(0);
  });

  it("ignores leading v", () => {
    expect(compareVersions("v3.9.2", "3.9.1")).toBe(1);
    expect(compareVersions("3.9.1", "v3.9.2")).toBe(-1);
  });

  it("compares across segment lengths", () => {
    expect(compareVersions("3.9", "3.9.2")).toBe(-1);
    expect(compareVersions("3.9.2", "3.9")).toBe(1);
    expect(compareVersions("3", "3.0.0")).toBe(0);
  });

  it("handles non-numeric segments as zero", () => {
    expect(compareVersions("3.9.x", "3.9.2")).toBe(-1);
  });
});

describe("describeChangelogDate", () => {
  const now = new Date(2026, 10, 3, 15, 30);

  it("splits the date from the trailing note", () => {
    expect(describeChangelogDate("29.10.2026 (d.m.y)", now)).toEqual({
      display: "29.10.2026",
      note: "(d.m.y)",
      daysSince: 5,
    });
  });

  it("accepts a date without a note and pads single digits", () => {
    expect(describeChangelogDate("1.2.2026", now)).toEqual({
      display: "01.02.2026",
      note: null,
      daysSince: 275,
    });
  });

  it("counts whole days regardless of the time of day", () => {
    expect(
      describeChangelogDate("03.11.2026", new Date(2026, 10, 3, 0, 1))
        .daysSince,
    ).toBe(0);
    expect(
      describeChangelogDate("03.11.2026", new Date(2026, 10, 3, 23, 59))
        .daysSince,
    ).toBe(0);
    expect(
      describeChangelogDate("02.11.2026", new Date(2026, 10, 3, 0, 1))
        .daysSince,
    ).toBe(1);
  });

  it("shows an unparseable date as written and claims no age", () => {
    expect(describeChangelogDate("soon", now)).toEqual({
      display: "soon",
      note: null,
      daysSince: null,
    });
    expect(describeChangelogDate("31.02.2026", now)).toEqual({
      display: "31.02.2026",
      note: null,
      daysSince: null,
    });
  });

  it("does not report a negative age for a future date", () => {
    const info = describeChangelogDate("09.11.2026", now);
    expect(info.display).toBe("09.11.2026");
    expect(info.daysSince).toBeNull();
  });
});

describe("formatDaysSince", () => {
  it("reads like a person would say it", () => {
    expect(formatDaysSince(null)).toBeNull();
    expect(formatDaysSince(0)).toBe("today");
    expect(formatDaysSince(1)).toBe("1 day ago");
    expect(formatDaysSince(9)).toBe("9 days ago");
  });
});
