export interface SettingsIndexEntry {
  tab: string;
  card: string | null;
  label: string;
  hint: string | null;
}

export const TAB_ORDER: string[];
export function tabForFile(file: string): string;
export function buildIndex(root?: string): SettingsIndexEntry[];
export function renderIndex(entries: readonly SettingsIndexEntry[]): string;
