export function normalizeIntegerRaw(raw: string) {
  if (raw === "-") {
    return raw;
  }

  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits}`;
}
