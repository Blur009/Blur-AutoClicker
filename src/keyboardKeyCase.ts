export function isAlphabeticKeyboardKey(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z]$/i.test(trimmed) || /^Key[A-Z]$/.test(trimmed);
}
