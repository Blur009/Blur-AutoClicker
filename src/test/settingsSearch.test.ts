import { describe, expect, it } from "vitest";
import { searchSettings, type SettingsSearchEntry } from "../settingsSearch";
import { SETTINGS_SEARCH_INDEX } from "../settingsSearchIndex";
import { buildIndex } from "../../scripts/settings-index.mjs";

const index: SettingsSearchEntry[] = [
  {
    tab: "behavior",
    card: "Behavior",
    label: "Always on Top",
    hint: "Keep the window above others.",
  },
  {
    tab: "overlay",
    card: "Indicator",
    label: "Flash On Click",
    hint: "Show a flash each time the clicker fires.",
  },
  {
    tab: "appearance",
    card: "Window",
    label: "Window Opacity",
    hint: "How transparent the window is.",
  },
  {
    tab: "keybinds",
    card: null,
    label: "Custom Stop Zones",
    hint: "Toggle custom stop zones on or off.",
  },
];

const labels = (query: string) =>
  searchSettings(index, query).map((result) => result.label);

describe("searchSettings", () => {
  it("returns nothing without a query", () => {
    expect(searchSettings(index, "")).toEqual([]);
    expect(searchSettings(index, "   ")).toEqual([]);
  });

  it("matches whole words regardless of case", () => {
    expect(labels("opacity")).toEqual(["Window Opacity"]);
    expect(labels("OPACITY")).toEqual(["Window Opacity"]);
  });

  it("matches letters in order, not just substrings", () => {
    expect(labels("wndw")).toContain("Window Opacity");
    expect(labels("flsh")).toContain("Flash On Click");
  });

  it("finds words from the hint, ranked below label matches", () => {
    const results = searchSettings(index, "transparent");
    expect(results.map((r) => r.label)).toEqual(["Window Opacity"]);
  });

  it("requires every word to land somewhere", () => {
    expect(labels("stop zones")).toEqual(["Custom Stop Zones"]);
    expect(labels("stop opacity")).toEqual([]);
  });

  it("drops everything that does not match", () => {
    const results = searchSettings(index, "flash");
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("Flash On Click");
  });

  it("marks the characters that matched", () => {
    const [result] = searchSettings(index, "flash");
    const matched = result.segments
      .filter((segment) => segment.match)
      .map((segment) => segment.text)
      .join("");
    expect(matched.toLowerCase()).toBe("flash");
  });

  it("respects the result limit", () => {
    expect(searchSettings(index, "o", 2)).toHaveLength(2);
  });
});

describe("settings search index", () => {
  it("is up to date with the section components", () => {
    expect(SETTINGS_SEARCH_INDEX).toEqual(buildIndex());
  });

  it("covers every tab that has settings", () => {
    const tabs = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.tab));
    for (const tab of [
      "general",
      "behavior",
      "appearance",
      "overlay",
      "sounds",
      "keybinds",
      "process-list",
      "presets",
      "maintenance",
    ]) {
      expect(tabs.has(tab), `${tab} has no indexed settings`).toBe(true);
    }
  });

  it("carries labels but never empty ones", () => {
    for (const entry of SETTINGS_SEARCH_INDEX) {
      expect(entry.label.trim().length).toBeGreaterThan(1);
    }
  });
});
