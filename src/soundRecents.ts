export const MAX_RECENT_SOUNDS = 12;

export function pushRecentSoundPath(
  paths: readonly string[],
  path: string,
): string[] {
  const trimmed = path.trim();
  if (!trimmed) return [...paths];
  const lower = trimmed.toLowerCase();
  const rest = paths.filter(
    (entry) => entry.trim().toLowerCase() !== lower && entry.trim().length > 0,
  );
  return [trimmed, ...rest].slice(0, MAX_RECENT_SOUNDS);
}

export function removeRecentSoundPath(
  paths: readonly string[],
  path: string,
): string[] {
  const target = path.trim().toLowerCase();
  return paths.filter((entry) => entry.trim().toLowerCase() !== target);
}

export function filterRecentSoundPaths(
  paths: readonly string[],
  query: string,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...paths];
  return paths.filter((path) => path.toLowerCase().includes(needle));
}

export function soundFileNameOf(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function soundFolderOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "" : path.slice(0, index);
}

export function sanitizeRecentSoundPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
    if (result.length >= MAX_RECENT_SOUNDS) break;
  }
  return result;
}
